import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { fetchLiquidationById } from "../actions";
import { isUserAdmin } from "@/lib/constants";
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

  const [liquidationRaw, session] = await Promise.all([
    fetchLiquidationById(liqId),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!liquidationRaw) {
    notFound();
  }

  const user = session?.user as any;
  const isAdmin = isUserAdmin(user?.role);
  const isHospitalUser = !isAdmin;

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
      targetEmpresaId = hospId;
    }
  }

  // If still not found and liquidation has details:
  if (!targetEmpresaId && liquidationRaw.details && liquidationRaw.details.length > 0) {
    const detHospitalId = liquidationRaw.details[0]?.hospitalId;
    if (detHospitalId) {
      targetEmpresaId = detHospitalId;
    }
  }

  let targetEmpresaIds: number[] = [];

  if (isHospitalUser) {
    if (targetEmpresaId) {
      targetEmpresaIds = [targetEmpresaId];
    }
  } else {
    // Admin user: collect all hospitals from liquidation details
    if (liquidationRaw.details && liquidationRaw.details.length > 0) {
      const rawHospIds = liquidationRaw.details
        .map((d: any) => d.hospitalId || d.compra?.hospitalId)
        .filter((id: any): id is number => typeof id === "number" && !isNaN(id));

      const hospNames = liquidationRaw.details
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

  // Allow searching all registered agents across the entire nominal roll (since professionals work across multiple hospitals)
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
      const rawCuil = ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ag.legajo.trim());
      const agId = rawCuil;
      // Key by unique agent ID (CUIL) to avoid duplicate lines in the selection modal
      const key = `${agId}`;
      if (!seen.has(key)) {
        seen.add(key);
        agents.push({
          id: agId,
          idAgente: agId,
          cuil: ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ""),
          legajo: ag.legajo.trim(),
          nombre: ag.apellidoyNombre?.trim() || "",
          cargo: ag.cuil ? `CUIL ${ag.cuil.toString()}` : (ag.idAgente ? `ID ${ag.idAgente.toString()}` : "PROFESIONAL"),
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
      id: ag.cuil || ag.id,
      idAgente: ag.cuil || ag.id,
      cuil: ag.cuil || "",
      legajo: "",
      nombre: ag.nombre,
      cargo: ag.cuil ? `CUIL ${ag.cuil}` : (ag.cargo || "PROFESIONAL"),
      hospitalId: ag.hospitalId || undefined,
      hospitalNombre: ag.establecimiento || "",
    }));
  }

  // If there are already saved distributions for this liquidation, fetch their metadata to always display names & hospitals correctly
  const rawSavedCuils = (liquidationRaw.personalDistributions || [])
    .map((p: any) => p.cuil || p.idAgente)
    .filter(Boolean);

  if (rawSavedCuils.length > 0) {
    const bigIntCuils: bigint[] = [];
    for (const c of rawSavedCuils) {
      try {
        const clean = String(c).replace(/[^\d]/g, "");
        if (clean) bigIntCuils.push(BigInt(clean));
      } catch {}
    }

    if (bigIntCuils.length > 0) {
      const savedMsp = await prisma.imPersonalMsp.findMany({
        where: {
          cuil: { in: bigIntCuils },
        },
        include: {
          empresa: {
            select: { id: true, descripcion: true },
          },
        },
      });

      const seenSaved = new Set<string>();
      extraSavedAgents = [];
      for (const ag of savedMsp) {
        const rawCuil = ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ag.legajo.trim());
        const key = `${rawCuil}`;
        if (!seenSaved.has(key)) {
          seenSaved.add(key);
          extraSavedAgents.push({
            id: rawCuil,
            idAgente: rawCuil,
            cuil: ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ""),
            legajo: ag.legajo.trim(),
            nombre: ag.apellidoyNombre?.trim() || "",
            cargo: ag.cuil ? `CUIL ${ag.cuil.toString()}` : (ag.idAgente ? `ID ${ag.idAgente.toString()}` : "PROFESIONAL"),
            hospitalId: ag.idEmpresa,
            hospitalNombre: ag.empresa?.descripcion?.trim() || "",
          });
        }
      }
    }
  }

  // Strict hospital data isolation:
  // A hospital user MUST NEVER see distributions, details or amounts assigned to other hospitals
  let liquidation = { ...liquidationRaw };

  if (isHospitalUser && targetEmpresaId) {
    // 1. Details: Only include details for this hospital
    liquidation.details = (liquidationRaw.details || []).filter(
      (d: any) =>
        (d.hospitalId || d.compra?.hospitalId) === targetEmpresaId
    );

    // 2. Personal distributions: Only include distributions made for this specific hospital
    liquidation.personalDistributions = (liquidationRaw.personalDistributions || []).filter(
      (p: any) => p.hospitalId === targetEmpresaId
    );

    // 3. Legacy distributions: Only include distributions for agents of this hospital
    liquidation.distributions = (liquidationRaw.distributions || []).filter(
      (d: any) => d.agent?.hospitalId === targetEmpresaId
    );
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
