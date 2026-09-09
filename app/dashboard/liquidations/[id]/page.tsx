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

  let agents: any[] = [];
  let extraSavedAgents: any[] = [];

  // Temporarily relaxed period filter for client demo (TODO: restore strict period check tomorrow)
  if (targetEmpresaId) {
    const mspAgents = await prisma.imPersonalMsp.findMany({
      where: {
        idEmpresa: targetEmpresaId,
      },
      orderBy: { apellidoyNombre: "asc" },
    });

    if (mspAgents.length > 0) {
      const seen = new Set<string>();
      for (const ag of mspAgents) {
        const agId = ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0;
        const key = `${agId}_${ag.legajo.trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          agents.push({
            id: agId,
            idAgente: agId,
            legajo: ag.legajo.trim(),
            nombre: ag.apellidoyNombre?.trim() || "",
            cargo: ag.idAgente ? `Puesto ${ag.idAgente}` : "PROFESIONAL",
          });
        }
      }
    }
  }

  // Fallback to Agente table if imPersonalMsp is empty for this establishment
  if (agents.length === 0 && (user?.hospitalId || targetEmpresaId)) {
    const hospId = user?.hospitalId || targetEmpresaId;
    const legacyAgents = await prisma.agente.findMany({
      where: { hospitalId: hospId },
      orderBy: { nombre: "asc" },
    });
    agents = legacyAgents.map((ag) => ({
      id: ag.id,
      idAgente: ag.id,
      legajo: "",
      nombre: ag.nombre,
      cargo: ag.cargo || "PROFESIONAL",
    }));
  }

  // If there are already saved distributions for this liquidation, fetch their metadata to always display names correctly
  const savedAgenteIds = (liquidation.personalDistributions || [])
    .map((p: any) => p.idAgente)
    .filter(Boolean);

  if (savedAgenteIds.length > 0) {
    const savedMsp = await prisma.imPersonalMsp.findMany({
      where: {
        idAgente: { in: savedAgenteIds },
      },
      distinct: ["idAgente"],
    });

    extraSavedAgents = savedMsp.map((ag) => ({
      id: ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0,
      idAgente: ag.idAgente || parseInt(ag.legajo.replace(/[^\d]/g, ""), 10) || 0,
      legajo: ag.legajo.trim(),
      nombre: ag.apellidoyNombre?.trim() || "",
      cargo: ag.idAgente ? `Puesto ${ag.idAgente}` : "PROFESIONAL",
    }));
  }

  return (
    <LiquidationDetailClient
      liquidation={serializeData(liquidation)}
      currentUser={session?.user as any}
      agents={serializeData(agents)}
      extraSavedAgents={serializeData(extraSavedAgents)}
      hospitalId={targetEmpresaId || user?.hospitalId}
    />
  );
}
