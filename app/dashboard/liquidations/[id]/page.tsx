import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { fetchLiquidationById } from "../actions";
import { isUserAdmin, isUserHospital } from "@/lib/constants";
import { cleanCuit } from "@/lib/hospital-mapping";
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
  const isHospitalUser = isUserHospital(user?.role, user?.hospitalId);

  let targetEmpresaId: number | undefined = undefined;

  if (isHospitalUser) {
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

    // Si aún no se encontró, resolver la empresa a partir del CUIT del primer renglón
    if (!targetEmpresaId && liquidationRaw.details && liquidationRaw.details.length > 0) {
      const firstDetCuit = cleanCuit(liquidationRaw.details[0]?.cuit || liquidationRaw.details[0]?.hospital?.cuit);
      if (firstDetCuit) {
        const allEmpresas = await prisma.empresa.findMany({ select: { id: true, cuit: true } });
        const match = allEmpresas.find((e) => cleanCuit(e.cuit) === firstDetCuit);
        if (match) {
          targetEmpresaId = match.id;
        }
      }
    }
  }

  let targetEmpresaIds: number[] = [];

  if (isHospitalUser) {
    if (targetEmpresaId) {
      targetEmpresaIds = [targetEmpresaId];
    }
  } else {
    // Admin user: recopilar efectores de los renglones y buscar sus Empresas vinculando explícitamente por CUIT
    if (liquidationRaw.details && liquidationRaw.details.length > 0) {
      const rawCuits = liquidationRaw.details
        .map((d: any) => cleanCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit))
        .filter((c: string) => c.length >= 10);

      const hospNames = liquidationRaw.details
        .map((d: any) => d.prestadorNombre || d.hospital?.nombre)
        .filter((n: any): n is string => typeof n === "string" && n.trim().length > 0);

      const allEmpresas = await prisma.empresa.findMany({
        select: { id: true, cuit: true, descripcion: true },
      });

      const matchedEmpresas = allEmpresas.filter((emp) => {
        const empCuit = cleanCuit(emp.cuit);
        if (empCuit && rawCuits.includes(empCuit)) {
          return true;
        }
        // Fallback por nombre solo si no hay CUITs disponibles
        if (rawCuits.length === 0 && emp.descripcion) {
          const empDesc = emp.descripcion.toLowerCase();
          return hospNames.some((hn: string) => {
            const cleanHn = hn.toLowerCase().split("-")[0].trim();
            return cleanHn.length > 4 && empDesc.includes(cleanHn);
          });
        }
        return false;
      });

      targetEmpresaIds = Array.from(new Set(matchedEmpresas.map((m) => m.id)));
    }
  }

  let agents: any[] = [];
  let extraSavedAgents: any[] = [];
  let agentsPeriodOrigin: "current" | "previous" | "none" = "none";

  // Optimized: Load agents only for the hospital(s) in this liquidation to keep payload small and fast
  const whereAg: any = {};
  if (targetEmpresaIds.length > 0) {
    whereAg.idEmpresa = { in: targetEmpresaIds };
  }

  const mspAgents = await prisma.imPersonalMsp.findMany({
    where: whereAg,
    include: {
      empresa: {
        select: { id: true, descripcion: true },
      },
    },
    orderBy: [{ apellidoyNombre: "asc" }, { idEmpresa: "asc" }],
    take: targetEmpresaIds.length > 0 ? undefined : 300,
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
          cargo: "PROFESIONAL",
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
      cargo: ag.cargo && !ag.cargo.includes(ag.cuil || "") ? ag.cargo : "PROFESIONAL",
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
            cargo: "PROFESIONAL",
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
    const targetEmpresa = await prisma.empresa.findUnique({
      where: { id: targetEmpresaId },
      select: { id: true, cuit: true, descripcion: true },
    });
    const targetEmpresaCuit = cleanCuit(targetEmpresa?.cuit);

    // 1. Details: Only include details for this hospital matching by CUIT
    liquidation.details = (liquidationRaw.details || []).filter((d: any) => {
      const dCuit = cleanCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit);
      if (targetEmpresaCuit && dCuit) {
        return dCuit === targetEmpresaCuit;
      }
      if (targetEmpresa?.descripcion && d.prestadorNombre) {
        const cleanName = targetEmpresa.descripcion.toLowerCase().split("-")[0].trim();
        return cleanName.length > 4 && d.prestadorNombre.toLowerCase().includes(cleanName);
      }
      return false;
    });

    // 2. Personal distributions: Only include distributions made for this specific hospital
    liquidation.personalDistributions = (liquidationRaw.personalDistributions || []).filter(
      (p: any) => p.hospitalId === targetEmpresaId
    );

    // 3. Legacy distributions: Only include distributions for agents of this hospital
    liquidation.distributions = (liquidationRaw.distributions || []).filter(
      (d: any) => d.agent?.hospitalId === targetEmpresaId
    );

    // 4. Recalculate all aggregated header metrics strictly for this hospital
    const totalFacturado = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.totalFacturado || 0), 0);
    const creditos = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.creditos || 0), 0);
    const debitos = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.debitos || 0), 0);
    const ajustesOs = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.ajustesOs || 0), 0);
    const pendientesCobro = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.pendientesCobro || 0), 0);
    const pagosParcialesAnteriores = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.pagosParcialesAnteriores || 0), 0);
    const brutoAPagar = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.brutoAPagar || 0), 0);
    const ga = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.ga || 0), 0);
    const ajusteRecupero = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.ajusteRecupero || 0), 0);
    const netoAPagar = liquidation.details.reduce((sum: number, d: any) => sum + Number(d.netoAPagar || 0), 0);

    const personalHonorarios = liquidation.personalDistributions.reduce((sum: number, p: any) => sum + Number(p.honorarios || 0), 0);
    const personalSobreasignacion = liquidation.personalDistributions.reduce((sum: number, p: any) => sum + Number(p.sobreasignacion || 0), 0);

    const totalHonorarios = liquidation.personalDistributions.length > 0
      ? personalHonorarios
      : liquidation.distributions.reduce((sum: number, d: any) => sum + Number(d.honorarios || 0), 0);

    const totalSobreasignaciones = liquidation.personalDistributions.length > 0
      ? personalSobreasignacion
      : liquidation.distributions.reduce((sum: number, d: any) => sum + Number(d.sobreasignaciones || 0), 0);

    const totalGastos = Math.max(0, netoAPagar - (totalHonorarios + totalSobreasignaciones));
    const totalDistribuido = totalHonorarios + totalSobreasignaciones + totalGastos;

    liquidation.totalFacturado = totalFacturado;
    liquidation.creditos = creditos;
    liquidation.debitos = debitos;
    liquidation.ajustesOs = ajustesOs;
    liquidation.pendientesCobro = pendientesCobro;
    liquidation.pagosParcialesAnteriores = pagosParcialesAnteriores;
    liquidation.brutoAPagar = brutoAPagar;
    liquidation.ga = ga;
    liquidation.ajusteRecupero = ajusteRecupero;
    liquidation.netoAPagar = netoAPagar;
    liquidation.totalHonorarios = totalHonorarios;
    liquidation.totalSobreasignaciones = totalSobreasignaciones;
    liquidation.totalGastos = totalGastos;
    liquidation.totalDistribuido = totalDistribuido;
  }

  const healthcareProviders = await prisma.proveedor.findMany({
    where: {
      OR: [
        { tipoProvId: 18 },
        { nombre: { contains: "HOSPITAL" } },
        { nombre: { contains: "CAPS" } },
        { nombre: { contains: "CENTRO DE SALUD" } },
        { nombre: { contains: "ESTACION SANITARIA" } },
        { nombre: { contains: "INSTITUTO" } },
        { nombre: { contains: "BANCO DE SANGRE" } },
        { nombre: { contains: "LABORATORIO" } },
      ],
    },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      cuit: true,
    },
  });

  const allHospitals = healthcareProviders.map((p) => ({
    id: p.id,
    nombre: p.nombre || `Proveedor #${p.id}`,
    descripcion: p.nombre || `Proveedor #${p.id}`,
    cuit: p.cuit ? cleanCuit(p.cuit) : "",
    localidad: "CAPITAL",
  }));

  return (
    <LiquidationDetailClient
      liquidation={serializeData(liquidation)}
      currentUser={session?.user as any}
      agents={serializeData(agents)}
      extraSavedAgents={serializeData(extraSavedAgents)}
      agentsPeriodOrigin={agentsPeriodOrigin}
      hospitalId={targetEmpresaId || user?.hospitalId}
      hospitals={serializeData(allHospitals)}
    />
  );
}
