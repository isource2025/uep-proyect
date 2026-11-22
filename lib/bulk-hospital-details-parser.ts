import * as XLSX from "xlsx";
import { cleanCuit } from "@/lib/hospital-mapping";

export interface ParsedHospitalImportRow {
  rowNumber: number;
  rawIdentifier: string;
  normalizedCuit: string;
  parsedCodigoImedic: number | null;
  periodo: string;
  fcHospital: string;
  totalFacturado: number;
  creditos: number;
  debitos: number;
  ajustesOs: number;
  pendientesCobro: number;
  pagosParcialesAnteriores: number;
  gaPercent: number | null; // null => usa default global del modal
  ajusteRecupero: number;
  parseError?: string;
}

export interface HospitalImportParseResult {
  rows: ParsedHospitalImportRow[];
  hasHeader: boolean;
  detectedColumns: string[];
  skippedBlankRows: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parsea importes en formato argentino ($ 1.234.567,89 o -12.345,50) o internacional (1234567.89).
 */
export function parseLocaleAmount(raw: unknown, allowNegative = false): number | null {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (!allowNegative && raw < 0) return null;
    return round2(raw);
  }

  let s = String(raw).trim();
  if (!s || s === "-" || s === "—") return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[$ARSars%\s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El último separador define el decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      s = s.replace(/\./g, "");
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1) {
      // Ambiguo: "1.500" suele ser mil quinientos en planillas argentinas
      s = s.replace(/\./g, "");
    }
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  const signed = negative ? -Math.abs(num) : num;
  if (!allowNegative && signed < 0) return null;
  return round2(signed);
}

export function parseClipboardToMatrix(text: string): string[][] {
  const normalized = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const matrix: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.includes("\t")) {
      matrix.push(line.split("\t").map((c) => c.trim()));
    } else if (line.includes(";")) {
      matrix.push(line.split(";").map((c) => c.trim()));
    } else {
      // Fallback: CSV simple o 2+ espacios
      const byComma = line.split(",");
      if (byComma.length >= 2) {
        matrix.push(byComma.map((c) => c.trim()));
      } else {
        matrix.push(line.split(/\s{2,}/).map((c) => c.trim()));
      }
    }
  }

  return matrix;
}

export function parseSpreadsheetBufferToMatrix(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

function normHeader(h: unknown): string {
  return String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ColKey =
  | "identifier"
  | "totalFacturado"
  | "creditos"
  | "debitos"
  | "ajustesOs"
  | "pendientesCobro"
  | "pagosParciales"
  | "gaPercent"
  | "ajusteRecupero"
  | "periodo"
  | "fcHospital";

function matchHeaderToCol(h: string): ColKey | null {
  if (!h) return null;
  if (h.includes("cuit") || h.includes("imedic") || h.includes("cod prov") || h === "codigo" || h === "idproveedor") {
    return "identifier";
  }
  if (h.includes("facturado") || h === "importe" || h === "monto" || h.includes("total fact") || h === "bruto") {
    return "totalFacturado";
  }
  if (h.includes("comprobante") || h.includes("factura") || h === "fc" || h.includes("ref") || h.includes("legajo")) {
    return "fcHospital";
  }
  if (h.includes("credito")) return "creditos";
  if (h.includes("debito")) return "debitos";
  if (h.includes("ajuste") && (h.includes("os") || h.includes("o s") || h.includes("pami") || h.includes("capita") || !h.includes("recup"))) {
    return "ajustesOs";
  }
  if (h.includes("pend")) return "pendientesCobro";
  if (h.includes("parc") || h.includes("pagos ant") || h.includes("pago ant") || h.includes("anteriores")) {
    return "pagosParciales";
  }
  if (h === "ga" || h.includes("ga %") || h.includes("gasto admin") || h.includes("% ga")) return "gaPercent";
  if (h.includes("adelanto") || h.includes("recupero")) return "ajusteRecupero";
  if (h.includes("periodo") || h.includes("mes")) return "periodo";
  return null;
}

/**
 * Parsea una matriz (de portapapeles o Excel) en renglones de hospitales listos para validar contra PROVEEDORES.
 *
 * Orden por defecto (sin encabezados):
 *   Col 0: CUIT o Código iMedic (obligatorio)
 *   Col 1: Total Facturado (obligatorio)
 *   Col 2: Débitos (opcional)
 *   Col 3: Créditos (opcional)
 *   Col 4: Ajustes O.S. (opcional, admite negativos)
 *   Col 5: Comprobante / Ref (opcional)
 *   Col 6: Período (opcional)
 */
export function parseHospitalDetailsMatrix(
  matrix: unknown[][],
  defaultPeriodo: string
): HospitalImportParseResult {
  const nonEmptyRows: Array<{ rowNumber: number; cells: unknown[] }> = [];
  let skippedBlankRows = 0;

  matrix.forEach((rawRow, idx) => {
    const cells = Array.isArray(rawRow) ? rawRow : [];
    const hasData = cells.some((c) => String(c ?? "").trim() !== "");
    if (!hasData) {
      skippedBlankRows += 1;
      return;
    }
    nonEmptyRows.push({ rowNumber: idx + 1, cells });
  });

  if (nonEmptyRows.length === 0) {
    return { rows: [], hasHeader: false, detectedColumns: [], skippedBlankRows };
  }

  // Detectar si la primera fila es un encabezado
  const firstRowNorm = nonEmptyRows[0].cells.map(normHeader);
  const headerMatches = firstRowNorm.map(matchHeaderToCol);
  const recognizedCount = headerMatches.filter(Boolean).length;
  const hasHeader = recognizedCount >= 2;

  const colMap: Partial<Record<ColKey, number>> = {};
  if (hasHeader) {
    headerMatches.forEach((colKey, idx) => {
      if (colKey && colMap[colKey] === undefined) {
        colMap[colKey] = idx;
      }
    });
  } else {
    colMap.identifier = 0;
    colMap.totalFacturado = 1;
    colMap.debitos = 2;
    colMap.creditos = 3;
    colMap.ajustesOs = 4;
    colMap.fcHospital = 5;
    colMap.periodo = 6;
  }

  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
  const rows: ParsedHospitalImportRow[] = [];

  for (const entry of dataRows) {
    const getCell = (key: ColKey) => {
      const idx = colMap[key];
      return idx !== undefined ? entry.cells[idx] : undefined;
    };

    const rawId = String(getCell("identifier") ?? "").trim();
    const cleanDigits = cleanCuit(rawId);

    // Ignorar filas de totales típicas copiadas al final desde Excel ("TOTAL", "SUBTOTAL")
    if (/^(total|subtotal|suma)/i.test(rawId)) {
      continue;
    }

    const normalizedCuit = cleanDigits.length === 11 ? cleanDigits : "";
    const parsedCodigoImedic =
      !normalizedCuit && /^\d{1,6}$/.test(cleanDigits) ? parseInt(cleanDigits, 10) : null;

    const totalFact = parseLocaleAmount(getCell("totalFacturado"), false);
    const creditos = parseLocaleAmount(getCell("creditos"), false);
    const debitos = parseLocaleAmount(getCell("debitos"), false);
    const ajustesOs = parseLocaleAmount(getCell("ajustesOs"), true);
    const pendientesCobro = parseLocaleAmount(getCell("pendientesCobro"), false);
    const pagosParciales = parseLocaleAmount(getCell("pagosParciales"), false);
    const ajusteRecupero = parseLocaleAmount(getCell("ajusteRecupero"), false);

    const rawGa = getCell("gaPercent");
    let gaPercent: number | null = null;
    if (rawGa !== undefined && String(rawGa).trim() !== "") {
      const parsedGa = parseLocaleAmount(rawGa, false);
      if (parsedGa !== null && parsedGa >= 0 && parsedGa <= 100) {
        gaPercent = parsedGa;
      }
    }

    const periodo = String(getCell("periodo") ?? "").trim() || defaultPeriodo;
    const fcHospital = String(getCell("fcHospital") ?? "").trim();

    let parseError: string | undefined;
    if (!rawId) {
      parseError = "Falta CUIT o Código iMedic del establecimiento.";
    } else if (!normalizedCuit && parsedCodigoImedic === null) {
      parseError = `Identificador "${rawId}" inválido (ingrese CUIT de 11 dígitos o Código iMedic numérico).`;
    } else if (totalFact === null || totalFact <= 0) {
      parseError = "El importe Facturado debe ser un número mayor a 0.";
    } else if (
      creditos === null ||
      debitos === null ||
      ajustesOs === null ||
      pendientesCobro === null ||
      pagosParciales === null ||
      ajusteRecupero === null
    ) {
      parseError = "Uno de los importes numéricos (débitos/créditos/ajustes) tiene formato inválido.";
    }

    rows.push({
      rowNumber: entry.rowNumber,
      rawIdentifier: rawId,
      normalizedCuit,
      parsedCodigoImedic,
      periodo,
      fcHospital,
      totalFacturado: totalFact ?? 0,
      creditos: creditos ?? 0,
      debitos: debitos ?? 0,
      ajustesOs: ajustesOs ?? 0,
      pendientesCobro: pendientesCobro ?? 0,
      pagosParcialesAnteriores: pagosParciales ?? 0,
      gaPercent,
      ajusteRecupero: ajusteRecupero ?? 0,
      parseError,
    });
  }

  return {
    rows,
    hasHeader,
    detectedColumns: Object.keys(colMap),
    skippedBlankRows,
  };
}

/**
 * Descarga una plantilla Excel (.xlsx) oficial para importar renglones de hospitales (PAMI / IOSCOR / Global).
 */
export function downloadHospitalDetailsTemplate(defaultPeriodo: string, circuitLabel = "Liquidacion") {
  const wb = XLSX.utils.book_new();

  const sampleData = [
    {
      "CUIT o Código iMedic": "33-62757551-9",
      "Total Facturado": 1500000.0,
      "Débitos": 25000.0,
      "Créditos": 0,
      "Ajustes O.S.": 0,
      "Pend. Cobro": 0,
      "Pagos Parc. Ant.": 0,
      "GA %": 6,
      "Adelantos": 0,
      "Comprobante / Ref": "CAPITA-01",
      "Período": defaultPeriodo || "06/2026",
    },
    {
      "CUIT o Código iMedic": "30-68795591-5",
      "Total Facturado": 845200.5,
      "Débitos": 0,
      "Créditos": 0,
      "Ajustes O.S.": -15000.0,
      "Pend. Cobro": 0,
      "Pagos Parc. Ant.": 0,
      "GA %": 6,
      "Adelantos": 0,
      "Comprobante / Ref": "CAPITA-02",
      "Período": defaultPeriodo || "06/2026",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Hospitales");

  const instructions = [
    ["INSTRUCCIONES DE CARGA MASIVA DE HOSPITALES (UEP MSP)"],
    [""],
    ["1. Complete la hoja 'Hospitales' con un renglón por establecimiento sanitario."],
    ["2. La columna 'CUIT o Código iMedic' valida estrictamente contra la tabla PROVEEDORES del ERP (aceptando CUIT de 11 dígitos con o sin guiones, o IDPROVEEDOR numérico)."],
    ["3. Columnas obligatorias: 'CUIT o Código iMedic' y 'Total Facturado'."],
    ["4. El resto de columnas son opcionales (si se dejan vacías se asume 0, y GA % toma 6% por defecto)."],
    ["5. 'Ajustes O.S.' admite valores negativos (ej. descuentos de cápita / anticipos PAMI) o positivos."],
    ["6. También puede copiar directamente sus columnas desde Excel y pegarlas en el importador sin subir archivo."],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instrucciones");

  const safeLabel = circuitLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  XLSX.writeFile(wb, `Plantilla_Hospitales_${safeLabel}.xlsx`);
}
