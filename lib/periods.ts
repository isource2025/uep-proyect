import { prisma } from "./prisma";

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function getMonthName(monthNum: number): string {
  if (monthNum < 1 || monthNum > 12) return "";
  return MONTH_NAMES[monthNum - 1] || "";
}

export type SisperPeriodStatus = "current" | "previous" | "expired" | "none";

export interface ActivePeriodInfo {
  anio: number;
  mes: number;
  monthName: string;
  label: string;
  sisperPeriodDate: string | null; // ISO YYYY-MM-DD del último Periodo en imPersonalMsp
  sisperAnio: number | null;
  sisperMes: number | null;
  sisperLabel: string | null;
  monthsBehind: number | null;
  sisperStatus: SisperPeriodStatus;
  canLoadAgents: boolean;
  statusMessage: string;
}

export function getArgentinaYearMonth(now: Date = new Date()): { anio: number; mes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const anio = Number(parts.find((p) => p.type === "year")?.value || now.getFullYear());
  const mes = Number(parts.find((p) => p.type === "month")?.value || now.getMonth() + 1);
  return { anio, mes };
}

function evaluateSisperStatus(
  sisperAnio: number | null,
  sisperMes: number | null,
  sisperLabel: string | null
): {
  monthsBehind: number | null;
  sisperStatus: SisperPeriodStatus;
  canLoadAgents: boolean;
  statusMessage: string;
} {
  if (!sisperAnio || !sisperMes || !sisperLabel) {
    return {
      monthsBehind: null,
      sisperStatus: "none",
      canLoadAgents: false,
      statusMessage:
        "No hay ninguna nómina SISPER cargada en el sistema. Importá la nómina vigente desde Agentes para habilitar la carga de personal.",
    };
  }

  const nowAr = getArgentinaYearMonth();
  const monthsBehind = (nowAr.anio - sisperAnio) * 12 + (nowAr.mes - sisperMes);
  const currentMonthLabel = `${getMonthName(nowAr.mes)} ${nowAr.anio}`;

  if (monthsBehind <= 0) {
    return {
      monthsBehind: 0,
      sisperStatus: "current",
      canLoadAgents: true,
      statusMessage: `Nómina SISPER vigente (${sisperLabel}). Solo se habilitan agentes activos en este período.`,
    };
  }

  if (monthsBehind === 1) {
    return {
      monthsBehind: 1,
      sisperStatus: "previous",
      canLoadAgents: true,
      statusMessage: `Nómina de período anterior (${sisperLabel}). Aún no se importó la nómina de ${currentMonthLabel}; rige 1 mes de gracia.`,
    };
  }

  return {
    monthsBehind,
    sisperStatus: "expired",
    canLoadAgents: false,
    statusMessage: `Nómina SISPER desactualizada (${sisperLabel}, ${monthsBehind} meses de atraso respecto de ${currentMonthLabel}). La carga de nuevo personal está bloqueada hasta importar la nómina vigente.`,
  };
}

export async function getActivePeriodInfo(): Promise<ActivePeriodInfo> {
  try {
    // 1. Check if there is imported SISPER / MSP data with an active period
    const mspRecord = await prisma.imPersonalMsp.findFirst({
      select: { periodo: true },
      orderBy: { periodo: "desc" },
    });

    if (mspRecord?.periodo) {
      const d = new Date(mspRecord.periodo);
      const anio = d.getUTCFullYear();
      const mes = d.getUTCMonth() + 1;
      const monthName = getMonthName(mes);
      const label = `${monthName} ${anio}`;
      const evalStatus = evaluateSisperStatus(anio, mes, label);

      return {
        anio,
        mes,
        monthName,
        label,
        sisperPeriodDate: d.toISOString().slice(0, 10),
        sisperAnio: anio,
        sisperMes: mes,
        sisperLabel: label,
        ...evalStatus,
      };
    }

    // 2. Check if there are generated liquidations with a valid period
    const latestLiq = await prisma.liquidacion.findFirst({
      where: {
        periodAnio: { gt: 0 },
        periodMes: { gt: 0 },
      },
      orderBy: [
        { periodAnio: "desc" },
        { periodMes: "desc" },
      ],
      select: {
        periodAnio: true,
        periodMes: true,
      },
    });

    if (latestLiq) {
      const monthName = getMonthName(latestLiq.periodMes);
      const evalStatus = evaluateSisperStatus(null, null, null);
      return {
        anio: latestLiq.periodAnio,
        mes: latestLiq.periodMes,
        monthName,
        label: `${monthName} ${latestLiq.periodAnio}`,
        sisperPeriodDate: null,
        sisperAnio: null,
        sisperMes: null,
        sisperLabel: null,
        ...evalStatus,
      };
    }
  } catch (err) {
    console.error("Error retrieving active period:", err);
  }

  // Fallback to current Argentina operational period
  const nowAr = getArgentinaYearMonth();
  const fallbackMonthName = getMonthName(nowAr.mes);
  const evalStatus = evaluateSisperStatus(null, null, null);

  return {
    anio: nowAr.anio,
    mes: nowAr.mes,
    monthName: fallbackMonthName,
    label: `${fallbackMonthName} ${nowAr.anio}`,
    sisperPeriodDate: null,
    sisperAnio: null,
    sisperMes: null,
    sisperLabel: null,
    ...evalStatus,
  };
}

/**
 * Devuelve la fecha exacta (`Periodo` en `imPersonalMsp`) habilitada para búsqueda y carga
 * de agentes (solo mes vigente o 1 mes de gracia; devuelve `periodDate: null` si está vencida o vacía).
 */
export async function getActiveSisperPeriodFilter(): Promise<{
  periodDate: Date | null;
  info: ActivePeriodInfo;
}> {
  const info = await getActivePeriodInfo();
  if (!info.canLoadAgents || !info.sisperPeriodDate) {
    return { periodDate: null, info };
  }
  const periodDate = new Date(`${info.sisperPeriodDate}T00:00:00.000Z`);
  return { periodDate, info };
}

export async function getAvailablePeriods() {
  try {
    const periodsMap = new Map<string, { anio: number; mes: number; label: string }>();

    // 1. Periods from SISPER / MSP imports
    const mspPeriods = await prisma.imPersonalMsp.findMany({
      select: { periodo: true },
      distinct: ["periodo"],
      orderBy: { periodo: "desc" },
    });

    for (const p of mspPeriods) {
      if (!p.periodo) continue;
      const d = new Date(p.periodo);
      const anio = d.getUTCFullYear();
      const mes = d.getUTCMonth() + 1;
      const key = `${anio}-${mes}`;
      if (!periodsMap.has(key)) {
        periodsMap.set(key, {
          anio,
          mes,
          label: `${getMonthName(mes)} ${anio}`,
        });
      }
    }

    // 2. Periods from Liquidations
    const liqPeriods = await prisma.liquidacion.findMany({
      where: {
        periodAnio: { gt: 0 },
        periodMes: { gt: 0 },
      },
      select: {
        periodAnio: true,
        periodMes: true,
      },
      distinct: ["periodAnio", "periodMes"],
    });

    for (const l of liqPeriods) {
      const key = `${l.periodAnio}-${l.periodMes}`;
      if (!periodsMap.has(key)) {
        periodsMap.set(key, {
          anio: l.periodAnio,
          mes: l.periodMes,
          label: `${getMonthName(l.periodMes)} ${l.periodAnio}`,
        });
      }
    }

    const result = Array.from(periodsMap.values()).sort((a, b) => {
      if (b.anio !== a.anio) return b.anio - a.anio;
      return b.mes - a.mes;
    });

    if (result.length === 0) {
      const active = await getActivePeriodInfo();
      return [active];
    }

    return result;
  } catch (err) {
    console.error("Error retrieving available periods:", err);
    const active = await getActivePeriodInfo();
    return [active];
  }
}
