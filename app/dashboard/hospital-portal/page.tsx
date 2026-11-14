import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serializeData } from "@/lib/utils";
import { cleanCuit } from "@/lib/hospital-mapping";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import HospitalPortalClient from "./hospital-portal-client";
import { Building2 } from "lucide-react";

export const revalidate = 0;

export default async function HospitalPortalPage() {
  // 1. Get authenticated user session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;
  const userRoles = String(user?.role || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const isAdmin = userRoles.includes("1");

  // EMPRESA del usuario: imPersonalEmpresas, o imPersonal.hospitalId (IDPROVEEDOR) -> EMPRESA validada por CUIT
  const rawHospitalId: number | undefined = await resolveUserEmpresaId(user);

  // If admin user without a specific hospitalId, redirect to full dashboard
  if (isAdmin && (!rawHospitalId || isNaN(rawHospitalId))) {
    redirect("/dashboard");
  }

  // 2. Fetch the hospital/empresa info
  const hospital = (rawHospitalId && !isNaN(rawHospitalId))
    ? await prisma.empresa.findUnique({
        where: { id: rawHospitalId },
      })
    : null;

  // Gracefully handle if establishment is not found in EMPRESAS (avoids infinite redirect loop)
  if (!hospital) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 text-foreground">
        <div className="rounded-full bg-amber-500/10 p-4 border border-amber-500/20 text-amber-500">
          <Building2 className="h-10 w-10" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold tracking-tight">Establecimiento no Asignado</h2>
          <p className="text-sm text-muted-foreground">
            Su usuario no tiene un establecimiento válido asignado en la tabla <strong>EMPRESAS</strong> (no se pudo resolver por CUIT desde el proveedor configurado: {user?.hospitalId ?? "ninguno"}).
          </p>
          <p className="text-xs text-muted-foreground">
            Por favor, comuníquese con el administrador para verificar y asignar su efector sanitario en la sección de Gestión de Usuarios.
          </p>
        </div>
      </div>
    );
  }

  const hospitalId = hospital.id;
  const hospitalName = hospital.descripcion?.trim() || "";
  const hospitalCuit = cleanCuit(hospital.cuit);

  // Buscar proveedores vinculados a este CUIT para relacionar las compras y renglones de liquidación
  const matchingProveedores = hospitalCuit
    ? await prisma.proveedor.findMany({
        where: {
          cuit: Number(hospitalCuit),
        },
        select: { id: true },
      })
    : [];
  const proveedorIds = matchingProveedores.map((p) => p.id);

  // 3. Find liquidations and agents that belong to this hospital in parallel (cruce EXCLUSIVO por CUIT)
  const [hospitalLiquidationsRaw, agents, empresaCuils] = await Promise.all([
    hospitalCuit
      ? prisma.liquidacion.findMany({
      where: {
        details: {
          some: {
            OR: [
              { cuit: hospitalCuit },
              ...(proveedorIds.length > 0
                ? [
                    { hospitalId: { in: proveedorIds } },
                    { compra: { hospitalId: { in: proveedorIds } } },
                  ]
                : []),
            ],
          },
        },
      },
      include: {
        period: true,
        rc: {
          include: {
            cliente: true,
          },
        },
        details: {
          include: {
            hospital: true,
            compra: true,
          },
        },
        distributions: {
          include: {
            agent: {
              include: { hospital: true },
            },
          },
        },
        personalDistributions: true,
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })
      : Promise.resolve([]),
    // Agentes legacy: Agente.hospitalId referencia a PROVEEDORES, por eso se usan los proveedores resueltos por CUIT
    proveedorIds.length > 0
      ? prisma.agente.findMany({
          where: { hospitalId: { in: proveedorIds } },
          orderBy: { nombre: "asc" },
        })
      : Promise.resolve([]),
    // Nómina SISPER de TODAS las Empresas con el mismo CUIT del efector
    hospitalCuit
      ? prisma.imPersonalMsp.findMany({
          where: { empresa: { cuit: Number(hospitalCuit) } },
          select: { cuil: true },
        })
      : Promise.resolve([]),
  ]);

  // Aislamiento por CUIT: el hospital solo ve las distribuciones de su propio personal y sus propios renglones
  const hospitalCuilSet = new Set(
    empresaCuils.map((a) => (a.cuil ? a.cuil.toString() : "")).filter(Boolean)
  );
  const matchesHospitalCuit = (raw: any) => {
    const c = cleanCuit(raw);
    return Boolean(hospitalCuit && c && c === hospitalCuit);
  };
  const hospitalLiquidations = hospitalLiquidationsRaw.map((liq: any) => ({
    ...liq,
    personalDistributions: (liq.personalDistributions || []).filter((p: any) =>
      hospitalCuilSet.has(String(p.cuil))
    ),
    distributions: (liq.distributions || []).filter((d: any) => matchesHospitalCuit(d.agent?.hospital?.cuit)),
  }));

  // Server Action to add an attachment
  const handleAddAttachment = async (formData: FormData) => {
    "use server";
    const liquidationIdStr = formData.get("liquidationId") as string;
    const fileName = formData.get("fileName") as string;
    const fileUrl = formData.get("fileUrl") as string;

    if (!liquidationIdStr || !fileName || !fileUrl) return;
    const liquidationId = parseInt(liquidationIdStr, 10);

    try {
      await prisma.adjunto.create({
        data: {
          liquidationId,
          fileName,
          fileUrl,
        },
      });
      revalidatePath("/dashboard/hospital-portal");
    } catch (e) {
      console.error("Error creating attachment:", e);
    }
  };

  return (
    <HospitalPortalClient
      hospital={serializeData(hospital)}
      hospitalId={hospitalId}
      initialLiquidations={serializeData(hospitalLiquidations)}
      agents={serializeData(agents)}
      onAddAttachment={handleAddAttachment}
    />
  );
}
