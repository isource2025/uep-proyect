"use server";

import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin, isUserHospital, isUserUepOperator } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { cleanCuit, formatCuit } from "@/lib/hospital-mapping";
import type {
  ResumenLiquidacionRow,
  ResumenLiquidacionesPayload,
} from "@/lib/export-resumen-liquidaciones-excel";

/**
 * Estados válidos de liquidaciones que ya fueron notificadas al menos una vez.
 * Regla institucional: cada liquidación entra al Resumen una única vez al ser notificada
 * (no aparecen borradores PENDIENTE y nunca se duplica al cambiar de estado posterior).
 */
const NOTIFIED_LIQUIDATION_STATUSES = [
  "NOTIFICADO",
  "EN PROCESO",
  "DISTRIBUIDA",
  "RECTIFICADA",
  "CERRADA",
] as const;

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (
    typeof val === "object" &&
    val !== null &&
    "toNumber" in val &&
    typeof (val as { toNumber: () => number }).toNumber === "function"
  ) {
    return (val as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCbteNumber(
  ptoVta?: number | null,
  numero?: number | string | null,
  prefix?: string | null
): string {
  const pto = ptoVta !== null && ptoVta !== undefined ? String(ptoVta).padStart(4, "0") : "";
  const num = numero !== null && numero !== undefined ? String(numero).padStart(8, "0") : "";
  if (!pto && !num) return "-";
  const base = pto ? `${pto}-${num}` : num;
  return prefix ? `${prefix.trim()}-${base}` : base;
}

function formatPeriod(mes?: number | null, anio?: number | null): string {
  if (!mes || !anio) return "-";
  return `${String(mes).padStart(2, "0")}/${anio}`;
}

function formatPeriodoFromDate(
  d?: Date | null,
  fallbackMes?: number,
  fallbackAnio?: number
): string {
  if (d) {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) {
      const m = dt.getUTCMonth() + 1;
      const y = dt.getUTCFullYear();
      return `${String(m).padStart(2, "0")}/${y}`;
    }
  }
  return formatPeriod(fallbackMes, fallbackAnio);
}

async function assertResumenOperatorAccess(): Promise<{ error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "No autorizado." };
  }
  const user = session.user as {
    role?: string | null;
    hospitalId?: number | null;
    cuit?: string | number | null;
  };
  const isAdmin = isUserAdmin(user?.role);
  const resolvedEmpresaId = await resolveUserEmpresaId(user);
  const isHospitalUser = !isAdmin && isUserHospital(user?.role, resolvedEmpresaId ?? user?.hospitalId);

  if (isHospitalUser || !isUserUepOperator(user?.role)) {
    return {
      error: "Acceso denegado: el Resumen General de Liquidaciones es exclusivo para operadores UEP.",
    };
  }
  return {};
}

export interface ResumenLiquidacionesMeta {
  availableYears: number[];
  totalNotifiedLiquidations: number;
  countsByYear: Record<number, number>;
}

/**
 * Obtiene los años disponibles y cantidad de liquidaciones notificadas para el selector del modal.
 */
export async function fetchResumenLiquidacionesMetaAction(): Promise<{
  data?: ResumenLiquidacionesMeta;
  error?: string;
}> {
  const authRes = await assertResumenOperatorAccess();
  if (authRes.error) return { error: authRes.error };

  try {
    const grouped = await prisma.liquidacion.groupBy({
      by: ["periodAnio"],
      where: {
        status: { in: [...NOTIFIED_LIQUIDATION_STATUSES] },
      },
      _count: { id: true },
      orderBy: { periodAnio: "desc" },
    });

    const countsByYear: Record<number, number> = {};
    let totalNotifiedLiquidations = 0;
    const yearsSet = new Set<number>([new Date().getFullYear()]);

    for (const g of grouped) {
      const y = Number(g.periodAnio);
      const cnt = g._count.id;
      if (!Number.isNaN(y) && y > 0) {
        countsByYear[y] = cnt;
        yearsSet.add(y);
        totalNotifiedLiquidations += cnt;
      }
    }

    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    return {
      data: {
        availableYears,
        totalNotifiedLiquidations,
        countsByYear,
      },
    };
  } catch (err) {
    console.error("Error fetching Resumen Liquidaciones metadata:", err);
    return { error: "No se pudo consultar el resumen de liquidaciones notificadas." };
  }
}

/**
 * Construye dinámicamente las filas del Resumen General de Liquidaciones (22 columnas A..V)
 * exclusivamente a partir de liquidaciones ya notificadas (sin duplicados por cambio de estado).
 */
export async function fetchResumenLiquidacionesExportAction(filters?: {
  year?: number | null;
  month?: number | null;
}): Promise<{
  data?: ResumenLiquidacionesPayload;
  error?: string;
}> {
  const authRes = await assertResumenOperatorAccess();
  if (authRes.error) return { error: authRes.error };

  const selectedYear =
    filters?.year && Number.isInteger(filters.year) && filters.year > 2000 ? filters.year : null;
  const selectedMonth =
    selectedYear &&
    filters?.month &&
    Number.isInteger(filters.month) &&
    filters.month >= 1 &&
    filters.month <= 12
      ? filters.month
      : null;

  try {
    const [liquidations, yearGroups, proveedores, empresas, clienteNombres] = await Promise.all([
      prisma.liquidacion.findMany({
        where: {
          status: { in: [...NOTIFIED_LIQUIDATION_STATUSES] },
          ...(selectedYear ? { periodAnio: selectedYear } : {}),
          ...(selectedMonth ? { periodMes: selectedMonth } : {}),
        },
        include: {
          rc: {
            include: {
              cliente: true,
              appliedAsRc: {
                include: {
                  fc: true,
                },
              },
            },
          },
          details: {
            include: {
              hospital: true,
              compra: true,
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ periodAnio: "asc" }, { periodMes: "asc" }, { id: "asc" }],
      }),
      prisma.liquidacion.groupBy({
        by: ["periodAnio"],
        where: { status: { in: [...NOTIFIED_LIQUIDATION_STATUSES] } },
        orderBy: { periodAnio: "desc" },
      }),
      prisma.proveedor.findMany({
        select: {
          id: true,
          nombre: true,
          cuit: true,
          code: true,
        },
      }),
      prisma.empresa.findMany({
        select: {
          id: true,
          descripcion: true,
          cuit: true,
          localidad: true,
        },
      }),
      prisma.$queryRaw<Array<{ IdCliente: number; Nombres: string | null; Razon_Social: string | null }>>`
        SELECT IdCliente, Nombres, Razon_Social FROM Clientes
      `,
    ]);

    const clienteSiglaById = new Map<number, string>();
    for (const c of clienteNombres) {
      const sigla = (c.Nombres ?? "").trim() || (c.Razon_Social ?? "").trim();
      if (sigla) clienteSiglaById.set(c.IdCliente, sigla);
    }

    const provById = new Map<number, (typeof proveedores)[number]>();
    const provByCuit = new Map<string, (typeof proveedores)[number]>();
    for (const p of proveedores) {
      provById.set(p.id, p);
      const c = cleanCuit(p.cuit);
      if (c && (!provByCuit.has(c) || (p.code && p.code.trim()))) {
        provByCuit.set(c, p);
      }
    }

    const empresaByCuit = new Map<string, (typeof empresas)[number]>();
    for (const e of empresas) {
      const c = cleanCuit(e.cuit);
      if (c && (!empresaByCuit.has(c) || (e.localidad && e.localidad.trim()))) {
        empresaByCuit.set(c, e);
      }
    }

    const rows: ResumenLiquidacionRow[] = [];

    for (const liq of liquidations) {
      const obraSocial =
        (liq.rc?.clienteId ? clienteSiglaById.get(liq.rc.clienteId) : undefined) ||
        (liq.rc?.cliente?.nombre && liq.rc.cliente.nombre.trim()) ||
        "-";

      const rcNum = liq.rc ? formatCbteNumber(liq.rc.puntoVenta, liq.rc.numero) : "-";

      const fcById = new Map<number, string>();
      const allFcs: string[] = [];
      for (const app of liq.rc?.appliedAsRc ?? []) {
        if (app.fc) {
          const formatted = formatCbteNumber(app.fc.puntoVenta, app.fc.numero);
          if (formatted !== "-") {
            fcById.set(app.fc.id, formatted);
            if (!allFcs.includes(formatted)) allFcs.push(formatted);
          }
        }
      }
      const fcUepFallback = allFcs.length > 0 ? allFcs.join(", ") : "-";
      const mesCarga =
        (liq.mesCarga && liq.mesCarga.trim()) || formatPeriod(liq.periodMes, liq.periodAnio);
      const nroLiq = `LIQ-${String(liq.id).padStart(4, "0")}`;

      for (const det of liq.details) {
        const rawDetCuit = cleanCuit(det.cuit);
        const detCuitClean =
          rawDetCuit ||
          cleanCuit(det.hospital?.cuit) ||
          (det.hospitalId ? cleanCuit(provById.get(det.hospitalId)?.cuit) : "");

        // Cruce ESTRICTO por CUIT normalizado (nunca asumir IDPROVEEDOR === IDEMPRESA)
        const provByCuitMatch = detCuitClean ? provByCuit.get(detCuitClean) : undefined;
        const hospitalMatchesCuit =
          det.hospital && (!detCuitClean || cleanCuit(det.hospital.cuit) === detCuitClean)
            ? det.hospital
            : undefined;
        const prov = provByCuitMatch || hospitalMatchesCuit;
        const empresa = detCuitClean ? empresaByCuit.get(detCuitClean) : undefined;

        const codigoInterno =
          (prov?.code && prov.code.trim()) ||
          (hospitalMatchesCuit?.code && hospitalMatchesCuit.code.trim()) ||
          "-";

        const prestador =
          (det.prestadorNombre && det.prestadorNombre.trim()) ||
          (hospitalMatchesCuit?.nombre && hospitalMatchesCuit.nombre.trim()) ||
          (prov?.nombre && prov.nombre.trim()) ||
          "-";

        const localidad =
          (empresa?.localidad && empresa.localidad.trim()) ||
          (det.localidad && det.localidad.trim()) ||
          "-";

        const fcHospital =
          (det.fcHospital && det.fcHospital.trim()) ||
          (det.compra
            ? formatCbteNumber(
                det.compra.grupoCbte,
                toNum(det.compra.numero),
                det.compra.tipoCbte || "FC"
              )
            : "-");

        const fcUep =
          (det.compra?.fcVentaId ? fcById.get(det.compra.fcVentaId) : undefined) || fcUepFallback;

        const periodo =
          (det.periodo && det.periodo.trim()) ||
          formatPeriodoFromDate(det.compra?.fecha, liq.periodMes, liq.periodAnio);

        rows.push({
          anio: liq.periodAnio,
          obraSocial,
          periodo,
          cuit: detCuitClean ? formatCuit(detCuitClean) : "-",
          codigoInterno,
          prestador,
          localidad,
          fcHospital,
          fcUep,
          reciboUep: rcNum,
          mesCarga,
          totalFacturado: toNum(det.totalFacturado),
          creditos: toNum(det.creditos),
          debitos: toNum(det.debitos),
          ajustesOs: toNum(det.ajustesOs),
          pendientesCobro: toNum(det.pendientesCobro),
          pagosParcialesAnteriores: toNum(det.pagosParcialesAnteriores),
          brutoAPagar: toNum(det.brutoAPagar),
          ga: toNum(det.ga),
          adelantos: toNum(det.ajusteRecupero),
          netoADistribuir: toNum(det.netoAPagar),
          nroLiq,
        });
      }
    }

    const availableYears = Array.from(
      new Set<number>([
        new Date().getFullYear(),
        ...yearGroups.map((g) => Number(g.periodAnio)).filter((y) => !Number.isNaN(y) && y > 0),
      ])
    ).sort((a, b) => b - a);

    return {
      data: {
        rows,
        liquidationsCount: liquidations.length,
        availableYears,
        selectedYear,
        selectedMonth,
      },
    };
  } catch (err) {
    console.error("Error generating Resumen Liquidaciones export data:", err);
    return { error: "Error al generar los datos del Resumen de Liquidaciones." };
  }
}
