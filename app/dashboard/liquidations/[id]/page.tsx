import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { fetchLiquidationById } from "../actions";
import LiquidationDetailClient from "./liquidation-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 0;

export default async function LiquidationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const liqId = parseInt(id, 10);
  if (isNaN(liqId)) {
    notFound();
  }

  const [liquidation, session] = await Promise.all([
    fetchLiquidationById(liqId),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!liquidation) {
    notFound();
  }

  const user = session?.user as any;
  const isHospitalUser = user?.role !== "1";

  let targetEmpresaId: number | undefined = undefined;

  if (user?.id) {
    const personalId = parseInt(String(user.id), 10);
    if (!isNaN(personalId)) {
      const personalEmpresa = await prisma.imPersonalEmpresas.findFirst({
        where: { idPersonal: personalId },
      });
      if (personalEmpresa) {
        targetEmpresaId = personalEmpresa.idEmpresa;
      }
    }
  }

  if (!targetEmpresaId && user?.hospitalId) {
    const hospId = parseInt(String(user.hospitalId), 10);
    const empresa = await prisma.empresa.findUnique({ where: { id: hospId } });
    if (empresa) {
      targetEmpresaId = empresa.id;
    } else {
      const prov = await prisma.proveedor.findUnique({
        where: { id: hospId },
        select: { nombre: true },
      });
      if (prov?.nombre) {
        const matched = await prisma.empresa.findFirst({
          where: { descripcion: { contains: prov.nombre.split("-")[0].trim() } },
        });
        if (matched) targetEmpresaId = matched.id;
      }
    }
  }

  // If still not found and liquidation has details:
  if (!targetEmpresaId && liquidation.details && liquidation.details.length > 0) {
    const detHospitalId = liquidation.details[0]?.hospitalId;
    if (detHospitalId) {
      const prov = await prisma.proveedor.findUnique({
        where: { id: detHospitalId },
        select: { nombre: true },
      });
      if (prov?.nombre) {
        const matched = await prisma.empresa.findFirst({
          where: { descripcion: { contains: prov.nombre.split("-")[0].trim() } },
        });
        if (matched) targetEmpresaId = matched.id;
      }
    }
  }

  let targetEmpresaIds: number[] = [];

  if (isHospitalUser) {
    if (targetEmpresaId) {
      targetEmpresaIds = [targetEmpresaId];
    }
  } else {
    // Admin user: collect all hospitals from liquidation details
    if (liquidation.details && liquidation.details.length > 0) {
      const rawHospIds = liquidation.details
        .map((d: any) => d.hospitalId || d.compra?.hospitalId)
        .filter((id: any): id is number => typeof id === "number" && !isNaN(id));

      const hospNames = liquidation.details
        .map((d: any) => d.prestadorNombre || d.hospital?.nombre)
        .filter((n: any): n is string => typeof n === "string" && n.trim().length > 0);

      const matched = await prisma.empresa.findMany({
        where: {
          OR: [
            ...(rawHospIds.length > 0 ? [{ id: { in: rawHospIds } }] : []),
            ...hospNames.map((name: string) => ({
              descripcion: { contains: name.split("-")[0].trim() },
            })),
          ],
        },
        select: { id: true },
      });

      targetEmpresaIds = Array.from(new Set([...rawHospIds, ...matched.map((m) => m.id)]));
    }
  }

  let agents: any[] = [];
  let extraSavedAgents: any[] = [];
  let agentsPeriodOrigin: "current" | "previous" | "none" = "none";

  // [RECORDATORIO PENDIENTE]: Activar control estricto de período (mes en curso con fallback a 1 mes previo; no permitir 2+ meses).
  // Trae todos los agentes del sistema (permitiendo a hospitales cargar agentes que trabajen en múltiples efectores).
  const mspAgents = await prisma.imPersonalMsp.findMany({
    include: {
      empresa: {
        select: { id: true, descripcion: true },
      },
    },
    orderBy: [{ apellidoyNombre: "asc" }, { idEmpresa: "asc" }],
  });

  if (mspAgents.length > 0) {
    agentsPeriodOrigin = "current";
    const seen = new Set<string>();
    for (const ag of mspAgents) {
      const agId = ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0;
      // Key by unique agent ID to avoid duplicate lines in the selection modal
      const key = `${agId}`;
      if (!seen.has(key)) {
        seen.add(key);
        agents.push({
          id: agId,
          idAgente: agId,
          legajo: ag.legajo.trim(),
          nombre: ag.apellidoyNombre?.trim() || "",
          cargo: ag.idAgente ? `Puesto ${ag.idAgente}` : "PROFESIONAL",
          hospitalId: ag.idEmpresa,
          hospitalNombre: ag.empresa?.descripcion?.trim() || "",
        });
      }
    }
  }

  // Fallback to legacy Agente table if imPersonalMsp is empty
  if (agents.length === 0) {
    const legacyAgents = await prisma.agente.findMany({
      orderBy: { nombre: "asc" },
    });
    agents = legacyAgents.map((ag) => ({
      id: ag.id,
      idAgente: ag.id,
      legajo: "",
      nombre: ag.nombre,
      cargo: ag.cargo || "PROFESIONAL",
      hospitalId: ag.hospitalId || undefined,
      hospitalNombre: ag.establecimiento || "",
    }));
  }

  // If there are already saved distributions for this liquidation, fetch their metadata to always display names & hospitals correctly
  const savedAgenteIds = (liquidation.personalDistributions || [])
    .map((p: any) => p.idAgente)
    .filter(Boolean);

  if (savedAgenteIds.length > 0) {
    const savedMsp = await prisma.imPersonalMsp.findMany({
      where: {
        idAgente: { in: savedAgenteIds },
      },
      include: {
        empresa: {
          select: { id: true, descripcion: true },
        },
      },
      distinct: ["idAgente"],
    });

    extraSavedAgents = savedMsp.map((ag) => ({
      id: ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0,
      idAgente: ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0,
      legajo: ag.legajo.trim(),
      nombre: ag.apellidoyNombre?.trim() || "",
      cargo: ag.idAgente ? `Puesto ${ag.idAgente}` : "PROFESIONAL",
      hospitalId: ag.idEmpresa,
      hospitalNombre: ag.empresa?.descripcion?.trim() || "",
    }));
  }

  return (
    <LiquidationDetailClient
      liquidation={serializeData(liquidation)}
      currentUser={session?.user as any}
      agents={serializeData(agents)}
      extraSavedAgents={serializeData(extraSavedAgents)}
      agentsPeriodOrigin={agentsPeriodOrigin}
      hospitalId={targetEmpresaId || user?.hospitalId}
    />
  );
}
