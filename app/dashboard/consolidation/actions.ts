"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin, isUserHospital, isUserReadOnlyAuditor, isUserUepOperator } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { cleanCuit } from "@/lib/hospital-mapping";
import { detectErpBillingCircuit } from "@/lib/erp-circuit";
import type {
  ConsolidationAgentRow,
  ConsolidationBatchData,
  ConsolidationHospitalSummary,
  ConsolidationLiquidationItem,
  ConsolidationWorkspaceData,
  ConvenioTgp,
  CtaCteTgp,
} from "@/lib/consolidation-types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && val !== null && "toNumber" in val && typeof (val as { toNumber: () => number }).toNumber === "function") {
    return (val as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCuilDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }
  return digits || raw;
}

function extractDniFromCuil(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return digits.slice(2, 10);
  return digits;
}

async function assertConsolidationOperatorAccess(requireWrite = false): Promise<{
  error?: string;
  userId?: number | null;
  userName?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { error: "No autorizado." };
  const user = session.user as any;
  const isAdmin = isUserAdmin(user?.role);
  const resolvedEmpresaId = await resolveUserEmpresaId(user);
  const isHospitalUser = !isAdmin && isUserHospital(user?.role, resolvedEmpresaId ?? user?.hospitalId);
  if (isHospitalUser || !isUserUepOperator(user?.role)) {
    return {
      error: "Acceso denegado: los reportes globales de consolidación son exclusivos para operadores UEP.",
    };
  }
  if (requireWrite && isUserReadOnlyAuditor(user?.role)) {
    return {
      error: "Acceso denegado: el perfil Auditor / Contable tiene permisos de consulta y generación de reportes (sin cierre de lotes).",
    };
  }
  const parsedId = parseInt(String(user.id), 10);
  return {
    userId: !isNaN(parsedId) ? parsedId : null,
    userName: String(user.name || user.email || "Operador UEP").trim(),
  };
}

/**
 * Construye el listado enriquecido de liquidaciones con montos reales desde
 * LiquidacionDetalle + LiquidacionPersonal (cruce estricto por CUIT con EMPRESAS)
 * y clasificación Convenio / Cta. Cte. TGP.
 */
async function hydrateLiquidationsForConsolidation(
  rawLiquidations: any[]
): Promise<ConsolidationLiquidationItem[]> {
  if (rawLiquidations.length === 0) return [];

  const liqIds = rawLiquidations.map((l) => l.id);
  const clienteIds = Array.from(
    new Set(rawLiquidations.map((l) => Number(l.rc?.clienteId || 0)).filter((id) => id > 0))
  );

  // 1. Cargar en paralelo LiquidacionPersonal, SIGLAS de Clientes (Clientes.Nombres) y EMPRESAS
  const [personalRows, clienteSiglaRows, allEmpresas] = await Promise.all([
    prisma.liquidacionPersonal.findMany({
      where: { idLiquidacion: { in: liqIds } },
    }),
    clienteIds.length > 0
      ? prisma.$queryRaw<Array<{ IdCliente: number; Sigla: string | null }>>(
          Prisma.sql`
            SELECT IdCliente, RTRIM(Nombres) AS Sigla
            FROM Clientes
            WHERE IdCliente IN (${Prisma.join(clienteIds)})
          `
        )
      : Promise.resolve([]),
    prisma.empresa.findMany({
      select: { id: true, descripcion: true, cuit: true, localidad: true },
    }),
  ]);

  const siglaByClienteId = new Map<number, string>();
  for (const row of clienteSiglaRows) {
    const s = (row.Sigla || "").trim();
    if (s) siglaByClienteId.set(Number(row.IdCliente), s);
  }

  const empresaById = new Map<
    number,
    { id: number; descripcion: string; cuit: string; localidad: string }
  >();
  for (const e of allEmpresas) {
    empresaById.set(e.id, {
      id: e.id,
      descripcion: (e.descripcion || "").trim() || `Empresa #${e.id}`,
      cuit: cleanCuit(e.cuit),
      localidad: (e.localidad || "").trim() || "CAPITAL",
    });
  }

  // 2. Resolver nombres y establecimientos de agentes SISPER para los CUILs presentes
  const uniqueCuils = Array.from(
    new Set(personalRows.map((p) => p.cuil).filter((c): c is bigint => c !== null && c !== undefined))
  );

  const mspByCuilAndEmpresa = new Map<string, { nombre: string; idEmpresa: number }>();
  const mspByCuilFallback = new Map<string, { nombre: string; idEmpresa: number }>();

  if (uniqueCuils.length > 0) {
    // Consultar en bloques de 500 por seguridad de parámetros SQL Server
    for (let i = 0; i < uniqueCuils.length; i += 500) {
      const chunk = uniqueCuils.slice(i, i + 500);
      const mspBatch = await prisma.imPersonalMsp.findMany({
        where: { cuil: { in: chunk } },
        select: { cuil: true, idEmpresa: true, apellidoyNombre: true, periodo: true },
        orderBy: { periodo: "desc" },
      });

      for (const m of mspBatch) {
        if (!m.cuil) continue;
        const cuilStr = m.cuil.toString();
        const nombre = (m.apellidoyNombre || "").trim() || `CUIL ${cuilStr}`;
        const pairKey = `${cuilStr}|${m.idEmpresa}`;
        if (!mspByCuilAndEmpresa.has(pairKey)) {
          mspByCuilAndEmpresa.set(pairKey, { nombre, idEmpresa: m.idEmpresa });
        }
        if (!mspByCuilFallback.has(cuilStr)) {
          mspByCuilFallback.set(cuilStr, { nombre, idEmpresa: m.idEmpresa });
        }
      }
    }
  }

  // Agrupar personalRows por liquidación
  const personalByLiqId = new Map<number, typeof personalRows>();
  for (const p of personalRows) {
    const list = personalByLiqId.get(p.idLiquidacion) || [];
    list.push(p);
    personalByLiqId.set(p.idLiquidacion, list);
  }

  return rawLiquidations.map((liq) => {
    const rc = liq.rc;
    const clienteId = rc?.clienteId ? Number(rc.clienteId) : null;
    const clienteNombre = (rc?.cliente?.nombre || "OBRA SOCIAL").trim();
    const clienteSigla = (clienteId ? siglaByClienteId.get(clienteId) : undefined) || clienteNombre;
    const appliedFcGrupos = (rc?.appliedAsRc || []).map((a: any) => a?.fc?.puntoVenta ?? null);

    const circuit = detectErpBillingCircuit({
      rcGrupoCbte: rc?.puntoVenta ?? null,
      clienteId,
      clienteCuit: rc?.cliente?.cuit ? toNum(rc.cliente.cuit) : null,
      clienteNombre,
      appliedFcGrupos,
    });

    const convenio = circuit.convenioLabel as ConvenioTgp;
    const ctaCteTgp = circuit.ctaCteTgp as CtaCteTgp;

    const code = `LIQ-${String(liq.id).padStart(4, "0")}`;
    const mesCarga = (liq.mesCarga || `${String(liq.periodMes).padStart(2, "0")}/${liq.periodAnio}`).trim();
    const displayLabel = `Liq. N° ${liq.id} - ${clienteSigla} - ${mesCarga}`;
    const expediente = (liq.expediente || "").trim();
    const normaLegal = (liq.normaLegal || "").trim();

    // Agrupar detalles por hospital usando CUIT normalizado (sin mezclar IDs)
    const hospitalMap = new Map<string, ConsolidationHospitalSummary>();
    const cuitToHospitalKey = new Map<string, string>();
    const provIdToHospitalKey = new Map<number, string>();

    for (const d of liq.details || []) {
      const cleanDetCuit = cleanCuit(d.cuit || d.hospital?.cuit);
      const hid = d.hospitalId ? Number(d.hospitalId) : null;
      const nombre = (d.prestadorNombre || d.hospital?.nombre || `Efector #${hid || "?"}`).trim();
      const localidad = (d.localidad || "CAPITAL").trim();
      const key = cleanDetCuit ? `cuit-${cleanDetCuit}` : hid ? `prov-${hid}` : `name-${nombre}`;

      if (cleanDetCuit && !cuitToHospitalKey.has(cleanDetCuit)) {
        cuitToHospitalKey.set(cleanDetCuit, key);
      }
      if (hid && !provIdToHospitalKey.has(hid)) {
        provIdToHospitalKey.set(hid, key);
      }

      const existing = hospitalMap.get(key) || {
        key,
        hospitalId: hid,
        cuit: cleanDetCuit,
        nombre,
        localidad,
        totalFacturado: 0,
        debitos: 0,
        brutoAPagar: 0,
        ga: 0,
        netoAPagar: 0,
        honorarios: 0,
        sobreasignacion: 0,
        sueldos: 0,
        gastosDisponible: 0,
      };

      existing.totalFacturado = round2(existing.totalFacturado + toNum(d.totalFacturado));
      existing.debitos = round2(existing.debitos + toNum(d.debitos));
      existing.brutoAPagar = round2(existing.brutoAPagar + toNum(d.brutoAPagar));
      existing.ga = round2(existing.ga + toNum(d.ga));
      existing.netoAPagar = round2(existing.netoAPagar + toNum(d.netoAPagar));
      hospitalMap.set(key, existing);
    }

    const liqPersonal = personalByLiqId.get(liq.id) || [];
    const agentRows: ConsolidationAgentRow[] = [];

    if (liqPersonal.length > 0) {
      for (const p of liqPersonal) {
        const cuilStr = p.cuil ? p.cuil.toString() : "";
        const empId = Number(p.idEmpresa || 0);
        const mspPair = empId > 0 ? mspByCuilAndEmpresa.get(`${cuilStr}|${empId}`) : undefined;
        const mspFallback = mspByCuilFallback.get(cuilStr);
        const resolvedEmpId = empId > 0 ? empId : mspFallback?.idEmpresa || 0;
        const empMeta = resolvedEmpId > 0 ? empresaById.get(resolvedEmpId) : undefined;
        const agentName = mspPair?.nombre || mspFallback?.nombre || `Agente CUIL ${cuilStr}`;

        const hon = round2(toNum(p.honorarios));
        const sob = round2(toNum(p.sobreasignacion));

        // Cruce estricto por CUIT normalizado: EMPRESAS.Nro_CUIT === LiquidacionDetalle.cuit
        let targetKey: string | undefined;
        if (empMeta?.cuit && cuitToHospitalKey.has(empMeta.cuit)) {
          targetKey = cuitToHospitalKey.get(empMeta.cuit);
        } else if (hospitalMap.size === 1) {
          targetKey = Array.from(hospitalMap.keys())[0];
        }

        const targetHosp = targetKey ? hospitalMap.get(targetKey) : undefined;
        if (targetHosp) {
          targetHosp.honorarios = round2(targetHosp.honorarios + hon);
          targetHosp.sobreasignacion = round2(targetHosp.sobreasignacion + sob);
        }

        const estNombre = targetHosp?.nombre || empMeta?.descripcion || "SIN ESTABLECIMIENTO";
        const estCuit = targetHosp?.cuit || empMeta?.cuit || "";

        if (hon > 0) {
          agentRows.push({
            liquidationId: liq.id,
            liquidationLabel: displayLabel,
            expediente: expediente || "-",
            obraSocialSigla: clienteSigla,
            obraSocialNombre: clienteNombre,
            dni: extractDniFromCuil(cuilStr),
            cuil: formatCuilDisplay(cuilStr),
            nombre: agentName,
            establecimiento: estNombre,
            establecimientoCuit: estCuit,
            concepto: "Honorarios Médicos",
            importe: hon,
          });
        }
        if (sob > 0) {
          agentRows.push({
            liquidationId: liq.id,
            liquidationLabel: displayLabel,
            expediente: expediente || "-",
            obraSocialSigla: clienteSigla,
            obraSocialNombre: clienteNombre,
            dni: extractDniFromCuil(cuilStr),
            cuil: formatCuilDisplay(cuilStr),
            nombre: agentName,
            establecimiento: estNombre,
            establecimientoCuit: estCuit,
            concepto: "Sobreasignación al Personal",
            importe: sob,
          });
        }
      }
    } else if (liq.distributions && liq.distributions.length > 0) {
      // Compatibilidad con registros históricos en Distribucion
      for (const dist of liq.distributions) {
        const hon = round2(toNum(dist.honorarios));
        const sob = round2(toNum(dist.sobreasignaciones));
        const hid = dist.agent?.hospitalId ? Number(dist.agent.hospitalId) : null;
        const targetKey =
          (hid && provIdToHospitalKey.get(hid)) ||
          (hospitalMap.size === 1 ? Array.from(hospitalMap.keys())[0] : undefined);
        const targetHosp = targetKey ? hospitalMap.get(targetKey) : undefined;
        if (targetHosp) {
          targetHosp.honorarios = round2(targetHosp.honorarios + hon);
          targetHosp.sobreasignacion = round2(targetHosp.sobreasignacion + sob);
        }

        const cuilStr = String(dist.agent?.cuil || "");
        const estNombre =
          targetHosp?.nombre || dist.agent?.hospital?.nombre || dist.agent?.establecimiento || "HOSPITAL";
        const estCuit = targetHosp?.cuit || cleanCuit(dist.agent?.hospital?.cuit);

        if (hon > 0) {
          agentRows.push({
            liquidationId: liq.id,
            liquidationLabel: displayLabel,
            expediente: expediente || "-",
            obraSocialSigla: clienteSigla,
            obraSocialNombre: clienteNombre,
            dni: extractDniFromCuil(cuilStr),
            cuil: formatCuilDisplay(cuilStr),
            nombre: dist.agent?.nombre || "AGENTE",
            establecimiento: estNombre,
            establecimientoCuit: estCuit,
            concepto: "Honorarios Médicos",
            importe: hon,
          });
        }
        if (sob > 0) {
          agentRows.push({
            liquidationId: liq.id,
            liquidationLabel: displayLabel,
            expediente: expediente || "-",
            obraSocialSigla: clienteSigla,
            obraSocialNombre: clienteNombre,
            dni: extractDniFromCuil(cuilStr),
            cuil: formatCuilDisplay(cuilStr),
            nombre: dist.agent?.nombre || "AGENTE",
            establecimiento: estNombre,
            establecimientoCuit: estCuit,
            concepto: "Sobreasignación al Personal",
            importe: sob,
          });
        }
      }
    }

    // Calcular sueldos y gastosDisponible por hospital
    const hospitals = Array.from(hospitalMap.values())
      .map((h) => {
        const sueldos = round2(h.honorarios + h.sobreasignacion);
        const gastosDisponible = round2(Math.max(0, h.netoAPagar - sueldos));
        return {
          ...h,
          sueldos,
          gastosDisponible,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const totals = hospitals.reduce(
      (acc, h) => ({
        totalFacturado: round2(acc.totalFacturado + h.totalFacturado),
        debitos: round2(acc.debitos + h.debitos),
        brutoAPagar: round2(acc.brutoAPagar + h.brutoAPagar),
        ga: round2(acc.ga + h.ga),
        netoAPagar: round2(acc.netoAPagar + h.netoAPagar),
        totalHonorarios: round2(acc.totalHonorarios + h.honorarios),
        totalSobreasignaciones: round2(acc.totalSobreasignaciones + h.sobreasignacion),
        totalSueldos: round2(acc.totalSueldos + h.sueldos),
        totalGastosDisponible: round2(acc.totalGastosDisponible + h.gastosDisponible),
      }),
      {
        totalFacturado: 0,
        debitos: 0,
        brutoAPagar: 0,
        ga: 0,
        netoAPagar: 0,
        totalHonorarios: 0,
        totalSobreasignaciones: 0,
        totalSueldos: 0,
        totalGastosDisponible: 0,
      }
    );

    const warnings: string[] = [];
    if (!expediente) warnings.push("Falta N° Expediente");
    if (!normaLegal) warnings.push("Falta Norma Legal");
    if (hospitals.length === 0) warnings.push("Sin renglones de hospitales");

    const rcPto = rc?.puntoVenta ? String(rc.puntoVenta).padStart(4, "0") : "0000";
    const rcNro = rc?.numero ? String(rc.numero).padStart(8, "0") : String(liq.rcId);

    return {
      id: liq.id,
      code,
      displayLabel,
      status: liq.status,
      mesCarga,
      periodAnio: liq.periodAnio,
      periodMes: liq.periodMes,
      expediente,
      normaLegal,
      createdByName: (liq.createdByName || "").trim(),
      updatedAt: liq.updatedAt instanceof Date ? liq.updatedAt.toISOString() : String(liq.updatedAt || ""),
      rcNumber: `${rcPto}-${rcNro}`,
      rcGrupoCbte: rc?.puntoVenta ?? null,
      clienteId,
      clienteNombre,
      clienteSigla,
      convenio,
      ctaCteTgp,
      detailsCount: (liq.details || []).length,
      ...totals,
      hospitals,
      agentRows,
      warnings,
    };
  });
}

function aggregateBatchSummary(
  meta: {
    id: number | null;
    anio: number;
    mes: number;
    descripcion: string;
    observaciones: string | null;
    cerradaPorNombre: string | null;
    cerradaAt: string | null;
  },
  liquidaciones: ConsolidationLiquidationItem[]
): ConsolidationBatchData {
  const sums = liquidaciones.reduce(
    (acc, l) => ({
      totalFacturado: round2(acc.totalFacturado + l.totalFacturado),
      totalBruto: round2(acc.totalBruto + l.brutoAPagar),
      totalGa: round2(acc.totalGa + l.ga),
      totalNeto: round2(acc.totalNeto + l.netoAPagar),
      totalHonorarios: round2(acc.totalHonorarios + l.totalHonorarios),
      totalSobreasignaciones: round2(acc.totalSobreasignaciones + l.totalSobreasignaciones),
      totalSueldos: round2(acc.totalSueldos + l.totalSueldos),
      totalGastosDisponible: round2(acc.totalGastosDisponible + l.totalGastosDisponible),
      cta131441002Sueldos:
        l.ctaCteTgp === "131441002"
          ? round2(acc.cta131441002Sueldos + l.totalSueldos)
          : acc.cta131441002Sueldos,
      cta131441004Sueldos:
        l.ctaCteTgp === "131441004"
          ? round2(acc.cta131441004Sueldos + l.totalSueldos)
          : acc.cta131441004Sueldos,
    }),
    {
      totalFacturado: 0,
      totalBruto: 0,
      totalGa: 0,
      totalNeto: 0,
      totalHonorarios: 0,
      totalSobreasignaciones: 0,
      totalSueldos: 0,
      totalGastosDisponible: 0,
      cta131441002Sueldos: 0,
      cta131441004Sueldos: 0,
    }
  );

  return {
    ...meta,
    liquidacionesCount: liquidaciones.length,
    ...sums,
    liquidaciones,
  };
}

/**
 * Carga la Bandeja de liquidaciones DISTRIBUIDAS pendientes de consolidar,
 * contadores del pipeline en curso y todo el historial de Consolidaciones cerradas.
 */
export async function fetchConsolidationWorkspaceAction(): Promise<{
  success?: boolean;
  data?: ConsolidationWorkspaceData;
  error?: string;
}> {
  try {
    const access = await assertConsolidationOperatorAccess(false);
    if (access.error) return { error: access.error };

    const liquidationInclude = {
      rc: {
        include: {
          cliente: true,
          appliedAsRc: {
            include: {
              fc: {
                select: { id: true, puntoVenta: true, numero: true },
              },
            },
          },
        },
      },
      details: {
        include: {
          hospital: true,
        },
      },
      distributions: {
        include: {
          agent: {
            include: { hospital: true },
          },
        },
      },
    };

    const [rawPending, statusGroups, rawConsolidations] = await Promise.all([
      prisma.liquidacion.findMany({
        where: {
          status: { in: ["DISTRIBUIDA", "DISTRIBUIDO"] },
          consolidacionId: null,
        },
        include: liquidationInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.liquidacion.groupBy({
        by: ["status"],
        where: {
          consolidacionId: null,
          status: { notIn: ["DISTRIBUIDA", "DISTRIBUIDO", "CERRADA", "CERRADO"] },
        },
        _count: { _all: true },
      }),
      prisma.consolidacion.findMany({
        include: {
          liquidaciones: {
            include: liquidationInclude,
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ anio: "desc" }, { mes: "desc" }, { id: "desc" }],
      }),
    ]);

    // Hidratar en una sola pasada tanto pendientes como cerradas para ahorrar queries
    const allRawLiquidations = [
      ...rawPending,
      ...rawConsolidations.flatMap((c) => c.liquidaciones || []),
    ];
    const hydratedAll = await hydrateLiquidationsForConsolidation(allRawLiquidations);
    const hydratedById = new Map(hydratedAll.map((item) => [item.id, item]));

    const pendingLiquidations = rawPending
      .map((l) => hydratedById.get(l.id))
      .filter((x): x is ConsolidationLiquidationItem => Boolean(x));

    const closedBatches: ConsolidationBatchData[] = rawConsolidations.map((c) => {
      const items = (c.liquidaciones || [])
        .map((l) => hydratedById.get(l.id))
        .filter((x): x is ConsolidationLiquidationItem => Boolean(x));
      return aggregateBatchSummary(
        {
          id: c.id,
          anio: c.anio,
          mes: c.mes,
          descripcion: c.descripcion,
          observaciones: c.observaciones ?? null,
          cerradaPorNombre: c.cerradaPorNombre ?? null,
          cerradaAt: c.cerradaAt instanceof Date ? c.cerradaAt.toISOString() : String(c.cerradaAt),
        },
        items
      );
    });

    let pendiente = 0;
    let notificado = 0;
    let enProceso = 0;
    let rectificada = 0;
    for (const g of statusGroups) {
      const st = String(g.status || "").toUpperCase();
      const cnt = g._count._all;
      if (st === "PENDIENTE") pendiente += cnt;
      else if (st === "NOTIFICADO") notificado += cnt;
      else if (st === "EN PROCESO") enProceso += cnt;
      else rectificada += cnt;
    }

    const currentYear = new Date().getFullYear();
    const yearSet = new Set<number>([currentYear]);
    for (const b of closedBatches) yearSet.add(b.anio);
    for (const p of pendingLiquidations) yearSet.add(p.periodAnio);
    const availableYears = Array.from(yearSet).sort((a, b) => b - a);

    return {
      success: true,
      data: {
        pendingLiquidations,
        inProgressCounts: {
          pendiente,
          notificado,
          enProceso,
          rectificada,
          total: pendiente + notificado + enProceso + rectificada,
        },
        closedBatches,
        availableYears,
      },
    };
  } catch (e: any) {
    console.error("Error fetching consolidation workspace:", e);
    return { error: e.message || "Error al cargar el módulo de consolidación." };
  }
}

/**
 * Cierra de forma atómica un lote mensual de consolidación:
 * crea el registro en Consolidacion y marca las liquidaciones seleccionadas como CERRADA
 * vinculadas a ese lote (garantizando que nunca se dupliquen en otro mes).
 */
export async function closeConsolidationBatchAction(input: {
  anio: number;
  mes: number;
  descripcion: string;
  observaciones?: string;
  liquidationIds: number[];
}): Promise<{ success?: boolean; consolidacionId?: number; closedCount?: number; error?: string }> {
  try {
    const access = await assertConsolidationOperatorAccess(true);
    if (access.error) return { error: access.error };

    const anio = Number(input.anio);
    const mes = Number(input.mes);
    const descripcion = (input.descripcion || "").trim();
    const observaciones = (input.observaciones || "").trim() || null;
    const uniqueIds = Array.from(
      new Set((input.liquidationIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
      return { error: "El año del consolidado es inválido." };
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return { error: "El mes del consolidado debe estar entre 1 y 12." };
    }
    if (!descripcion) {
      return { error: "Ingrese una descripción para el lote de consolidación (ej. Noviembre 2026)." };
    }
    if (uniqueIds.length === 0) {
      return { error: "Debe seleccionar al menos una liquidación distribuida para cerrar el lote." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // Verificar dentro de la transacción que TODAS siguen en estado DISTRIBUIDA y sin consolidacionId
      const eligible = await tx.liquidacion.findMany({
        where: {
          id: { in: uniqueIds },
          status: { in: ["DISTRIBUIDA", "DISTRIBUIDO"] },
          consolidacionId: null,
        },
        select: { id: true },
      });

      if (eligible.length !== uniqueIds.length) {
        const eligibleSet = new Set(eligible.map((e) => e.id));
        const invalidIds = uniqueIds.filter((id) => !eligibleSet.has(id));
        throw new Error(
          `No se pudo cerrar el lote: las liquidaciones ${invalidIds
            .map((id) => `LIQ-${String(id).padStart(4, "0")}`)
            .join(", ")} ya fueron cerradas o cambiaron de estado. Recargue la bandeja e intente nuevamente.`
        );
      }

      const created = await tx.consolidacion.create({
        data: {
          anio,
          mes,
          descripcion: descripcion.slice(0, 120),
          observaciones: observaciones ? observaciones.slice(0, 500) : null,
          cerradaPorId: access.userId ?? null,
          cerradaPorNombre: access.userName || "Operador UEP",
        },
      });

      await tx.liquidacion.updateMany({
        where: {
          id: { in: uniqueIds },
          consolidacionId: null,
        },
        data: {
          consolidacionId: created.id,
          status: "CERRADA",
        },
      });

      return { consolidacionId: created.id, closedCount: uniqueIds.length };
    });

    revalidatePath("/dashboard/consolidation");
    revalidatePath("/dashboard/liquidations");
    revalidatePath("/dashboard");

    return {
      success: true,
      consolidacionId: result.consolidacionId,
      closedCount: result.closedCount,
    };
  } catch (e: any) {
    console.error("Error closing consolidation batch:", e);
    return { error: e.message || "Error al cerrar el lote de consolidación." };
  }
}
