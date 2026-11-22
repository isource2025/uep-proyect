import { cleanCuit } from "@/lib/hospital-mapping";

export type ErpCircuitCode = "RGA" | "PAMI" | "IOSCOR" | "OS_VARIAS_GLOBAL" | "OS_VARIAS";

export interface ErpFcItemRow {
  fcId: number;
  fcLabel: string;
  fcGrupoCbte: number | null;
  nroRenglon: number;
  idProducto: number | null;
  descripcion: string;
  importeTotal: number;
}

export interface ErpCircuitInfo {
  code: ErpCircuitCode;
  label: string;
  shortLabel: string;
  convenioLabel: string;
  ctaCteTgp: "131441002" | "131441004";
  usesComprasTable: boolean;
  badgeClasses: string;
  description: string;
}

export interface ParsedRgaItem {
  legajo: string | null;
  fcRef: string;
  paciente: string | null;
  dni: string | null;
  siniestro: string | null;
  poliza: string | null;
  hospitalHint: string;
  rawDescripcion: string;
}

export interface ProviderOption {
  id: number;
  nombre: string;
  descripcion?: string;
  cuit: string;
  localidad?: string;
}

const PAMI_CLIENT_ID = 152;
const PAMI_CUIT = "30522763922";
const IOSCOR_CLIENT_ID = 11;
const IOSCOR_CUIT = "30639008319";

const PURCHASE_REF_REGEX =
  /^\s*([A-Z]{2,3})\s*-\s*(\d{1,4})\s*-\s*([A-Z])\s*-\s*(\d+)\s*\/\s*(\d{2}-?\d{8}-?\d)\b/i;

/**
 * Detecta el circuito de facturación ERP de una liquidación basándose en el Punto de Venta (GrupoCbte),
 * el Cliente (PAMI / IOSCOR / Resto) y los renglones de CbtesItems de las FC aplicadas.
 */
export function detectErpBillingCircuit(input: {
  rcGrupoCbte?: number | null;
  clienteId?: number | null;
  clienteCuit?: string | number | null;
  clienteNombre?: string | null;
  appliedFcGrupos?: Array<number | null | undefined>;
  erpFcItems?: ErpFcItemRow[];
}): ErpCircuitInfo {
  const rcGrp = Number(input.rcGrupoCbte || 0);
  const hasGrupo10Fc = (input.appliedFcGrupos || []).some((g) => Number(g || 0) === 10);
  const clienteId = Number(input.clienteId || 0);
  const cuit = cleanCuit(input.clienteCuit);
  const nombreUpper = String(input.clienteNombre || "").toUpperCase();

  // 1. RGA (Seguros / ART / Recupero de Accidentes — Punto de Venta 10, incluye accidentes IOSCOR)
  if (rcGrp === 10 || hasGrupo10Fc) {
    return {
      code: "RGA",
      label: "RGA · Seguros / ART",
      shortLabel: "RGA",
      convenioLabel: "RGA",
      ctaCteTgp: "131441004",
      usesComprasTable: false,
      badgeClasses: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
      description:
        "Facturación directa por legajo/siniestro (Pto. Vta. 10). No genera comprobantes en la tabla Compras: utilice el Asistente RGA para vincular cada renglón de CbtesItems con su Proveedor ERP validado por CUIT.",
    };
  }

  // 2. PAMI
  if (clienteId === PAMI_CLIENT_ID || cuit === PAMI_CUIT || nombreUpper.includes("JUBILADOS Y PENSIONADOS")) {
    return {
      code: "PAMI",
      label: "PAMI · Cápita / Ajustes",
      shortLabel: "PAMI",
      convenioLabel: "PAMI",
      ctaCteTgp: "131441002",
      usesComprasTable: false,
      badgeClasses: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
      description:
        "Facturación global por módulos/cápita y ajustes PAMI (sin facturas de compra individuales en ERP). Utilice el Importador Masivo (pegar desde Excel o subir archivo) para cargar el desglose por hospital validado por CUIT.",
    };
  }

  // 3. IOSCOR (Convenio Provincial Pto. Vta. 9)
  if (clienteId === IOSCOR_CLIENT_ID || cuit === IOSCOR_CUIT || nombreUpper.includes("IOSCOR")) {
    return {
      code: "IOSCOR",
      label: "IOSCOR · Convenio Provincial",
      shortLabel: "IOSCOR",
      convenioLabel: "IOSCOR",
      ctaCteTgp: "131441002",
      usesComprasTable: false,
      badgeClasses: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
      description:
        "Facturación global por rubro/especialidad (sin facturas de compra individuales en ERP). Utilice el Importador Masivo (pegar desde Excel o subir archivo) para cargar el desglose por hospital validado por CUIT.",
    };
  }

  // 4. Obras Sociales Varias — verificar si la FC se emitió en formato global sin desglose FC/CUIT
  const items = input.erpFcItems || [];
  const hasAnyPurchaseRefItem = items.some((it) => PURCHASE_REF_REGEX.test(it.descripcion || ""));
  const hasGlobalNonZeroItem = items.some((it) => it.importeTotal > 0 && !PURCHASE_REF_REGEX.test(it.descripcion || ""));

  if (items.length > 0 && !hasAnyPurchaseRefItem && hasGlobalNonZeroItem) {
    return {
      code: "OS_VARIAS_GLOBAL",
      label: "O.S. Varias · Factura Global",
      shortLabel: "O.S. Global",
      convenioLabel: "OBRAS SOCIALES VARIAS",
      ctaCteTgp: "131441002",
      usesComprasTable: false,
      badgeClasses: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
      description:
        "Factura de venta emitida con renglón global sin detalle de facturas de hospitales en ERP. Puede importar el desglose por hospital mediante el Importador Masivo o agregar renglones manualmente.",
    };
  }

  // 5. Circuito estándar: Obras Sociales Varias con facturas de Compras ERP
  return {
    code: "OS_VARIAS",
    label: "O.S. Varias · Compras ERP",
    shortLabel: "O.S. Varias",
    convenioLabel: "OBRAS SOCIALES VARIAS",
    ctaCteTgp: "131441002",
    usesComprasTable: true,
    badgeClasses: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    description:
      "Circuito estándar con facturas de compra de hospitales en ERP (Compras / CbtesItems).",
  };
}

/**
 * Extrae legajo, paciente, DNI, siniestro, póliza y texto del efector desde un renglón de CbtesItems de RGA.
 */
export function parseRgaCbteItemDescription(rawDesc: string, fallbackRef: string): ParsedRgaItem {
  const desc = (rawDesc || "").replace(/\s+/g, " ").trim();

  const legajoMatch = /\[LEGAJO\s*N[°º]?:\s*([^\]]+)\]/i.exec(desc);
  const legajo = legajoMatch ? legajoMatch[1].trim() : null;

  const pacienteBlockMatch = /PACIENTE\s*\[([^\]]+)\]/i.exec(desc);
  let paciente: string | null = null;
  let dni: string | null = null;
  if (pacienteBlockMatch) {
    const inside = pacienteBlockMatch[1].trim();
    const dniMatch = /D\.?N\.?I\.?\s*N[°º]?:\s*(\d+)/i.exec(inside);
    if (dniMatch) {
      dni = dniMatch[1];
      paciente = inside.slice(0, dniMatch.index).trim() || null;
    } else {
      paciente = inside || null;
    }
  }

  const siniestroMatch = /\[SINIESTRO\s*N[°º]?:\s*([^\]]+)\]/i.exec(desc);
  const siniestro = siniestroMatch ? siniestroMatch[1].trim() : null;

  const polizaMatch = /\[P[ÓO]LIZA\s*N[°º]?:\s*([^\]]+)\]/i.exec(desc);
  const poliza = polizaMatch ? polizaMatch[1].trim() : null;

  // El texto del hospital suele aparecer justo después del monto "$ 1950517,37 ..."
  let hospitalHint = "";
  const afterAmountMatch = /\$\s*[\d.,]+\s*[-–—]?\s*(.+)$/i.exec(desc);
  if (afterAmountMatch) {
    hospitalHint = afterAmountMatch[1].replace(/^[\s\-–—]+/, "").replace(/\.$/, "").trim();
  }

  const fcRef = legajo ? `LEG-${legajo}` : fallbackRef;

  return {
    legajo,
    fcRef,
    paciente,
    dni,
    siniestro,
    poliza,
    hospitalHint,
    rawDescripcion: desc,
  };
}

function normalizeForHintMatch(str: string): string {
  return (str || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bHOSP\.?\b/g, "HOSPITAL")
    .replace(/\bHTAL\.?\b/g, "HOSPITAL")
    .replace(/\bDIR\.?\b/g, "DIRECCION")
    .replace(/\bDR\.?\b/g, "DOCTOR")
    .replace(/\bFCO\.?\b/g, "FRANCISCO")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "HOSPITAL",
  "DOCTOR",
  "DE",
  "LA",
  "EL",
  "LOS",
  "LAS",
  "DEL",
  "Y",
  "EN",
  "SAN",
  "SANTA",
  "CAPITAL",
  "CORRIENTES",
  "DIRECCION",
  "CENTRO",
  "SALUD",
  "CAPS",
  "PUBLICO",
  "PROVINCIAL",
  "REGIONAL",
]);

/**
 * Sugerencia puramente VISUAL para agilizar el Asistente RGA.
 * NUNCA debe guardarse automáticamente sin confirmación explícita del operador.
 */
export function suggestProviderForRgaHint(
  hospitalHint: string,
  providers: ProviderOption[]
): { providerId: number | null; confidence: "high" | "medium" | "none" } {
  const normHint = normalizeForHintMatch(hospitalHint);
  if (!normHint || providers.length === 0) {
    return { providerId: null, confidence: "none" };
  }

  // Palabras clave muy específicas de efectores públicos de Corrientes
  const hintTokens = normHint.split(" ").filter((t) => t.length >= 3);
  const distinctiveHintTokens = hintTokens.filter((t) => !STOPWORDS.has(t));

  if (distinctiveHintTokens.length === 0) {
    return { providerId: null, confidence: "none" };
  }

  let bestId: number | null = null;
  let bestScore = 0;
  let secondBestScore = 0;

  for (const prov of providers) {
    if (!prov.cuit || cleanCuit(prov.cuit).length !== 11) continue;
    const normProv = normalizeForHintMatch(prov.nombre || prov.descripcion || "");
    if (!normProv) continue;

    let score = 0;
    let matchedDistinctive = 0;

    for (const token of distinctiveHintTokens) {
      if (normProv.includes(token)) {
        matchedDistinctive += 1;
        score += token.length >= 6 ? 30 : 20;
      }
    }

    // Bonus si coincide tipo (EMERGENCIA, PEDIATRICO, ESCUELA, VIDAL, BILLINGHURST, etc.)
    if (normHint.includes("EMERGENCIA") && normProv.includes("EMERGENCIA")) {
      score += 45;
    }
    if (normHint.includes("ESCUELA") && normProv.includes("ESCUELA")) {
      score += 45;
    }
    if (normHint.includes("PEDIATRICO") && normProv.includes("PEDIATRICO")) {
      score += 45;
    }
    if (normHint.includes("VIDAL") && normProv.includes("VIDAL")) {
      score += 40;
    }
    if (normHint.includes("BILLINGHURST") && normProv.includes("BILLINGHURST")) {
      score += 50;
    }
    if (normHint.includes("LLANO") && normProv.includes("LLANO")) {
      score += 45;
    }

    if (matchedDistinctive === 0 && score === 0) continue;

    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestId = prov.id;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (bestId === null || bestScore < 25) {
    return { providerId: null, confidence: "none" };
  }

  if (bestScore >= 45 && bestScore - secondBestScore >= 15) {
    return { providerId: bestId, confidence: "high" };
  }

  return { providerId: bestId, confidence: "medium" };
}
