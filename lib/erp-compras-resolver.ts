import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { cleanCuit } from "@/lib/hospital-mapping";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ResolvedCompraWithRelations = Prisma.CompraGetPayload<{
  include: {
    hospital: true;
    cliente: true;
  };
}>;

const CHUNK_SIZE = 500;
const ITEM_DESC_REGEX =
  /^\s*([A-Z]{2,3})\s*-\s*(\d{1,4})\s*-\s*([A-Z])\s*-\s*(\d+)\s*\/\s*(\d{2}-?\d{8}-?\d)\b/i;

export interface ParsedCbteItemRef {
  fcId: number;
  fcClienteId: number | null;
  nroRenglon: number;
  tipoCbte: string;
  grupoCbte: number;
  letraCbte: string;
  nroCbte: number;
  cuit: string;
  importeTotal: number;
  idTransOrigen: number;
  rawDescripcion: string;
}

interface CbteItemRow {
  IdTransaccion: number;
  NroRenglon: number;
  IdProducto: number | null;
  Descripcion: string | null;
  ImporteTotal: unknown;
  IdTrans_Origen: number | null;
}

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && val !== null && "toNumber" in val && typeof (val as { toNumber: () => number }).toNumber === "function") {
    return (val as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function makeVoucherKey(cuit: string, grupoCbte: number | null | undefined, nroCbte: number): string {
  return `${cuit}|${grupoCbte ?? ""}|${nroCbte}`;
}

/**
 * Extrae tipo, punto de venta (GrupoCbte), letra, número y CUIT del proveedor
 * desde una descripción de CbtesItems con formato ERP (ej: "FC -0001-C-00000010 / 30-71912750-5").
 */
export function parseCompraRefFromCbteItemDescription(desc?: string | null): {
  tipoCbte: string;
  grupoCbte: number;
  letraCbte: string;
  nroCbte: number;
  cuit: string;
} | null {
  if (!desc) return null;
  const match = ITEM_DESC_REGEX.exec(desc);
  if (!match) return null;

  const cuit = cleanCuit(match[5]);
  const grupoCbte = parseInt(match[2], 10);
  const nroCbte = parseInt(match[4], 10);
  if (cuit.length !== 11 || isNaN(grupoCbte) || isNaN(nroCbte)) {
    return null;
  }

  return {
    tipoCbte: match[1].trim().toUpperCase(),
    grupoCbte,
    letraCbte: match[3].trim().toUpperCase(),
    nroCbte,
    cuit,
  };
}

/**
 * Resuelve las facturas de hospitales (Compras + PROVEEDORES) asociadas a un conjunto de Facturas de Venta (Cbtes).
 *
 * 1) Busca primero por el vínculo directo Compras.IdTransaccionFacturaVta.
 * 2) Complementa leyendo CbtesItems (formato COMPROBANTE / CUIT) y cruzando contra Compras + PROVEEDORES
 *    sin utilizar nunca la tabla EMPRESAS.
 */
export async function resolveHospitalPurchasesForFcs(
  db: DbClient,
  appliedFcs: Array<{ fcId: number; clienteId?: number | null }>
) {
  const uniqueFcIds = Array.from(new Set(appliedFcs.map((a) => a.fcId).filter((id) => id > 0)));
  if (uniqueFcIds.length === 0) {
    return {
      purchases: [] as ResolvedCompraWithRelations[],
      directCount: 0,
      cbtesItemsCount: 0,
      unmatchedRefs: [] as ParsedCbteItemRef[],
    };
  }

  const fcIdSet = new Set(uniqueFcIds);
  const fcClienteMap = new Map<number, number | null>();
  for (const item of appliedFcs) {
    if (item.fcId > 0 && item.clienteId !== undefined) {
      fcClienteMap.set(item.fcId, item.clienteId ?? null);
    }
  }

  const missingClienteFcIds = uniqueFcIds.filter((id) => !fcClienteMap.has(id));
  if (missingClienteFcIds.length > 0) {
    const fcsMeta = await db.cbte.findMany({
      where: { id: { in: missingClienteFcIds } },
      select: { id: true, clienteId: true },
    });
    for (const fc of fcsMeta) {
      fcClienteMap.set(fc.id, fc.clienteId);
    }
  }

  // 1. Vínculo directo en ERP: Compras.IdTransaccionFacturaVta
  const directPurchases = await db.compra.findMany({
    where: {
      fcVentaId: { in: uniqueFcIds },
    },
    include: {
      hospital: true,
      cliente: true,
    },
  });

  const resolvedPurchases = [...directPurchases];
  const seenCompraIds = new Set<number>(directPurchases.map((p) => p.id));
  const seenVoucherKeys = new Set<string>();

  for (const p of directPurchases) {
    const cuit = cleanCuit(p.hospital?.cuit);
    const nro = toNum(p.numero);
    if (cuit && nro > 0) {
      seenVoucherKeys.add(makeVoucherKey(cuit, p.grupoCbte, nro));
    }
  }

  // 2. Complemento / Fallback desde CbtesItems de cada FC aplicada
  const rawItems: CbteItemRow[] = [];
  for (const chunk of chunkArray(uniqueFcIds, CHUNK_SIZE)) {
    const rows = await db.$queryRaw<CbteItemRow[]>(
      Prisma.sql`
        SELECT IdTransaccion, NroRenglon, IdProducto, Descripcion, ImporteTotal, IdTrans_Origen
        FROM CbtesItems
        WHERE IdTransaccion IN (${Prisma.join(chunk)})
          AND Descripcion LIKE '%/%'
        ORDER BY IdTransaccion ASC, NroRenglon ASC
      `
    );
    rawItems.push(...rows);
  }

  const pendingRefs: ParsedCbteItemRef[] = [];
  const seenPendingKeys = new Set<string>();

  for (const row of rawItems) {
    const parsed = parseCompraRefFromCbteItemDescription(row.Descripcion);
    if (!parsed) continue;

    const vKey = makeVoucherKey(parsed.cuit, parsed.grupoCbte, parsed.nroCbte);
    if (seenVoucherKeys.has(vKey) || seenPendingKeys.has(vKey)) continue;

    seenPendingKeys.add(vKey);
    pendingRefs.push({
      fcId: row.IdTransaccion,
      fcClienteId: fcClienteMap.get(row.IdTransaccion) ?? null,
      nroRenglon: row.NroRenglon,
      tipoCbte: parsed.tipoCbte,
      grupoCbte: parsed.grupoCbte,
      letraCbte: parsed.letraCbte,
      nroCbte: parsed.nroCbte,
      cuit: parsed.cuit,
      importeTotal: toNum(row.ImporteTotal),
      idTransOrigen: row.IdTrans_Origen ? Number(row.IdTrans_Origen) : 0,
      rawDescripcion: (row.Descripcion || "").trim(),
    });
  }

  let cbtesItemsCount = 0;
  const unmatchedRefs: ParsedCbteItemRef[] = [];

  if (pendingRefs.length > 0) {
    const uniqueNros = Array.from(new Set(pendingRefs.map((r) => r.nroCbte)));
    const candidateCompras: typeof directPurchases = [];

    for (const chunk of chunkArray(uniqueNros, CHUNK_SIZE)) {
      const batch = await db.compra.findMany({
        where: {
          numero: { in: chunk },
        },
        include: {
          hospital: true,
          cliente: true,
        },
      });
      candidateCompras.push(...batch);
    }

    const candidatesByCuitAndNro = new Map<string, typeof directPurchases>();
    for (const c of candidateCompras) {
      const cuit = cleanCuit(c.hospital?.cuit);
      const nro = toNum(c.numero);
      if (!cuit || nro <= 0) continue;
      const key = `${cuit}|${nro}`;
      const list = candidatesByCuitAndNro.get(key) || [];
      list.push(c);
      candidatesByCuitAndNro.set(key, list);
    }

    for (const ref of pendingRefs) {
      const list = candidatesByCuitAndNro.get(`${ref.cuit}|${ref.nroCbte}`) || [];

      const eligible = list.filter((c) => {
        if (seenCompraIds.has(c.id)) return false;
        // No apropiarse de una compra ya vinculada explícitamente en Compras a otra FC ajena
        if (c.fcVentaId && c.fcVentaId > 0 && !fcIdSet.has(c.fcVentaId)) return false;
        if (c.grupoCbte !== ref.grupoCbte) return false;

        const sameCliente = ref.fcClienteId !== null && c.clienteId === ref.fcClienteId;
        const sameImporte = Math.abs(toNum(c.importe) - ref.importeTotal) < 0.05;
        const sameTipo = (c.tipoCbte || "").trim().toUpperCase() === ref.tipoCbte;

        return sameCliente || ref.fcClienteId === null || (sameImporte && sameTipo);
      });

      if (eligible.length === 0) {
        unmatchedRefs.push(ref);
        continue;
      }

      let best = eligible[0];
      let bestScore = -1;

      for (const c of eligible) {
        const sameCliente = ref.fcClienteId !== null && c.clienteId === ref.fcClienteId ? 100 : 0;
        const sameImporte = Math.abs(toNum(c.importe) - ref.importeTotal) < 0.05 ? 50 : 0;
        const sameTipo = (c.tipoCbte || "").trim().toUpperCase() === ref.tipoCbte ? 20 : 0;
        const sameOrigin = ref.idTransOrigen > 0 && c.id === ref.idTransOrigen ? 10 : 0;
        const score = sameCliente + sameImporte + sameTipo + sameOrigin;

        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }

      seenCompraIds.add(best.id);
      seenVoucherKeys.add(makeVoucherKey(ref.cuit, best.grupoCbte, toNum(best.numero)));
      resolvedPurchases.push(best);
      cbtesItemsCount += 1;
    }
  }

  return {
    purchases: resolvedPurchases,
    directCount: directPurchases.length,
    cbtesItemsCount,
    unmatchedRefs,
  };
}

export function formatCompraVoucherNumber(comp: {
  id: number;
  tipoCbte?: string | null;
  grupoCbte?: number | null;
  numero?: unknown;
}): string {
  const prefix = (comp.tipoCbte || "FC").trim().toUpperCase() || "FC";
  const ptoVta = comp.grupoCbte ? String(comp.grupoCbte).padStart(4, "0") : "0000";
  const numVal = toNum(comp.numero);
  return numVal > 0 ? `${prefix}-${ptoVta}-${String(numVal).padStart(8, "0")}` : `${prefix}-${comp.id}`;
}

export function extractLocalidadFromNombre(name?: string | null): string {
  if (!name) return "CAPITAL";
  const parts = name.split("-");
  if (parts.length > 1) {
    return parts[parts.length - 1].trim().toUpperCase() || "CAPITAL";
  }
  return "CAPITAL";
}

export function calculateDefaultGA(brutoAPagar: number): number {
  return Number((Math.max(0, brutoAPagar) * 0.06).toFixed(2));
}

export function buildLiquidacionDetailInputFromCompra(
  comp: {
    id: number;
    tipoCbte?: string | null;
    grupoCbte?: number | null;
    numero: unknown;
    fecha: Date;
    importe: unknown;
    hospitalId?: number | null;
    clienteId?: number | null;
    hospital?: { nombre?: string | null; cuit?: unknown } | null;
  },
  options: {
    liquidationId: number;
    defaultMonthStr: string;
    fallbackClienteId: number;
    fallbackClienteCuit?: unknown;
  }
) {
  const total = toNum(comp.importe);
  const defaultBruto = total;
  const defaultGa = calculateDefaultGA(defaultBruto);
  const defaultNeto = Math.max(0, defaultBruto - defaultGa);
  const compPeriod = comp.fecha
    ? `${(comp.fecha.getMonth() + 1).toString().padStart(2, "0")}/${comp.fecha.getFullYear()}`
    : options.defaultMonthStr;

  const hospitalCuit = cleanCuit(comp.hospital?.cuit);
  const fallbackCuit = cleanCuit(options.fallbackClienteCuit);

  return {
    liquidationId: options.liquidationId,
    compraId: comp.id,
    hospitalId: comp.hospitalId ?? null,
    clienteId: comp.clienteId || options.fallbackClienteId,
    periodo: compPeriod,
    cuit: hospitalCuit || fallbackCuit,
    prestadorNombre: comp.hospital?.nombre || "Hospital Prestador",
    localidad: extractLocalidadFromNombre(comp.hospital?.nombre),
    fcHospital: formatCompraVoucherNumber(comp),
    totalFacturado: total,
    creditos: 0,
    debitos: 0,
    ajustesOs: 0,
    pendientesCobro: 0,
    pagosParcialesAnteriores: 0,
    brutoAPagar: defaultBruto,
    ga: defaultGa,
    ajusteRecupero: 0,
    netoAPagar: defaultNeto,
  };
}
