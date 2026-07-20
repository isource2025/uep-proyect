"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeFile } from "fs/promises";
import path from "path";

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

function sanitizeProveedor(p: any) {
  if (!p) return null;
  return {
    ...p,
    cuit: p.cuit ? toNum(p.cuit).toString() : "",
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

function sanitizeLiquidationDetail(d: any) {
  if (!d) return null;
  return {
    ...d,
    totalFacturado: toNum(d.totalFacturado),
    creditos: toNum(d.creditos),
    debitos: toNum(d.debitos),
    ajustesOs: toNum(d.ajustesOs),
    pendientesCobro: toNum(d.pendientesCobro),
    brutoAPagar: toNum(d.brutoAPagar),
    ga: toNum(d.ga),
    ajusteRecupero: toNum(d.ajusteRecupero),
    netoAPagar: toNum(d.netoAPagar),
    hospital: sanitizeProveedor(d.hospital),
    cliente: sanitizeCliente(d.cliente),
  };
}

function sanitizeLiquidationHeader(liq: any) {
  if (!liq) return null;
  const details = (liq.details || []).map(sanitizeLiquidationDetail);

  // Compute aggregate totals across all hospital rows for UI display
  const totalFacturado = details.reduce((sum: number, d: any) => sum + d.totalFacturado, 0);
  const creditos = details.reduce((sum: number, d: any) => sum + d.creditos, 0);
  const debitos = details.reduce((sum: number, d: any) => sum + d.debitos, 0);
  const ajustesOs = details.reduce((sum: number, d: any) => sum + d.ajustesOs, 0);
  const pendientesCobro = details.reduce((sum: number, d: any) => sum + d.pendientesCobro, 0);
  const brutoAPagar = details.reduce((sum: number, d: any) => sum + d.brutoAPagar, 0);
  const ga = details.reduce((sum: number, d: any) => sum + d.ga, 0);
  const ajusteRecupero = details.reduce((sum: number, d: any) => sum + d.ajusteRecupero, 0);
  const netoAPagar = details.reduce((sum: number, d: any) => sum + d.netoAPagar, 0);

  return {
    ...liq,
    rc: sanitizeCbte(liq.rc),
    details,
    totalFacturado,
    creditos,
    debitos,
    ajustesOs,
    pendientesCobro,
    brutoAPagar,
    ga,
    ajusteRecupero,
    netoAPagar,
  };
}

// 1. Fetch generated liquidations with nested details
export async function fetchLiquidationData() {
  const liquidations = await prisma.liquidation.findMany({
    include: {
      period: true,
      rc: {
        include: {
          cliente: true,
        },
      },
      details: {
        include: {
          hospital: true,
          cliente: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const sanitizedLiquidations = liquidations.map(sanitizeLiquidationHeader);

  // Fetch pending Recibos de Cobro (RC) not yet liquidated
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

  const sanitizedPendingRcs = pendingRcs.map((rc) => ({
    ...sanitizeCbte(rc),
    appliedAsRc: rc.appliedAsRc.map((app) => ({
      ...app,
      importe: toNum(app.importe),
      fc: sanitizeCbte(app.fc),
    })),
  }));

  return {
    liquidations: sanitizedLiquidations,
    pendingRcs: sanitizedPendingRcs,
  };
}

// 2. Generate a new Liquidation header and hospital detail rows from an RC
export async function calculateLiquidation(rcId: number) {
  try {
    const rc = await prisma.cbte.findUnique({
      where: { id: rcId },
      include: { cliente: true },
    });
    if (!rc) return { error: "Comprobante no encontrado." };

    const activePeriod = await prisma.periodoIVA.findFirst({
      where: { fechaCierre: null },
    });
    if (!activePeriod) return { error: "No hay un período activo abierto en el sistema." };

    // Find applied sales invoices (FC)
    const applications = await prisma.cbteAplica.findMany({
      where: { rcId },
      include: { fc: true },
    });

    const fcIds = applications.map((a) => a.fcId);

    // Find hospital purchase invoices (Compras) linked to these FC sales invoices
    let hospitalPurchases = await prisma.compra.findMany({
      where: {
        fcVentaId: { in: fcIds },
      },
      include: {
        hospital: true,
        cliente: true,
      },
    });

    // Fallback: If no Compras are directly linked via fcVentaId, find Compras for this Obra Social (clienteId)
    if (hospitalPurchases.length === 0 && rc.clienteId) {
      hospitalPurchases = await prisma.compra.findMany({
        where: {
          clienteId: rc.clienteId,
        },
        include: {
          hospital: true,
          cliente: true,
        },
        take: 20,
      });
    }

    const monthStr = `${activePeriod.mes.toString().padStart(2, "0")}/${activePeriod.anio}`;

    // Create Liquidation Header record
    const liquidation = await prisma.liquidation.create({
      data: {
        periodAnio: activePeriod.anio,
        periodMes: activePeriod.mes,
        rcId,
        mesCarga: monthStr,
        status: "PENDIENTE",
      },
    });

    // Create LiquidationDetail rows for each Hospital
    if (hospitalPurchases.length > 0) {
      for (const comp of hospitalPurchases) {
        const total = toNum(comp.importe);
        const fcNumStr = comp.numero ? `FC-${comp.hospital?.code || "C"}-${String(comp.numero).padStart(8, "0")}` : `FC-${comp.id}`;
        
        await prisma.liquidationDetail.create({
          data: {
            liquidationId: liquidation.id,
            compraId: comp.id,
            hospitalId: comp.hospitalId,
            clienteId: comp.clienteId || rc.clienteId,
            periodo: monthStr,
            cuit: comp.hospital?.cuit ? toNum(comp.hospital.cuit).toString() : rc.cliente?.cuit ? toNum(rc.cliente.cuit).toString() : "",
            prestadorNombre: comp.hospital?.nombre || "Hospital Prestador",
            localidad: comp.hospital?.code || "CAPITAL",
            fcHospital: fcNumStr,
            totalFacturado: total,
            creditos: 0,
            debitos: 0,
            ajustesOs: 0,
            pendientesCobro: 0,
            brutoAPagar: total,
            ga: 0,
            ajusteRecupero: 0,
            netoAPagar: total,
          },
        });
      }
    } else {
      // Create at least 1 default detail row from RC applied invoice if no Compras
      const total = toNum(rc.importe);
      await prisma.liquidationDetail.create({
        data: {
          liquidationId: liquidation.id,
          clienteId: rc.clienteId,
          periodo: monthStr,
          cuit: rc.cliente?.cuit ? toNum(rc.cliente.cuit).toString() : "",
          prestadorNombre: "Hospital Central",
          localidad: "CAPITAL",
          fcHospital: `FC-UEP-${rc.numero}`,
          totalFacturado: total,
          creditos: 0,
          debitos: 0,
          ajustesOs: 0,
          pendientesCobro: 0,
          brutoAPagar: total,
          ga: 0,
          ajusteRecupero: 0,
          netoAPagar: total,
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

// 3. Batch update operator detail rows for a liquidation
export async function updateLiquidationDetails(
  liquidationId: number,
  details: Array<{
    id: string;
    creditos: number;
    debitos: number;
    ajustesOs: number;
    pendientesCobro: number;
    ga: number;
    ajusteRecupero: number;
  }>,
  status?: string
) {
  try {
    for (const d of details) {
      const detailRecord = await prisma.liquidationDetail.findUnique({
        where: { id: d.id },
      });
      if (!detailRecord) continue;

      const totalFacturado = toNum(detailRecord.totalFacturado);
      const brutoAPagar = totalFacturado + d.creditos - d.debitos + d.ajustesOs - d.pendientesCobro;
      const netoAPagar = brutoAPagar - d.ga + d.ajusteRecupero;

      await prisma.liquidationDetail.update({
        where: { id: d.id },
        data: {
          creditos: d.creditos,
          debitos: d.debitos,
          ajustesOs: d.ajustesOs,
          pendientesCobro: d.pendientesCobro,
          brutoAPagar,
          ga: d.ga,
          ajusteRecupero: d.ajusteRecupero,
          netoAPagar,
        },
      });
    }

    if (status) {
      await prisma.liquidation.update({
        where: { id: liquidationId },
        data: { status },
      });
    }

    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating liquidation details:", e);
    return { error: e.message || "Error al guardar ajustes de liquidación." };
  }
}

// 4. Upload scanned PDF file with debit breakdown sent by Obra Social
export async function uploadDebitsFile(formData: FormData) {
  try {
    const liquidationIdStr = formData.get("liquidationId") as string;
    const file = formData.get("file") as File;

    if (!liquidationIdStr || !file) {
      return { error: "Faltan parámetros requeridos para la carga de débitos." };
    }

    const liquidationId = parseInt(liquidationIdStr, 10);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filename = `debits-liq-${liquidationId}-${Date.now()}${path.extname(file.name)}`;
    const uploadPath = path.join(process.cwd(), "public", "uploads", "debits", filename);

    await writeFile(uploadPath, buffer);
    const fileUrl = `/uploads/debits/${filename}`;

    await prisma.liquidation.update({
      where: { id: liquidationId },
      data: {
        debitsFileUrl: fileUrl,
        debitsFileName: file.name,
      },
    });

    revalidatePath("/dashboard/liquidations");
    return { success: true, fileUrl, fileName: file.name };
  } catch (e: any) {
    console.error("Error uploading debits file:", e);
    return { error: e.message || "Error al guardar el comprobante escaneado de débitos." };
  }
}
