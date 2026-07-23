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

    // 2. Validate total distributed amount
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

    await prisma.$transaction([
      // Remove previous distributions for this liquidation and these agents
      prisma.distribucion.deleteMany({
        where: {
          liquidationId,
          agentId: { in: agentIds },
        },
      }),
      // Insert new distributions
      prisma.distribucion.createMany({
        data: distributions.map((d) => ({
          liquidationId,
          agentId: d.agentId,
          honorarios: d.honorarios,
          sobreasignaciones: d.sobreasignaciones,
          gastos: d.gastos,
        })),
      }),
    ]);

    revalidatePath("/dashboard/hospital-portal");
    return { success: true };
  } catch (e: any) {
    console.error("Error bulk saving distributions:", e);
    return { error: e.message || "Error interno al guardar la distribución de fondos." };
  }
}
