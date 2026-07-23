"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function fetchConsolidationData(periodAnio: number, periodMes: number) {
  try {
    const liquidations = await prisma.liquidacion.findMany({
      where: {
        periodAnio,
        periodMes,
        periodIva: "V",
      },
      include: {
        rc: {
          include: {
            cliente: true,
          },
        },
        details: true,
        distributions: {
          include: {
            agent: {
              include: {
                hospital: true,
              },
            },
          },
        },
      },
    });

    return { success: true, liquidations };
  } catch (e: any) {
    console.error("Error fetching consolidation data:", e);
    return { error: e.message || "Error al obtener los datos del período." };
  }
}

export async function closePeriodLiquidations(periodAnio: number, periodMes: number) {
  try {
    // Lock all liquidations of this period to CERRADA
    await prisma.liquidacion.updateMany({
      where: {
        periodAnio,
        periodMes,
        periodIva: "V",
      },
      data: {
        status: "CERRADA",
      },
    });

    // Also close the period itself in PeriodoIVA by setting fechaCierre if it's not closed
    const activePeriod = await prisma.periodoIVA.findFirst({
      where: {
        anio: periodAnio,
        mes: periodMes,
        iva: "V",
        fechaCierre: null,
      },
    });

    if (activePeriod) {
      await prisma.periodoIVA.update({
        where: {
          anio_mes_iva: {
            anio: periodAnio,
            mes: periodMes,
            iva: "V",
          },
        },
        data: {
          fechaCierre: new Date(),
        },
      });
    }

    revalidatePath("/dashboard/consolidation");
    revalidatePath("/dashboard/periods");
    return { success: true };
  } catch (e: any) {
    console.error("Error closing period liquidations:", e);
    return { error: e.message || "Error al cerrar el período de liquidaciones." };
  }
}
