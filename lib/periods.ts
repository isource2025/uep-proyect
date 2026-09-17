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

export async function getActivePeriodInfo() {
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

      return {
        anio,
        mes,
        monthName,
        label: `${monthName} ${anio}`,
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
      return {
        anio: latestLiq.periodAnio,
        mes: latestLiq.periodMes,
        monthName,
        label: `${monthName} ${latestLiq.periodAnio}`,
      };
    }
  } catch (err) {
    console.error("Error retrieving active period:", err);
  }

  // Fallback to standard operational period (e.g. current date or June 2026)
  const now = new Date();
  const fallbackMes = now.getMonth() + 1;
  const fallbackAnio = now.getFullYear();
  const fallbackMonthName = getMonthName(fallbackMes);

  return {
    anio: fallbackAnio,
    mes: fallbackMes,
    monthName: fallbackMonthName,
    label: `${fallbackMonthName} ${fallbackAnio}`,
  };
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
