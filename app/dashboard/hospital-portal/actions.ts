"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

interface BulkDistributionInput {
  agentId: number;
  honorarios: number;
  sobreasignaciones: number;
  gastos: number;
}

export async function bulkSaveDistributions(
  liquidationId: number,
  hospitalId: number,
  distributions: BulkDistributionInput[]
) {
  try {
    // 1. Fetch liquidation and its details to calculate the limit for this hospital
    const details = await prisma.liquidacionDetalle.findMany({
      where: {
        liquidationId,
        OR: [
          { hospitalId },
          {
            compra: {
              hospitalId,
            },
          },
        ],
      },
    });

    const netoFinalLimit = details.reduce((sum, d) => sum + Number(d.netoAPagar), 0);

    // 2. Validate total distributed amount & exclusivity (Honorarios OR Sobreasignaciones)
    const hasBoth = distributions.some(
      (d) => Number(d.honorarios || 0) > 0 && Number(d.sobreasignaciones || 0) > 0
    );

    if (hasBoth) {
      return {
        error: "Regla de validación: Un profesional solo puede percibir Honorarios o Sobreasignación, no ambos conceptos simultáneamente.",
      };
    }

    const totalRequested = distributions.reduce(
      (sum, d) => sum + d.honorarios + d.sobreasignaciones + d.gastos,
      0
    );

    if (totalRequested > netoFinalLimit) {
      return {
        error: `El importe total distribuido ($${totalRequested.toLocaleString("es-AR")}) supera el neto final permitido para su establecimiento ($${netoFinalLimit.toLocaleString("es-AR")}).`,
      };
    }

    // 3. Perform delete and insert in a transaction to prevent partial updates
    const agentIds = distributions.map((d) => d.agentId);

    await prisma.$transaction(async (tx) => {
      // Remove previous distributions for this liquidation and these agents
      await tx.distribucion.deleteMany({
        where: {
          liquidationId,
          agentId: { in: agentIds },
        },
      });

      // Insert new distributions
      if (distributions.length > 0) {
        await tx.distribucion.createMany({
          data: distributions.map((d) => ({
            liquidationId,
            agentId: d.agentId,
            honorarios: d.honorarios,
            sobreasignaciones: d.sobreasignaciones,
            gastos: d.gastos,
          })),
        });
      }

      // Check liquidation details and all saved distributions to update liquidation status
      const allDetails = await tx.liquidacionDetalle.findMany({
        where: { liquidationId },
        include: { compra: true },
      });

      const allDistributions = await tx.distribucion.findMany({
        where: { liquidationId },
        include: { agent: true },
      });

      // Group net amount per hospital in liquidation details
      const hospitalMap = new Map<number, { netoAPagar: number; distributed: number }>();
      for (const d of allDetails) {
        const hid = d.hospitalId || d.compra?.hospitalId;
        if (hid) {
          const prev = hospitalMap.get(hid) || { netoAPagar: 0, distributed: 0 };
          prev.netoAPagar += Number(d.netoAPagar || 0);
          hospitalMap.set(hid, prev);
        }
      }

      for (const dist of allDistributions) {
        const hid = dist.agent?.hospitalId;
        if (hid && hospitalMap.has(hid)) {
          const prev = hospitalMap.get(hid)!;
          prev.distributed += Number(dist.honorarios || 0) + Number(dist.sobreasignaciones || 0) + Number(dist.gastos || 0);
        }
      }

      const totalHospitals = hospitalMap.size;
      let completedHospitals = 0;
      let totalDistributed = 0;

      for (const [, data] of hospitalMap.entries()) {
        totalDistributed += data.distributed;
        if (data.netoAPagar > 0 && data.distributed >= data.netoAPagar - 0.01) {
          completedHospitals++;
        }
      }

      const currentLiq = await tx.liquidacion.findUnique({
        where: { id: liquidationId },
        select: { status: true },
      });

      if (currentLiq && currentLiq.status !== "CERRADA") {
        let newStatus = currentLiq.status;
        if (totalHospitals > 0 && completedHospitals >= totalHospitals) {
          newStatus = "DISTRIBUIDA";
        } else if (totalDistributed > 0) {
          newStatus = "EN_PROCESO";
        } else if (currentLiq.status === "DISTRIBUIDA" || currentLiq.status === "EN_PROCESO") {
          newStatus = "NOTIFICADO";
        }

        if (newStatus !== currentLiq.status) {
          await tx.liquidacion.update({
            where: { id: liquidationId },
            data: { status: newStatus },
          });
        }
      }
    });

    revalidatePath("/dashboard/hospital-portal");
    revalidatePath("/dashboard/liquidations");
    revalidatePath("/dashboard/consolidation");
    return { success: true };
  } catch (e: any) {
    console.error("Error bulk saving distributions:", e);
    return { error: e.message || "Error interno al guardar la distribución de fondos." };
  }
}
