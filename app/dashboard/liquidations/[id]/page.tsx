import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { fetchLiquidationById } from "../actions";
import { isUserAdmin, isUserHospital } from "@/lib/constants";
import { cleanCuit } from "@/lib/hospital-mapping";
import { filterLiquidationForHospital } from "@/lib/hospital-liquidation-scope";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { getActiveSisperPeriodFilter } from "@/lib/periods";
import { fetchLiquidationNotificationHistoryAction } from "@/app/dashboard/notifications/actions";
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

  const [liquidationRaw, session, activeSisper] = await Promise.all([
    fetchLiquidationById(liqId),
    auth.api.getSession({ headers: await headers() }),
    getActiveSisperPeriodFilter(),
  ]);

  if (!liquidationRaw) {
    notFound();
  }

  const user = session?.user as any;
  const isAdmin = isUserAdmin(user?.role);
  const isHospitalUser = isUserHospital(user?.role, user?.hospitalId);

  let targetEmpresaId: number | undefined = undefined;

  if (isHospitalUser) {
    // EMPRESA del usuario: imPersonalEmpresas, o imPersonal.hospitalId (IDPROVEEDOR) -> EMPRESA validada por CUIT.
    // Sin efector resuelto NO se infiere ningún hospital (fail-closed): no verá renglones ni distribuciones.
    targetEmpresaId = await resolveUserEmpresaId(user);
  }

  let targetEmpresaIds: number[] = [];

  if (isHospitalUser) {
    if (targetEmpresaId) {
      targetEmpresaIds = [targetEmpresaId];
    }
  } else {
    // Admin user: recopilar efectores de los renglones y buscar sus Empresas vinculando EXCLUSIVAMENTE por CUIT
    if (liquidationRaw.details && liquidationRaw.details.length > 0) {
      const rawCuits = liquidationRaw.details
        .map((d: any) => cleanCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit))
        .filter((c: string) => c.length >= 10);

      const allEmpresas = await prisma.empresa.findMany({
        select: { id: true, cuit: true },
      });

      const matchedEmpresas = allEmpresas.filter((emp) => {
        const empCuit = cleanCuit(emp.cuit);
        return Boolean(empCuit && rawCuits.includes(empCuit));
      });

      targetEmpresaIds = Array.from(new Set(matchedEmpresas.map((m) => m.id)));
    }
  }

  let agents: any[] = [];
  let extraSavedAgents: any[] = [];
  const agentsPeriodOrigin = activeSisper.info.sisperStatus;

  // Cargar agentes seleccionables ESTRICTAMENTE desde el último Periodo vigente de imPersonalMsp
  // (mes en curso o 1 mes de gracia; si está vencida >= 2 meses, no se habilita carga de nuevo personal)
  if (activeSisper.info.canLoadAgents && activeSisper.periodDate) {
    const whereAg: any = {
      periodo: activeSisper.periodDate,
    };
    if (targetEmpresaIds.length > 0) {
      whereAg.idEmpresa = { in: targetEmpresaIds };
    } else if (isHospitalUser) {
      // Hospital sin efector resuelto: no exponer nómina de otros establecimientos
      whereAg.idEmpresa = { in: [] };
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
      const seen = new Set<string>();
      for (const ag of mspAgents) {
        const rawCuil = ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ag.legajo.trim());
        const agId = rawCuil;
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
        orderBy: { periodo: "desc" },
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

  // Strict hospital data isolation (cruce EXCLUSIVO por CUIT normalizado):
  // A hospital user MUST NEVER see distributions, details or amounts assigned to other hospitals
  let liquidation = { ...liquidationRaw };

  if (isHospitalUser) {
    const targetEmpresa = targetEmpresaId
      ? await prisma.empresa.findUnique({
          where: { id: targetEmpresaId },
          select: { id: true, descripcion: true, cuit: true },
        })
      : null;
    const targetEmpresaCuit = cleanCuit(targetEmpresa?.cuit);
    liquidation = filterLiquidationForHospital(liquidationRaw, targetEmpresaCuit, {
      hospitalName: targetEmpresa?.descripcion?.trim() || undefined,
      hospitalEmpresaId: targetEmpresaId,
    });
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

  // Historial y auditoría de notificaciones (exclusivo para operadores UEP)
  const historyRes = !isHospitalUser
    ? await fetchLiquidationNotificationHistoryAction(liqId)
    : null;
  const notificationHistory = historyRes?.history || [];

  return (
    <LiquidationDetailClient
      liquidation={serializeData(liquidation)}
      currentUser={session?.user as any}
      agents={serializeData(agents)}
      extraSavedAgents={serializeData(extraSavedAgents)}
      agentsPeriodOrigin={agentsPeriodOrigin}
      sisperPeriodLabel={activeSisper.info.sisperLabel}
      sisperStatusMessage={activeSisper.info.statusMessage}
      hospitalId={targetEmpresaId ?? null}
      hospitals={serializeData(allHospitals)}
      notificationHistory={serializeData(notificationHistory)}
    />
  );
}
