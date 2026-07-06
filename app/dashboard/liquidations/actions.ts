"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
}

function sanitizeCliente(c: any) {
  if (!c) return null;
  return {
    ...c,
    cuit: c.cuit ? toNum(c.cuit).toString() : "",
  };
}

function sanitizeCbte(c: any) {
  if (!c) return null;
  return {
    ...c,
    puntoVenta: c.puntoVenta ? String(c.puntoVenta).trim() : "",
    numero: c.numero ? Number(c.numero) : 0,
    importe: toNum(c.importe),
    cliente: sanitizeCliente(c.cliente),
  };
}

export async function fetchLiquidationData() {
  // 1. Fetch generated liquidations with nested details
  const liquidations = await prisma.liquidation.findMany({
    include: {
      period: true,
      rc: {
        include: {
          cliente: true,
        },
      },
      details: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // For each liquidation, find the hospital name dynamically by looking up the Compra corresponding to the first detail's fcVentaId
  const liquidationsWithHospital = await Promise.all(
    liquidations.map(async (liq) => {
      let hospitalName = "No Asignado";
      if (liq.details.length > 0) {
        const firstDetail = liq.details[0];
        const purchase = await prisma.compra.findFirst({
          where: { fcVentaId: firstDetail.fcVentaId },
          include: { hospital: true },
        });
        if (purchase?.hospital?.nombre) {
          hospitalName = purchase.hospital.nombre;
        }
      }
      return {
        ...liq,
        hospitalName,
        // Convert Decimal fields to string or number to pass safely across the network boundary
        totalFacturado: Number(liq.totalFacturado),
        netoInicial: Number(liq.netoInicial),
        creditos: Number(liq.creditos),
        debitos: Number(liq.debitos),
        ajustes: Number(liq.ajustes),
        recuperos: Number(liq.recuperos),
        pendientes: Number(liq.pendientes),
        rc: sanitizeCbte(liq.rc),
        details: liq.details.map(d => ({
          ...d,
          amount: Number(d.amount)
        }))
      };
    })
  );

  // 2. Fetch RCs that DO NOT have a liquidation yet (Pending calculation)
  const generatedRcIds = liquidations.map((l) => l.rcId);
  const pendingRcs = await prisma.cbte.findMany({
    where: {
      type: "RC",
      id: { notIn: generatedRcIds },
    },
    include: {
      cliente: true,
      appliedAsRc: {
        include: {
          fc: true,
        },
      },
    },
  });

  // Sanitize pendingRcs decimal imports
  const sanitizedPendingRcs = pendingRcs.map(rc => ({
    ...sanitizeCbte(rc),
    appliedAsRc: rc.appliedAsRc.map(app => ({
      ...app,
      importe: Number(app.importe),
      fc: sanitizeCbte(app.fc)
    }))
  }));

  return {
    liquidations: liquidationsWithHospital,
    pendingRcs: sanitizedPendingRcs,
  };
}

export async function calculateLiquidation(rcId: number) {
  try {
    const rc = await prisma.cbte.findUnique({
      where: { id: rcId },
    });
    if (!rc) return { error: "Comprobante no encontrado." };

    const activePeriod = await prisma.periodoIVA.findFirst({
      where: { fechaCierre: null },
    });
    if (!activePeriod) return { error: "No hay un período activo abierto en el sistema." };

    // Find applied sales invoices (FC)
    const applications = await prisma.cbteAplica.findMany({
      where: { rcId },
    });

    const totalFacturado = applications.reduce((sum, app) => sum + Number(app.importe), 0);
    const netoInicial = Number(rc.importe);

    // Create liquidation
    const liquidation = await prisma.liquidation.create({
      data: {
        periodAnio: activePeriod.anio,
        periodMes: activePeriod.mes,
        rcId,
        totalFacturado,
        netoInicial,
        status: "PENDIENTE",
      },
    });

    // Create details
    for (const app of applications) {
      await prisma.liquidationDetail.create({
        data: {
          liquidationId: liquidation.id,
          fcVentaId: app.fcId,
          amount: app.importe,
        },
      });
    }

    revalidatePath("/dashboard/liquidations");
    return { success: true, liquidationId: liquidation.id };
  } catch (e: any) {
    console.error("Error generating liquidation:", e);
    return { error: e.message || "Error al calcular liquidación." };
  }
}

export async function updateLiquidation(
  id: string,
  creditos: number,
  debitos: number,
  ajustes: number,
  recuperos: number,
  pendientes: number,
  status: string
) {
  try {
    await prisma.liquidation.update({
      where: { id },
      data: {
        creditos,
        debitos,
        ajustes,
        recuperos,
        pendientes,
        status,
      },
    });
    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating liquidation:", e);
    return { error: e.message || "Error al guardar ajustes." };
  }
}
