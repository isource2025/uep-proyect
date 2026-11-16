"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin, isUserHospital, parseUserRoleIds } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";

async function assertConsolidationOperatorAccess(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return "No autorizado.";
  const user = session.user as any;
  const isAdmin = isUserAdmin(user?.role);
  const userRoles = parseUserRoleIds(user?.role);
  const resolvedEmpresaId = await resolveUserEmpresaId(user);
  const isHospitalUser = !isAdmin && isUserHospital(user?.role, resolvedEmpresaId ?? user?.hospitalId);
  if (isHospitalUser || (!isAdmin && userRoles.includes("2"))) {
    return "Acceso denegado: los reportes globales de consolidación son exclusivos para operadores UEP.";
  }
  return null;
}

export async function fetchConsolidationData(periodAnio: number, periodMes: number) {
  try {
    const accessError = await assertConsolidationOperatorAccess();
    if (accessError) return { error: accessError };
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
    const accessError = await assertConsolidationOperatorAccess();
    if (accessError) return { error: accessError };
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

    revalidatePath("/dashboard/consolidation");
    return { success: true };
  } catch (e: any) {
    console.error("Error closing period liquidations:", e);
    return { error: e.message || "Error al cerrar el período de liquidaciones." };
  }
}
