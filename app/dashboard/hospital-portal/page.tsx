import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serializeData } from "@/lib/utils";
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

  const personalId = parseInt(String(user.id), 10);
  let rawHospitalId: number | undefined = undefined;

  // 1. Prioritize imPersonalEmpresas intermediate table
  if (!isNaN(personalId)) {
    const pe = await prisma.imPersonalEmpresas.findFirst({
      where: { idPersonal: personalId },
    });
    if (pe) {
      rawHospitalId = pe.idEmpresa;
    }
  }

  // Fallback to user.hospitalId
  if (!rawHospitalId && user.hospitalId) {
    const parsed = parseInt(String(user.hospitalId), 10);
    if (!isNaN(parsed)) {
      rawHospitalId = parsed;
    }
  }

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
            Su usuario no tiene un establecimiento válido asignado en la tabla <strong>EMPRESAS</strong> (ID configurado: {user?.hospitalId ?? "ninguno"}).
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

  // 3. Find liquidations and agents that belong to this hospital in parallel
  const [hospitalLiquidations, agents] = await Promise.all([
    prisma.liquidacion.findMany({
      where: {
        details: {
          some: {
            OR: [
              { hospitalId: hospitalId },
              { compra: { hospitalId: hospitalId } },
              ...(hospitalName ? [{ prestadorNombre: { contains: hospitalName } }] : []),
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
            agent: true,
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agente.findMany({
      where: { hospitalId },
      orderBy: { nombre: "asc" },
    }),
  ]);

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
