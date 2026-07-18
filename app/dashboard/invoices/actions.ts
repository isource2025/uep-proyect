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

function sanitizeCompra(comp: any) {
  if (!comp) return null;
  return {
    ...comp,
    importe: toNum(comp.importe),
    numero: toNum(comp.numero),
    hospital: comp.hospital ? {
      ...comp.hospital,
      cuit: comp.hospital.cuit ? toNum(comp.hospital.cuit).toString() : ""
    } : null
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

// 1. Fetch pending unifications (Obras Sociales with pending hospital invoices)
export async function fetchPendingUnifications() {
  // Ultra-fast groupBy aggregation in DB instead of loading 14,000+ objects into memory
  const grouped = await prisma.compra.groupBy({
    by: ["clienteId"],
    where: {
      fcVentaId: null,
      clienteId: { not: null },
    },
    _count: {
      id: true,
    },
    _sum: {
      importe: true,
    },
  });

  if (grouped.length === 0) return [];

  const clienteIds = grouped.map((g) => g.clienteId!).filter(Boolean);
  const clientes = await prisma.cliente.findMany({
    where: {
      id: { in: clienteIds },
    },
  });

  const clienteMap = new Map(clientes.map((c) => [c.id, sanitizeCliente(c)]));

  return grouped.map((g) => {
    const cli = clienteMap.get(g.clienteId!) || { id: g.clienteId, nombre: `Cliente #${g.clienteId}`, cuit: "" };
    return {
      clienteId: g.clienteId!,
      cliente: cli,
      count: g._count.id,
      total: toNum(g._sum.importe),
    };
  });
}

// 2. Fetch all consolidated invoices (Cbtes of type 'FC')
export async function fetchUnifiedInvoices(searchQuery?: string) {
  const whereClause: any = {
    type: "FC",
  };

  if (searchQuery) {
    const trimmed = searchQuery.trim();
    // Support filtering by Obra Social name or Invoice Number
    whereClause.OR = [
      {
        cliente: {
          nombre: {
            contains: trimmed,
          },
        },
      },
    ];

    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
      whereClause.OR.push({
        numero: num,
      });
    }
  }

  // Limit to top 100 recent invoices for instantaneous page loading
  const invoices = await prisma.cbte.findMany({
    where: whereClause,
    include: {
      cliente: true,
    },
    orderBy: {
      fecha: "desc",
    },
    take: 100,
  });

  if (invoices.length === 0) return [];

  const invoiceIds = invoices.map((inv) => inv.id);

  // Group count Compras for all invoices in 1 query instead of thousands of subqueries
  const compCounts = await prisma.compra.groupBy({
    by: ["fcVentaId"],
    where: {
      fcVentaId: { in: invoiceIds },
    },
    _count: {
      id: true,
    },
  });

  const countMap = new Map(compCounts.map((c) => [c.fcVentaId!, c._count.id]));

  return invoices.map((inv) => ({
    ...sanitizeCbte(inv),
    compCount: countMap.get(inv.id) || 0,
  }));
}

// 3. Fetch detailed individual Compras consolidated inside a unified Cbte
export async function fetchInvoiceDetails(cbteId: number) {
  const cbte = await prisma.cbte.findUnique({
    where: { id: cbteId },
    include: { cliente: true },
  });

  if (!cbte) return null;

  const purchases = await prisma.compra.findMany({
    where: {
      fcVentaId: cbteId,
    },
    include: {
      hospital: true,
    },
  });

  return {
    cbte: sanitizeCbte(cbte),
    purchases: purchases.map(sanitizeCompra),
  };
}

// 4. Create transactional unification (consolidate Compras for an Obra Social)
export async function unifyInvoicesForClient(clienteId: number) {
  try {
    // Check pending Compras
    const pendingPurchases = await prisma.compra.findMany({
      where: {
        clienteId,
        fcVentaId: null,
      },
    });

    if (pendingPurchases.length === 0) {
      return { error: "No hay facturas pendientes para esta Obra Social." };
    }

    const total = pendingPurchases.reduce((sum, p) => sum + toNum(p.importe), 0);

    // Get next transactional IdTransaccion in Cbtes (primary key is manually assigned)
    const maxVal = await prisma.cbte.aggregate({
      _max: { id: true },
    });
    const nextId = (maxVal._max.id || 0) + 1;

    // Get next sequential NroCbte for Letra_Cbte: 'A', TipoCbte: 'FC'
    const maxNum = await prisma.cbte.aggregate({
      where: {
        type: "FC",
        puntoVenta: "A",
      },
      _max: { numero: true },
    });
    const nextNro = (maxNum._max.numero || 0) + 1;

    // Execute in a single sequential flow
    const newCbte = await prisma.cbte.create({
      data: {
        id: nextId,
        type: "FC",
        puntoVenta: "A",
        numero: nextNro,
        fecha: new Date(),
        importe: total,
        clienteId,
      },
    });

    // Update Compras to link them to the new unified invoice
    await prisma.compra.updateMany({
      where: {
        clienteId,
        fcVentaId: null,
      },
      data: {
        fcVentaId: nextId,
      },
    });

    revalidatePath("/dashboard/invoices");
    return { success: true, cbteId: nextId };
  } catch (e: any) {
    console.error("Error unifying invoices:", e);
    return { error: e.message || "Error al unificar comprobantes." };
  }
}
