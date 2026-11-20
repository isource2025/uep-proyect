import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

export type BulkFormatKind = "CONCEPTO_IMPORTE" | "DOS_COLUMNAS" | "UNKNOWN";

export interface ParsedBulkRow {
  rowNumber: number;
  rawDoc: string;
  normalizedDoc: string; // solo dígitos (DNI 6-8 dígitos o CUIL 11 dígitos)
  honorarios: number;
  sobreasignaciones: number;
  conceptLabel?: string;
  error?: string;
}

export interface BulkParseResult {
  detectedFormat: BulkFormatKind;
  hasHeader: boolean;
  headerSwapApplied: boolean;
  canToggleSwap: boolean;
  columnSummary: string;
  rows: ParsedBulkRow[];
  validRowCount: number;
  errorRowCount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function stripAccents(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza un DNI o CUIL ingresado (elimina puntos, guiones, espacios y ".0" si vino de Excel).
 */
export function normalizeDocIdentifier(raw: string): {
  digits: string;
  valid: boolean;
  kind?: "DNI" | "CUIL";
  error?: string;
} {
  let cleaned = String(raw ?? "").trim();
  if (!cleaned) {
    return { digits: "", valid: false, error: "DNI / CUIL vacío" };
  }

  // Si Excel exportó un número como "31102338.0" o "20311023387,00"
  if (/^\d+[.,]0+$/.test(cleaned)) {
    cleaned = cleaned.split(/[.,]/)[0];
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 11) {
    return { digits, valid: true, kind: "CUIL" };
  }
  if (digits.length >= 6 && digits.length <= 8) {
    // Quitar ceros a la izquierda por consistencia con división entera en SQL Server
    const trimmedLeading = digits.replace(/^0+/, "");
    if (trimmedLeading.length >= 6) {
      return { digits: trimmedLeading, valid: true, kind: "DNI" };
    }
  }

  return {
    digits,
    valid: false,
    error: `Documento inválido ("${cleaned.slice(0, 24)}"): ingrese DNI (7-8 dígitos) o CUIL (11 dígitos)`,
  };
}

/**
 * Clasifica el texto del concepto en HONORARIOS o SOBREASIGNACION.
 */
export function parseDistributionConcept(raw: string): "HONORARIOS" | "SOBREASIGNACION" | null {
  const norm = stripAccents(raw).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;

  if (
    norm === "h" ||
    norm === "hm" ||
    norm === "hon" ||
    norm === "honor" ||
    norm.startsWith("honorar") ||
    norm.includes("honorario") ||
    norm.includes("medico")
  ) {
    return "HONORARIOS";
  }

  if (
    norm === "s" ||
    norm === "sp" ||
    norm === "sob" ||
    norm === "sobre" ||
    norm.startsWith("sobreasig") ||
    norm.includes("sobreasign") ||
    norm.includes("sobre asig") ||
    norm === "personal"
  ) {
    return "SOBREASIGNACION";
  }

  return null;
}

/**
 * Parsea importes en formato argentino o internacional:
 * "$ 150.000,50", "150.000,50", "150000,50", "150,000.50", "150000.50", "150.000", "150000", "-" o "".
 */
export function parseArgentineAmount(raw: string): {
  value: number;
  valid: boolean;
  isEmpty: boolean;
  error?: string;
} {
  const original = String(raw ?? "").trim();
  if (!original || original === "-" || original === "$ -" || original === "$-") {
    return { value: 0, valid: true, isEmpty: true };
  }

  // Limpiar símbolo $, ARS y espacios
  let s = original
    .replace(/ars/gi, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!s || s === "-") {
    return { value: 0, valid: true, isEmpty: true };
  }

  if (s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"))) {
    return { value: 0, valid: false, isEmpty: false, error: `Importe negativo no permitido ("${original}")` };
  }

  // Solo dígitos, puntos y comas
  if (!/^[0-9.,]+$/.test(s)) {
    return { value: 0, valid: false, isEmpty: false, error: `Importe inválido ("${original}")` };
  }

  const dotCount = (s.match(/\./g) || []).length;
  const commaCount = (s.match(/,/g) || []).length;

  let normalized = s;
  if (dotCount > 0 && commaCount > 0) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Formato argentino: 150.000,50
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 150,000.50
      normalized = s.replace(/,/g, "");
    }
  } else if (commaCount > 0) {
    if (commaCount > 1) {
      // Múltiples comas => separador de miles (1,200,000)
      normalized = s.replace(/,/g, "");
    } else {
      const parts = s.split(",");
      if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
        // Caso ambiguo como "150,000" — en Argentina la coma suele ser decimal solo con 1-2 dígitos
        normalized = parts[0] + parts[1];
      } else {
        normalized = parts[0] + "." + parts[1];
      }
    }
  } else if (dotCount > 0) {
    if (dotCount > 1) {
      // Múltiples puntos => separador de miles (1.200.000)
      normalized = s.replace(/\./g, "");
    } else {
      const parts = s.split(".");
      if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
        // En Argentina "150.000" significa ciento cincuenta mil
        normalized = parts[0] + parts[1];
      } else {
        // Decimal estándar: "150000.50" o "150000.5"
        normalized = s;
      }
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: 0, valid: false, isEmpty: false, error: `Importe inválido ("${original}")` };
  }

  return { value: round2(parsed), valid: true, isEmpty: false };
}

/**
 * Divide texto pegado desde Excel / Google Sheets / CSV en una matriz de filas y columnas.
 */
export function parseClipboardTextToMatrix(text: string): string[][] {
  const rawLines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");
  if (nonEmptyLines.length === 0) return [];

  // Detectar delimitador predominante: Tab (Excel/Sheets) > Punto y coma (CSV AR) > Múltiples espacios > Coma
  const hasTabs = nonEmptyLines.some((l) => l.includes("\t"));
  const hasSemicolons = !hasTabs && nonEmptyLines.some((l) => l.includes(";"));

  return nonEmptyLines.map((line) => {
    if (hasTabs) {
      return line.split("\t").map((cell) => stripQuotes(cell));
    }
    if (hasSemicolons) {
      return splitCsvLine(line, ";");
    }
    // Si hay espacios múltiples separando columnas (ej. copiado de PDF/texto)
    if (/\s{2,}/.test(line.trim())) {
      return line.trim().split(/\s{2,}/).map((cell) => stripQuotes(cell));
    }
    // Coma CSV respetando comillas
    if (line.includes(",")) {
      return splitCsvLine(line, ",");
    }
    return [stripQuotes(line)];
  });
}

function stripQuotes(cell: string): string {
  const trimmed = cell.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Combina 3 cajas de texto pegadas columna por columna (DNI/CUIL, Col 2, Col 3) en una matriz.
 */
export function combinePastedColumns(
  col1Text: string,
  col2Text: string,
  col3Text: string
): string[][] {
  const splitLines = (t: string): string[] => {
    const lines = String(t ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n");
    // Recortar solo líneas vacías finales para mantener alineación por índice
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    return lines.map((l) => l.trim());
  };

  const c1 = splitLines(col1Text);
  const c2 = splitLines(col2Text);
  const c3 = splitLines(col3Text);
  const maxLen = Math.max(c1.length, c2.length, c3.length);

  const matrix: string[][] = [];
  for (let i = 0; i < maxLen; i++) {
    const v1 = c1[i] ?? "";
    const v2 = c2[i] ?? "";
    const v3 = c3[i] ?? "";
    if (!v1 && !v2 && !v3) continue;
    matrix.push([v1, v2, v3]);
  }
  return matrix;
}

function isDocHeader(h: string): boolean {
  return (
    h.includes("dni") ||
    h.includes("cuil") ||
    h.includes("cuit") ||
    h.includes("documento") ||
    h === "doc" ||
    h.includes("nro doc") ||
    h.includes("agente")
  );
}

function isConceptHeader(h: string): boolean {
  return h.includes("concepto") || h.includes("tipo") || h.includes("rubro") || h.includes("item");
}

function isAmountHeader(h: string): boolean {
  return h.includes("importe") || h.includes("monto") || h.includes("valor") || h.includes("total") || h === "$";
}

function isHonorariosHeader(h: string): boolean {
  return h.includes("honorar") || h === "hon" || h === "hm";
}

function isSobreasignacionHeader(h: string): boolean {
  return h.includes("sobreasig") || h.includes("sobre asig") || h === "sob" || h === "sp";
}

function detectHeaderRow(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  let hits = 0;
  for (const cell of row) {
    const h = stripAccents(cell);
    if (
      isDocHeader(h) ||
      isConceptHeader(h) ||
      isAmountHeader(h) ||
      isHonorariosHeader(h) ||
      isSobreasignacionHeader(h) ||
      h.includes("apellido") ||
      h.includes("nombre") ||
      h.includes("legajo")
    ) {
      hits++;
    }
  }
  // Si al menos 2 celdas parecen encabezado, o 1 celda es claramente encabezado y ninguna es un DNI numérico válido
  if (hits >= 2) return true;
  if (hits === 1) {
    const hasValidDoc = row.some((c) => normalizeDocIdentifier(c).valid);
    return !hasValidDoc;
  }
  return false;
}

/**
 * Parsea automáticamente una matriz de celdas soportando ambos formatos:
 * - Formato A: DNI/CUIL | Concepto (Honorarios / Sobreasignación) | Importe
 * - Formato B: DNI/CUIL | Honorarios | Sobreasignación (o invertido)
 */
export function parseBulkDistributionMatrix(
  rawMatrix: string[][],
  options: { swapTwoColumns?: boolean } = {}
): BulkParseResult {
  const { swapTwoColumns = false } = options;

  const matrix = rawMatrix.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (matrix.length === 0) {
    return {
      detectedFormat: "UNKNOWN",
      hasHeader: false,
      headerSwapApplied: false,
      canToggleSwap: false,
      columnSummary: "Sin datos para analizar",
      rows: [],
      validRowCount: 0,
      errorRowCount: 0,
    };
  }

  const hasHeader = detectHeaderRow(matrix[0]);
  const headerCells = hasHeader ? matrix[0].map((c) => stripAccents(c)) : [];
  const dataRows = hasHeader ? matrix.slice(1) : matrix;

  if (dataRows.length === 0) {
    return {
      detectedFormat: "UNKNOWN",
      hasHeader,
      headerSwapApplied: false,
      canToggleSwap: false,
      columnSummary: "Se detectó encabezado pero no hay filas de datos",
      rows: [],
      validRowCount: 0,
      errorRowCount: 0,
    };
  }

  let detectedFormat: BulkFormatKind = "UNKNOWN";
  let docIdx = -1;
  let conceptIdx = -1;
  let amountIdx = -1;
  let honIdx = -1;
  let sobIdx = -1;
  let canToggleSwap = false;

  // 1) Intentar mapeo por nombres de encabezado si hay cabecera
  if (hasHeader) {
    headerCells.forEach((h, idx) => {
      if (docIdx === -1 && isDocHeader(h)) docIdx = idx;
      else if (honIdx === -1 && isHonorariosHeader(h)) honIdx = idx;
      else if (sobIdx === -1 && isSobreasignacionHeader(h)) sobIdx = idx;
      else if (conceptIdx === -1 && isConceptHeader(h)) conceptIdx = idx;
      else if (amountIdx === -1 && isAmountHeader(h)) amountIdx = idx;
    });

    if (docIdx !== -1 && conceptIdx !== -1 && amountIdx !== -1) {
      detectedFormat = "CONCEPTO_IMPORTE";
    } else if (docIdx !== -1 && (honIdx !== -1 || sobIdx !== -1)) {
      detectedFormat = "DOS_COLUMNAS";
    }
  }

  // 2) Auto-detección por contenido de las primeras filas (cuando no hay encabezados o no se reconocieron)
  if (detectedFormat === "UNKNOWN") {
    const sample = dataRows.slice(0, 15);
    const maxCols = Math.max(...sample.map((r) => r.length), 0);

    const colStats = Array.from({ length: maxCols }, (_, idx) => {
      let docHits = 0;
      let conceptHits = 0;
      let amountHits = 0;
      let nonEmpty = 0;

      for (const row of sample) {
        const val = String(row[idx] ?? "").trim();
        if (!val) continue;
        nonEmpty++;
        if (normalizeDocIdentifier(val).valid) docHits++;
        if (parseDistributionConcept(val) !== null) conceptHits++;
        const amt = parseArgentineAmount(val);
        if (amt.valid && !amt.isEmpty) amountHits++;
      }
      return { idx, docHits, conceptHits, amountHits, nonEmpty };
    });

    // Elegir columna de DNI/CUIL (prioriza col 0 si tiene docs válidos, si no la de mayor score)
    if (docIdx === -1) {
      const sortedDocs = [...colStats]
        .filter((s) => s.docHits > 0)
        .sort((a, b) => b.docHits - a.docHits || a.idx - b.idx);
      docIdx = sortedDocs.length > 0 ? sortedDocs[0].idx : 0;
    }

    const otherCols = colStats.filter((s) => s.idx !== docIdx);

    // ¿Existe una columna claramente de Concepto (Honorarios / Sobreasignación)?
    const conceptCandidates = otherCols
      .filter((s) => s.conceptHits > 0)
      .sort((a, b) => b.conceptHits - a.conceptHits);

    if (conceptCandidates.length > 0) {
      conceptIdx = conceptCandidates[0].idx;
      const amountCandidates = otherCols
        .filter((s) => s.idx !== conceptIdx && s.amountHits > 0)
        .sort((a, b) => b.amountHits - a.amountHits || a.idx - b.idx);
      amountIdx =
        amountCandidates.length > 0
          ? amountCandidates[0].idx
          : otherCols.find((s) => s.idx !== conceptIdx)?.idx ?? -1;

      if (amountIdx !== -1) {
        detectedFormat = "CONCEPTO_IMPORTE";
      }
    }

    // Si no hubo columna de Concepto, buscar 2 columnas numéricas (Honorarios / Sobreasignación)
    if (detectedFormat === "UNKNOWN") {
      const numericCols = otherCols.filter((s) => s.amountHits > 0 || s.nonEmpty > 0);
      if (numericCols.length >= 2) {
        detectedFormat = "DOS_COLUMNAS";
        canToggleSwap = true;
        if (swapTwoColumns) {
          sobIdx = numericCols[0].idx;
          honIdx = numericCols[1].idx;
        } else {
          honIdx = numericCols[0].idx;
          sobIdx = numericCols[1].idx;
        }
      } else if (numericCols.length === 1 && otherCols.length >= 2) {
        // Por ejemplo: todos dejaron Sobreasignación vacía (solo hay números en una columna)
        detectedFormat = "DOS_COLUMNAS";
        canToggleSwap = true;
        if (swapTwoColumns) {
          sobIdx = otherCols[0].idx;
          honIdx = otherCols[1].idx;
        } else {
          honIdx = otherCols[0].idx;
          sobIdx = otherCols[1].idx;
        }
      }
    }
  }

  if (detectedFormat === "UNKNOWN") {
    return {
      detectedFormat: "UNKNOWN",
      hasHeader,
      headerSwapApplied: false,
      canToggleSwap: false,
      columnSummary:
        "No se pudo reconocer el formato. Usá 3 columnas: [DNI/CUIL | Concepto | Importe] o [DNI/CUIL | Honorarios | Sobreasignación].",
      rows: dataRows.map((row, i) => ({
        rowNumber: (hasHeader ? 2 : 1) + i,
        rawDoc: String(row[0] ?? "").trim(),
        normalizedDoc: "",
        honorarios: 0,
        sobreasignaciones: 0,
        error: "Formato de columnas no reconocido (se esperan 3 columnas).",
      })),
      validRowCount: 0,
      errorRowCount: dataRows.length,
    };
  }

  // 3) Parsear fila por fila
  const parsedRows: ParsedBulkRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = (hasHeader ? 2 : 1) + i;
    const rawDoc = String(row[docIdx] ?? "").trim();
    const docCheck = normalizeDocIdentifier(rawDoc);

    if (detectedFormat === "CONCEPTO_IMPORTE") {
      const rawConcept = String(row[conceptIdx] ?? "").trim();
      const rawAmount = String(row[amountIdx] ?? "").trim();
      const concept = parseDistributionConcept(rawConcept);
      const amount = parseArgentineAmount(rawAmount);

      const errors: string[] = [];
      if (!docCheck.valid) errors.push(docCheck.error || "DNI/CUIL inválido");
      if (!concept) {
        errors.push(
          rawConcept
            ? `Concepto no reconocido ("${rawConcept}"): use Honorarios o Sobreasignación`
            : "Falta indicar Concepto (Honorarios o Sobreasignación)"
        );
      }
      if (!amount.valid) {
        errors.push(amount.error || "Importe inválido");
      } else if (amount.value <= 0) {
        errors.push("El importe debe ser mayor a $ 0");
      }

      parsedRows.push({
        rowNumber,
        rawDoc,
        normalizedDoc: docCheck.valid ? docCheck.digits : "",
        honorarios: concept === "HONORARIOS" && amount.valid ? amount.value : 0,
        sobreasignaciones: concept === "SOBREASIGNACION" && amount.valid ? amount.value : 0,
        conceptLabel:
          concept === "HONORARIOS"
            ? "Honorarios"
            : concept === "SOBREASIGNACION"
            ? "Sobreasignación"
            : rawConcept,
        error: errors.length > 0 ? errors.join(" · ") : undefined,
      });
    } else {
      // DOS_COLUMNAS
      const rawHon = honIdx >= 0 ? String(row[honIdx] ?? "").trim() : "";
      const rawSob = sobIdx >= 0 ? String(row[sobIdx] ?? "").trim() : "";
      const honAmt = parseArgentineAmount(rawHon);
      const sobAmt = parseArgentineAmount(rawSob);

      const errors: string[] = [];
      if (!docCheck.valid) errors.push(docCheck.error || "DNI/CUIL inválido");
      if (!honAmt.valid) errors.push(`Honorarios: ${honAmt.error}`);
      if (!sobAmt.valid) errors.push(`Sobreasignación: ${sobAmt.error}`);
      if (honAmt.valid && sobAmt.valid && honAmt.value <= 0 && sobAmt.value <= 0) {
        errors.push("Honorarios y Sobreasignación no pueden ser ambos $ 0");
      }

      parsedRows.push({
        rowNumber,
        rawDoc,
        normalizedDoc: docCheck.valid ? docCheck.digits : "",
        honorarios: honAmt.valid ? honAmt.value : 0,
        sobreasignaciones: sobAmt.valid ? sobAmt.value : 0,
        error: errors.length > 0 ? errors.join(" · ") : undefined,
      });
    }
  }

  const validRowCount = parsedRows.filter((r) => !r.error).length;
  const errorRowCount = parsedRows.length - validRowCount;

  const columnSummary =
    detectedFormat === "CONCEPTO_IMPORTE"
      ? "Formato detectado: DNI/CUIL + Concepto (Honorarios / Sobreasignación) + Importe"
      : swapTwoColumns && canToggleSwap
      ? "Formato detectado: DNI/CUIL + Sobreasignación + Honorarios"
      : honIdx !== -1 && sobIdx !== -1 && sobIdx < honIdx
      ? "Formato detectado: DNI/CUIL + Sobreasignación + Honorarios"
      : "Formato detectado: DNI/CUIL + Honorarios + Sobreasignación";

  return {
    detectedFormat,
    hasHeader,
    headerSwapApplied: Boolean(canToggleSwap && swapTwoColumns),
    canToggleSwap,
    columnSummary,
    rows: parsedRows,
    validRowCount,
    errorRowCount,
  };
}

/**
 * Lee un archivo Excel (.xlsx, .xls, .csv) en el navegador y devuelve la matriz de celdas
 * de la primera hoja que contenga filas de datos.
 */
export function parseExcelBufferToMatrix(buffer: ArrayBuffer): {
  sheetName: string;
  matrix: string[][];
} {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", raw: true });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return { sheetName: "", matrix: [] };
  }

  const sheetToMatrix = (name: string): string[][] => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: true,
    });

    return rawRows
      .map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return String(cell);
          return String(cell).trim();
        })
      )
      .filter((row) => row.some((c) => c !== ""));
  };

  // Si el usuario descargó nuestra plantilla con 2 hojas y completó la Hoja 2 dejando la Hoja 1 solo con encabezados,
  // elegir automáticamente la hoja que realmente tiene filas de datos.
  let fallback: { sheetName: string; matrix: string[][] } | null = null;
  for (const name of wb.SheetNames) {
    const mat = sheetToMatrix(name);
    if (mat.length === 0) continue;

    // Ignorar columnas de ayuda/instrucciones si las hubiera a la derecha en la plantilla
    const trimmedMat = mat.map((row) => {
      // Si la fila 0 tiene exactamente 3 encabezados en cols 0..2 y texto de ayuda en col 4+, quedarnos con cols 0..2
      if (mat[0].length > 3 && String(mat[0][3] ?? "").trim() === "") {
        return row.slice(0, 3);
      }
      return row;
    });

    const hasHeader = detectHeaderRow(trimmedMat[0]);
    const dataCount = hasHeader ? trimmedMat.length - 1 : trimmedMat.length;
    if (dataCount > 0) {
      return { sheetName: name, matrix: trimmedMat };
    }
    if (!fallback) {
      fallback = { sheetName: name, matrix: trimmedMat };
    }
  }

  return fallback || { sheetName: wb.SheetNames[0], matrix: [] };
}

/**
 * Genera y descarga la plantilla oficial Excel (.xlsx) con ambos formatos listos para usar:
 * - Hoja 1 "Por Concepto": DNI o CUIL | Concepto (desplegable) | Importe
 * - Hoja 2 "Por Columnas": DNI o CUIL | Honorarios | Sobreasignación
 */
export async function downloadBulkDistributionTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP - Unidad Ejecutora Provincial";
  wb.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" }, // Teal 700
  };
  const noteFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF0FDFA" }, // Teal 50
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  // =========================================================================
  // HOJA 1: POR CONCEPTO (DNI o CUIL | Concepto | Importe)
  // =========================================================================
  const ws1 = wb.addWorksheet("Por Concepto");
  ws1.columns = [
    { key: "doc", width: 22 },
    { key: "concepto", width: 24 },
    { key: "importe", width: 20 },
    { key: "sep", width: 4 },
    { key: "help", width: 58 },
  ];

  const h1 = ws1.getRow(1);
  h1.values = ["DNI o CUIL", "Concepto", "Importe"];
  h1.height = 24;
  for (let c = 1; c <= 3; c++) {
    const cell = h1.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  }

  // Formato de celdas y desplegable para 500 filas
  for (let r = 2; r <= 501; r++) {
    const row = ws1.getRow(r);
    row.getCell(1).numFmt = "@";
    row.getCell(2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Honorarios,Sobreasignación"'],
      showErrorMessage: true,
      errorTitle: "Concepto inválido",
      error: "Seleccione Honorarios o Sobreasignación.",
    };
    row.getCell(3).numFmt = '#,##0.00';
  }

  // Cuadro de instrucciones rápidas al costado (Columna E, separada por Columna D vacía)
  const helpLines1 = [
    "INSTRUCCIONES — FORMATO 1 (POR CONCEPTO)",
    "1. Pegá en la columna A el DNI (7 u 8 dígitos) o CUIL (11 dígitos).",
    "2. En la columna B indicá Honorarios o Sobreasignación (también acepta Hon / Sob).",
    "3. En la columna C pegá el importe (sin signo negativo).",
    "4. Si un agente cobra ambos conceptos, podés repetir su DNI en 2 filas y el sistema los suma.",
    "5. Si preferís cargar Honorarios y Sobreasignación en columnas separadas, usá la Hoja 2 (Por Columnas).",
  ];
  helpLines1.forEach((line, idx) => {
    const cell = ws1.getCell(`E${idx + 1}`);
    cell.value = line;
    cell.font = {
      name: "Arial",
      size: 9,
      bold: idx === 0,
      color: idx === 0 ? { argb: "FF115E59" } : { argb: "FF334155" },
    };
    cell.fill = noteFill;
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  // =========================================================================
  // HOJA 2: POR COLUMNAS (DNI o CUIL | Honorarios | Sobreasignación)
  // =========================================================================
  const ws2 = wb.addWorksheet("Por Columnas");
  ws2.columns = [
    { key: "doc", width: 22 },
    { key: "hon", width: 22 },
    { key: "sob", width: 24 },
    { key: "sep", width: 4 },
    { key: "help", width: 58 },
  ];

  const h2 = ws2.getRow(1);
  h2.values = ["DNI o CUIL", "Honorarios", "Sobreasignación"];
  h2.height = 24;
  for (let c = 1; c <= 3; c++) {
    const cell = h2.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  }

  for (let r = 2; r <= 501; r++) {
    const row = ws2.getRow(r);
    row.getCell(1).numFmt = "@";
    row.getCell(2).numFmt = '#,##0.00';
    row.getCell(3).numFmt = '#,##0.00';
  }

  const helpLines2 = [
    "INSTRUCCIONES — FORMATO 2 (POR COLUMNAS)",
    "1. Pegá en la columna A el DNI (7 u 8 dígitos) o CUIL (11 dígitos).",
    "2. En la columna B pegá el monto de Honorarios (podés dejar vacío o 0).",
    "3. En la columna C pegá el monto de Sobreasignación (podés dejar vacío o 0).",
    "4. Guardá el archivo y subilo en 'Carga Masiva' dentro de la liquidación.",
    "Nota: Si completás esta hoja, dejá la Hoja 1 (Por Concepto) vacía.",
  ];
  helpLines2.forEach((line, idx) => {
    const cell = ws2.getCell(`E${idx + 1}`);
    cell.value = line;
    cell.font = {
      name: "Arial",
      size: 9,
      bold: idx === 0,
      color: idx === 0 ? { argb: "FF115E59" } : { argb: "FF334155" },
    };
    cell.fill = noteFill;
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Plantilla_Carga_Masiva_Personal_UEP.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
