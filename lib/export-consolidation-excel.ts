import ExcelJS from "exceljs";
import type {
  ConsolidationBatchData,
  ConsolidationHospitalSummary,
  ConvenioTgp,
} from "@/lib/consolidation-types";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const ACCOUNTING_FMT = '$ #,##0.00;-$ #,##0.00;"-"';
const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TITLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" }, // Slate 900
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" }, // Slate 200
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFECFDF5" }, // Emerald 50
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF0F172A" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "double", color: { argb: "FF0F172A" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function setupLandscapeSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  return wb.addWorksheet(name.slice(0, 31), {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
      showGridLines: true,
    },
    views: [{ showGridLines: true }],
  });
}

function styleRangeRow(
  row: ExcelJS.Row,
  fromCol: number,
  toCol: number,
  opts: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.Fill;
    border?: Partial<ExcelJS.Borders>;
    alignment?: Partial<ExcelJS.Alignment>;
  }
) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = row.getCell(c);
    if (opts.font) cell.font = opts.font;
    if (opts.fill) cell.fill = opts.fill;
    if (opts.border) cell.border = opts.border;
    if (opts.alignment) cell.alignment = opts.alignment;
  }
}

function formatCuitStr(cuit: string): string {
  const c = (cuit || "").replace(/\D/g, "");
  if (c.length === 11) return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  return cuit || "-";
}

function triggerExcelBrowserDownload(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileSlug(str: string): string {
  return (str || "Consolidado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function addGastoAdminAnnualSheet(
  wb: ExcelJS.Workbook,
  batchesForYear: ConsolidationBatchData[],
  targetYear: number
) {
  const wsGa = setupLandscapeSheet(wb, "Gasto Administrativo");
  wsGa.mergeCells("A1:N1");
  const title = wsGa.getCell("A1");
  title.value = `GASTO ADMINISTRATIVO ANUAL POR CONVENIO (${targetYear}) - UEP MSP`;
  title.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = TITLE_FILL;
  title.alignment = { horizontal: "center", vertical: "middle" };
  wsGa.getRow(1).height = 26;

  const headers = [
    "CONVENIO",
    ...MONTH_SHORT.map((m) => `${m}-${String(targetYear).slice(-2)}`),
    "TOTAL ANUAL ($)",
  ];
  const hRow = wsGa.getRow(3);
  hRow.values = headers;
  hRow.height = 22;
  styleRangeRow(hRow, 1, 14, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const conveniosOrder: ConvenioTgp[] = [
    "IOSCOR",
    "OBRAS SOCIALES VARIAS",
    "PAMI",
    "RGA",
  ];
  const matrix = new Map<ConvenioTgp, number[]>();
  for (const conv of conveniosOrder) {
    matrix.set(conv, new Array(12).fill(0));
  }

  for (const batch of batchesForYear) {
    if (batch.anio !== targetYear || batch.mes < 1 || batch.mes > 12) continue;
    const mIdx = batch.mes - 1;
    for (const liq of batch.liquidaciones) {
      const arr = matrix.get(liq.convenio) || matrix.get("OBRAS SOCIALES VARIAS")!;
      arr[mIdx] = round2(arr[mIdx] + Math.abs(liq.ga || 0));
    }
  }

  let nextRow = 4;
  const colTotals = new Array(12).fill(0);
  let grandTotal = 0;

  for (const conv of conveniosOrder) {
    const vals = matrix.get(conv)!;
    const rowSum = round2(vals.reduce((s, v) => s + v, 0));
    grandTotal = round2(grandTotal + rowSum);
    vals.forEach((v, idx) => {
      colTotals[idx] = round2(colTotals[idx] + v);
    });

    const row = wsGa.getRow(nextRow++);
    row.values = [conv, ...vals, rowSum];
    row.height = 20;
    styleRangeRow(row, 1, 14, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(1).font = { name: "Arial", size: 9, bold: true };
    for (let c = 2; c <= 14; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(14).font = { name: "Arial", size: 9, bold: true };
  }

  const totRow = wsGa.getRow(nextRow);
  totRow.values = ["TOTAL GENERAL", ...colTotals, grandTotal];
  totRow.height = 22;
  styleRangeRow(totRow, 1, 14, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 2; c <= 14; c++) {
    totRow.getCell(c).numFmt = ACCOUNTING_FMT;
    totRow.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  wsGa.columns = [
    { width: 26 },
    ...MONTH_SHORT.map(() => ({ width: 15 })),
    { width: 18 },
  ];
}

function addResumenAnualEfectoresSheet(
  wb: ExcelJS.Workbook,
  batchesForYear: ConsolidationBatchData[],
  targetYear: number
) {
  const ws = setupLandscapeSheet(wb, "Resumen Anual Efectores");
  ws.mergeCells("A1:E1");
  const title = ws.getCell("A1");
  title.value = `RESUMEN ANUAL POR EFECTORES (${targetYear}) - UEP MSP`;
  title.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = TITLE_FILL;
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  const hRow = ws.getRow(3);
  hRow.values = [
    "MES CONSOLIDADO",
    "HONORARIOS MÉDICOS ($)",
    "SOBREASIGNACIÓN PERSONAL ($)",
    "GASTOS DISPONIBLE ($)",
    "TOTAL DISTRIBUIDO ($)",
  ];
  hRow.height = 22;
  styleRangeRow(hRow, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const monthly = Array.from({ length: 12 }, () => ({
    hon: 0,
    sob: 0,
    gas: 0,
    tot: 0,
  }));

  for (const batch of batchesForYear) {
    if (batch.anio !== targetYear || batch.mes < 1 || batch.mes > 12) continue;
    const slot = monthly[batch.mes - 1];
    slot.hon = round2(slot.hon + batch.totalHonorarios);
    slot.sob = round2(slot.sob + batch.totalSobreasignaciones);
    slot.gas = round2(slot.gas + batch.totalGastosDisponible);
    slot.tot = round2(slot.hon + slot.sob + slot.gas);
  }

  let nextRow = 4;
  let totHon = 0;
  let totSob = 0;
  let totGas = 0;
  let totAll = 0;

  for (let m = 0; m < 12; m++) {
    const slot = monthly[m];
    totHon = round2(totHon + slot.hon);
    totSob = round2(totSob + slot.sob);
    totGas = round2(totGas + slot.gas);
    totAll = round2(totAll + slot.tot);

    const row = ws.getRow(nextRow++);
    row.values = [`${MONTH_LONG[m]} ${targetYear}`, slot.hon, slot.sob, slot.gas, slot.tot];
    row.height = 20;
    styleRangeRow(row, 1, 5, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(1).font = { name: "Arial", size: 9, bold: true };
    for (let c = 2; c <= 5; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(5).font = { name: "Arial", size: 9, bold: true };
  }

  const totRow = ws.getRow(nextRow);
  totRow.values = ["TOTAL ANUAL", totHon, totSob, totGas, totAll];
  totRow.height = 22;
  styleRangeRow(totRow, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 2; c <= 5; c++) {
    totRow.getCell(c).numFmt = ACCOUNTING_FMT;
    totRow.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  ws.columns = [
    { width: 24 },
    { width: 24 },
    { width: 26 },
    { width: 24 },
    { width: 24 },
  ];
}

/**
 * Genera el Workbook completo Consolidado TGP (6 hojas):
 * 1. Por Expte.
 * 2. Por Cta. Cte.
 * 3. Sueldos por Efector
 * 4. Distribución por Efector
 * 5. Gasto Administrativo (Anual por Convenio)
 * 6. Resumen Anual Efectores
 */
export async function buildConsolidatedTgpWorkbook(
  batch: ConsolidationBatchData,
  allYearBatches: ConsolidationBatchData[]
): Promise<{ workbook: ExcelJS.Workbook; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP Portal Liquidaciones";
  wb.created = new Date();

  const periodTitle = `${batch.descripcion || `${MONTH_LONG[batch.mes - 1] || batch.mes} ${batch.anio}`}`;
  const isDraft = batch.id === null;
  const statusTag = isDraft ? " (BORRADOR)" : "";

  // =========================================================================
  // HOJA 1: POR EXPTE.
  // =========================================================================
  const wsExpte = setupLandscapeSheet(wb, "Por Expte.");
  wsExpte.mergeCells("A1:G1");
  const t1 = wsExpte.getCell("A1");
  t1.value = `CONSOLIDADO TGP POR EXPEDIENTE - ${periodTitle.toUpperCase()}${statusTag}`;
  t1.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  t1.fill = TITLE_FILL;
  t1.alignment = { horizontal: "center", vertical: "middle" };
  wsExpte.getRow(1).height = 26;

  const h1 = wsExpte.getRow(3);
  h1.values = [
    "SIGLAS OS",
    "LIQUIDACIÓN N°",
    "N° EXPTE",
    "N° NORMA LEGAL",
    "HON. MÉDICOS ($)",
    "SOBREASIGNACIÓN ($)",
    "SUELDOS ($)",
  ];
  h1.height = 22;
  styleRangeRow(h1, 1, 7, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const sortedLiqs = [...batch.liquidaciones].sort((a, b) =>
    a.clienteSigla.localeCompare(b.clienteSigla, "es") || a.id - b.id
  );

  let r1 = 4;
  for (const liq of sortedLiqs) {
    const row = wsExpte.getRow(r1++);
    row.values = [
      liq.clienteSigla,
      liq.displayLabel,
      liq.expediente || "Pendiente",
      liq.normaLegal || "-",
      liq.totalHonorarios,
      liq.totalSobreasignaciones,
      liq.totalSueldos,
    ];
    row.height = 20;
    styleRangeRow(row, 1, 7, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    for (let c = 5; c <= 7; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(7).font = { name: "Arial", size: 9, bold: true };
  }

  const tot1 = wsExpte.getRow(r1);
  tot1.values = [
    "TOTAL GENERAL",
    `${sortedLiqs.length} liquidación(es)`,
    "",
    "",
    batch.totalHonorarios,
    batch.totalSobreasignaciones,
    batch.totalSueldos,
  ];
  tot1.height = 22;
  styleRangeRow(tot1, 1, 7, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 5; c <= 7; c++) {
    tot1.getCell(c).numFmt = ACCOUNTING_FMT;
    tot1.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  wsExpte.columns = [
    { width: 24 },
    { width: 42 },
    { width: 20 },
    { width: 18 },
    { width: 20 },
    { width: 22 },
    { width: 20 },
  ];

  // =========================================================================
  // HOJA 2: POR CTA. CTE.
  // =========================================================================
  const wsCta = setupLandscapeSheet(wb, "Por Cta. Cte.");
  wsCta.mergeCells("A1:E1");
  const t2 = wsCta.getCell("A1");
  t2.value = `CONSOLIDADO TGP POR CUENTA CORRIENTE BANCARIA - ${periodTitle.toUpperCase()}${statusTag}`;
  t2.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  t2.fill = TITLE_FILL;
  t2.alignment = { horizontal: "center", vertical: "middle" };
  wsCta.getRow(1).height = 26;

  const h2 = wsCta.getRow(3);
  h2.values = [
    "CUENTA CORRIENTE N°",
    "CONVENIOS INCLUIDOS",
    "HON. MÉDICOS ($)",
    "SOBREASIGNACIÓN ($)",
    "SUELDOS ($)",
  ];
  h2.height = 22;
  styleRangeRow(h2, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const ctaMap = new Map<
    string,
    { convenios: Set<string>; hon: number; sob: number; sueldos: number }
  >([
    ["131441002", { convenios: new Set(["IOSCOR", "PAMI", "OBRAS SOCIALES VARIAS"]), hon: 0, sob: 0, sueldos: 0 }],
    ["131441004", { convenios: new Set(["RGA"]), hon: 0, sob: 0, sueldos: 0 }],
  ]);

  for (const liq of batch.liquidaciones) {
    const bucket = ctaMap.get(liq.ctaCteTgp) || ctaMap.get("131441002")!;
    bucket.hon = round2(bucket.hon + liq.totalHonorarios);
    bucket.sob = round2(bucket.sob + liq.totalSobreasignaciones);
    bucket.sueldos = round2(bucket.sueldos + liq.totalSueldos);
  }

  let r2 = 4;
  for (const [cta, data] of ctaMap.entries()) {
    const row = wsCta.getRow(r2++);
    row.values = [cta, Array.from(data.convenios).join(" · "), data.hon, data.sob, data.sueldos];
    row.height = 21;
    styleRangeRow(row, 1, 5, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(1).font = { name: "Arial", size: 10, bold: true };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 5; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(5).font = { name: "Arial", size: 9, bold: true };
  }

  const tot2 = wsCta.getRow(r2);
  tot2.values = [
    "TOTAL GENERAL",
    "",
    batch.totalHonorarios,
    batch.totalSobreasignaciones,
    batch.totalSueldos,
  ];
  tot2.height = 22;
  styleRangeRow(tot2, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 3; c <= 5; c++) {
    tot2.getCell(c).numFmt = ACCOUNTING_FMT;
    tot2.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  wsCta.columns = [
    { width: 22 },
    { width: 38 },
    { width: 22 },
    { width: 24 },
    { width: 22 },
  ];

  // Agrupar efectores de todo el lote (estrictamente por CUIT normalizado)
  const efectorMap = new Map<string, ConsolidationHospitalSummary>();
  for (const liq of batch.liquidaciones) {
    for (const h of liq.hospitals) {
      const key = h.cuit ? `cuit-${h.cuit}` : h.key;
      const existing = efectorMap.get(key) || {
        ...h,
        totalFacturado: 0,
        debitos: 0,
        brutoAPagar: 0,
        ga: 0,
        netoAPagar: 0,
        honorarios: 0,
        sobreasignacion: 0,
        sueldos: 0,
        gastosDisponible: 0,
      };
      existing.totalFacturado = round2(existing.totalFacturado + h.totalFacturado);
      existing.debitos = round2(existing.debitos + h.debitos);
      existing.brutoAPagar = round2(existing.brutoAPagar + h.brutoAPagar);
      existing.ga = round2(existing.ga + h.ga);
      existing.netoAPagar = round2(existing.netoAPagar + h.netoAPagar);
      existing.honorarios = round2(existing.honorarios + h.honorarios);
      existing.sobreasignacion = round2(existing.sobreasignacion + h.sobreasignacion);
      existing.sueldos = round2(existing.sueldos + h.sueldos);
      existing.gastosDisponible = round2(existing.gastosDisponible + h.gastosDisponible);
      efectorMap.set(key, existing);
    }
  }
  const sortedEfectores = Array.from(efectorMap.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );

  // =========================================================================
  // HOJA 3: SUELDOS POR EFECTOR (Honorarios | Sobreasignación | SUELDOS)
  // =========================================================================
  const wsSueldos = setupLandscapeSheet(wb, "Sueldos por Efector");
  wsSueldos.mergeCells("A1:E1");
  const t3 = wsSueldos.getCell("A1");
  t3.value = `HONORARIOS Y SOBREASIGNACIÓN (SUELDOS) POR EFECTOR - ${periodTitle.toUpperCase()}${statusTag}`;
  t3.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  t3.fill = TITLE_FILL;
  t3.alignment = { horizontal: "center", vertical: "middle" };
  wsSueldos.getRow(1).height = 26;

  const h3 = wsSueldos.getRow(3);
  h3.values = [
    "EFECTOR PÚBLICO",
    "CUIT N°",
    "HONORARIOS MÉDICOS ($)",
    "SOBREASIGNACIÓN PERSONAL ($)",
    "TOTAL SUELDOS ($)",
  ];
  h3.height = 22;
  styleRangeRow(h3, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  let r3 = 4;
  for (const ef of sortedEfectores) {
    const row = wsSueldos.getRow(r3++);
    row.values = [ef.nombre, formatCuitStr(ef.cuit), ef.honorarios, ef.sobreasignacion, ef.sueldos];
    row.height = 20;
    styleRangeRow(row, 1, 5, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 5; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(5).font = { name: "Arial", size: 9, bold: true };
  }

  const tot3 = wsSueldos.getRow(r3);
  tot3.values = [
    "TOTAL GENERAL",
    "",
    batch.totalHonorarios,
    batch.totalSobreasignaciones,
    batch.totalSueldos,
  ];
  tot3.height = 22;
  styleRangeRow(tot3, 1, 5, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 3; c <= 5; c++) {
    tot3.getCell(c).numFmt = ACCOUNTING_FMT;
    tot3.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  wsSueldos.columns = [
    { width: 44 },
    { width: 16 },
    { width: 22 },
    { width: 25 },
    { width: 22 },
  ];

  // =========================================================================
  // HOJA 4: DISTRIBUCIÓN POR EFECTOR (Hon | Sob | Gastos Disponible | Neto)
  // =========================================================================
  const wsDist = setupLandscapeSheet(wb, "Distribución por Efector");
  wsDist.mergeCells("A1:F1");
  const t4 = wsDist.getCell("A1");
  t4.value = `DISTRIBUCIÓN COMPLETA POR EFECTOR (INCL. GASTOS DISPONIBLE) - ${periodTitle.toUpperCase()}${statusTag}`;
  t4.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  t4.fill = TITLE_FILL;
  t4.alignment = { horizontal: "center", vertical: "middle" };
  wsDist.getRow(1).height = 26;

  const h4 = wsDist.getRow(3);
  h4.values = [
    "EFECTOR PÚBLICO",
    "CUIT N°",
    "HONORARIOS MÉDICOS ($)",
    "SOBREASIGNACIÓN PERSONAL ($)",
    "GASTOS DISPONIBLE ($)",
    "NETO A DISTRIBUIR ($)",
  ];
  h4.height = 22;
  styleRangeRow(h4, 1, 6, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  let r4 = 4;
  for (const ef of sortedEfectores) {
    const row = wsDist.getRow(r4++);
    row.values = [
      ef.nombre,
      formatCuitStr(ef.cuit),
      ef.honorarios,
      ef.sobreasignacion,
      ef.gastosDisponible,
      ef.netoAPagar,
    ];
    row.height = 20;
    styleRangeRow(row, 1, 6, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 6; c++) {
      row.getCell(c).numFmt = ACCOUNTING_FMT;
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(6).font = { name: "Arial", size: 9, bold: true };
  }

  const tot4 = wsDist.getRow(r4);
  tot4.values = [
    "TOTAL GENERAL",
    "",
    batch.totalHonorarios,
    batch.totalSobreasignaciones,
    batch.totalGastosDisponible,
    batch.totalNeto,
  ];
  tot4.height = 22;
  styleRangeRow(tot4, 1, 6, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  for (let c = 3; c <= 6; c++) {
    tot4.getCell(c).numFmt = ACCOUNTING_FMT;
    tot4.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
  }

  wsDist.columns = [
    { width: 42 },
    { width: 16 },
    { width: 22 },
    { width: 24 },
    { width: 22 },
    { width: 22 },
  ];

  // =========================================================================
  // HOJAS 5 y 6: ACUMULADO ANUAL (Gasto Administrativo + Resumen Anual Efectores)
  // Incluir el lote actual si es borrador para que el acumulado refleje la vista previa
  // =========================================================================
  const annualBatchesMerged = isDraft
    ? [...allYearBatches, batch]
    : allYearBatches.some((b) => b.id === batch.id)
    ? allYearBatches
    : [...allYearBatches, batch];

  addGastoAdminAnnualSheet(wb, annualBatchesMerged, batch.anio);
  addResumenAnualEfectoresSheet(wb, annualBatchesMerged, batch.anio);

  const fileName = `Consolidado_TGP_${sanitizeFileSlug(periodTitle)}${isDraft ? "_BORRADOR" : ""}.xlsx`;
  return { workbook: wb, fileName };
}

export async function downloadConsolidatedTgpWorkbook(
  batch: ConsolidationBatchData,
  allYearBatches: ConsolidationBatchData[]
) {
  const { workbook, fileName } = await buildConsolidatedTgpWorkbook(batch, allYearBatches);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerExcelBrowserDownload(buffer, fileName);
}

/**
 * Genera la Planilla Unificada SISPER del lote consolidado (todos los agentes de todos los hospitales).
 */
export async function buildConsolidatedSisperWorkbook(
  batch: ConsolidationBatchData
): Promise<{ workbook: ExcelJS.Workbook; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP Portal Liquidaciones";
  wb.created = new Date();

  const periodTitle = batch.descripcion || `${MONTH_LONG[batch.mes - 1] || batch.mes} ${batch.anio}`;
  const isDraft = batch.id === null;

  const ws = setupLandscapeSheet(wb, "Planilla SISPER");
  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = `PLANILLA CONSOLIDADA SISPER - ${periodTitle.toUpperCase()}${isDraft ? " (BORRADOR)" : ""}`;
  title.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = TITLE_FILL;
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  const hRow = ws.getRow(3);
  hRow.values = [
    "DNI",
    "CUIL",
    "APELLIDO Y NOMBRE",
    "ESTABLECIMIENTO SANITARIO",
    "CONCEPTO",
    "OBRA SOCIAL",
    "LIQUIDACIÓN N°",
    "N° EXPTE",
    "IMPORTE ($)",
  ];
  hRow.height = 22;
  styleRangeRow(hRow, 1, 9, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const allAgents = batch.liquidaciones
    .flatMap((l) => l.agentRows)
    .sort(
      (a, b) =>
        a.establecimiento.localeCompare(b.establecimiento, "es") ||
        a.nombre.localeCompare(b.nombre, "es")
    );

  let nextRow = 4;
  let totalImp = 0;

  for (const ag of allAgents) {
    totalImp = round2(totalImp + ag.importe);
    const row = ws.getRow(nextRow++);
    row.values = [
      ag.dni,
      ag.cuil,
      ag.nombre,
      ag.establecimiento,
      ag.concepto,
      ag.obraSocialSigla,
      ag.liquidationLabel,
      ag.expediente,
      ag.importe,
    ];
    row.height = 19;
    styleRangeRow(row, 1, 9, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(9).numFmt = ACCOUNTING_FMT;
    row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
  }

  const totRow = ws.getRow(nextRow);
  totRow.values = [
    "TOTAL GENERAL",
    `${allAgents.length} reg.`,
    "",
    "",
    "",
    "",
    "",
    "",
    totalImp,
  ];
  totRow.height = 22;
  styleRangeRow(totRow, 1, 9, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  totRow.getCell(9).numFmt = ACCOUNTING_FMT;
  totRow.getCell(9).alignment = { horizontal: "right", vertical: "middle" };

  ws.columns = [
    { width: 12 },
    { width: 16 },
    { width: 32 },
    { width: 36 },
    { width: 24 },
    { width: 22 },
    { width: 34 },
    { width: 18 },
    { width: 18 },
  ];

  const fileName = `Consolidado_SISPER_${sanitizeFileSlug(periodTitle)}${isDraft ? "_BORRADOR" : ""}.xlsx`;
  return { workbook: wb, fileName };
}

export async function downloadConsolidatedSisperWorkbook(batch: ConsolidationBatchData) {
  const { workbook, fileName } = await buildConsolidatedSisperWorkbook(batch);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerExcelBrowserDownload(buffer, fileName);
}

/**
 * Genera el Reporte de Tesorería (Gastos Disponible a Transferir por Hospital × Obra Social × Cta. Cte.).
 */
export async function buildConsolidatedTesoreriaWorkbook(
  batch: ConsolidationBatchData
): Promise<{ workbook: ExcelJS.Workbook; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP Portal Liquidaciones";
  wb.created = new Date();

  const periodTitle = batch.descripcion || `${MONTH_LONG[batch.mes - 1] || batch.mes} ${batch.anio}`;
  const isDraft = batch.id === null;

  const ws = setupLandscapeSheet(wb, "Reporte Tesorería");
  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = `REPORTE DE TESORERÍA · GASTOS DISPONIBLE A TRANSFERIR - ${periodTitle.toUpperCase()}${isDraft ? " (BORRADOR)" : ""}`;
  title.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = TITLE_FILL;
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  const hRow = ws.getRow(3);
  hRow.values = [
    "ESTABLECIMIENTO SANITARIO",
    "CUIT N°",
    "OBRA SOCIAL",
    "CONVENIO",
    "CTA. CTE. TGP",
    "LIQUIDACIÓN N°",
    "N° EXPTE",
    "GASTOS A TRANSFERIR ($)",
  ];
  hRow.height = 22;
  styleRangeRow(hRow, 1, 8, {
    font: { name: "Arial", size: 9, bold: true },
    fill: SUBHEADER_FILL,
    border: THIN_BORDER,
    alignment: { horizontal: "center", vertical: "middle" },
  });

  const rowsData: Array<{
    hospital: string;
    cuit: string;
    os: string;
    convenio: string;
    cta: string;
    liq: string;
    expte: string;
    gastos: number;
  }> = [];

  for (const liq of batch.liquidaciones) {
    for (const h of liq.hospitals) {
      if (h.gastosDisponible > 0) {
        rowsData.push({
          hospital: h.nombre,
          cuit: formatCuitStr(h.cuit),
          os: liq.clienteSigla,
          convenio: liq.convenio,
          cta: liq.ctaCteTgp,
          liq: liq.displayLabel,
          expte: liq.expediente || "-",
          gastos: h.gastosDisponible,
        });
      }
    }
  }

  rowsData.sort(
    (a, b) => a.hospital.localeCompare(b.hospital, "es") || a.os.localeCompare(b.os, "es")
  );

  let nextRow = 4;
  let totalGastos = 0;

  for (const r of rowsData) {
    totalGastos = round2(totalGastos + r.gastos);
    const row = ws.getRow(nextRow++);
    row.values = [r.hospital, r.cuit, r.os, r.convenio, r.cta, r.liq, r.expte, r.gastos];
    row.height = 19;
    styleRangeRow(row, 1, 8, {
      font: { name: "Arial", size: 9 },
      border: THIN_BORDER,
      alignment: { vertical: "middle" },
    });
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(8).numFmt = ACCOUNTING_FMT;
    row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
  }

  const totRow = ws.getRow(nextRow);
  totRow.values = ["TOTAL GENERAL", "", "", "", "", "", "", totalGastos];
  totRow.height = 22;
  styleRangeRow(totRow, 1, 8, {
    font: { name: "Arial", size: 9, bold: true },
    fill: TOTAL_FILL,
    border: TOTAL_BORDER,
    alignment: { vertical: "middle" },
  });
  totRow.getCell(8).numFmt = ACCOUNTING_FMT;
  totRow.getCell(8).alignment = { horizontal: "right", vertical: "middle" };

  ws.columns = [
    { width: 38 },
    { width: 16 },
    { width: 22 },
    { width: 22 },
    { width: 15 },
    { width: 34 },
    { width: 18 },
    { width: 22 },
  ];

  const fileName = `Reporte_Tesoreria_${sanitizeFileSlug(periodTitle)}${isDraft ? "_BORRADOR" : ""}.xlsx`;
  return { workbook: wb, fileName };
}

export async function downloadConsolidatedTesoreriaWorkbook(batch: ConsolidationBatchData) {
  const { workbook, fileName } = await buildConsolidatedTesoreriaWorkbook(batch);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerExcelBrowserDownload(buffer, fileName);
}

/**
 * Genera el Reporte Anual TGP (Gasto Administrativo por Convenio + Resumen Anual Efectores).
 */
export async function downloadAnnualTgpWorkbook(
  batchesForYear: ConsolidationBatchData[],
  targetYear: number
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP Portal Liquidaciones";
  wb.created = new Date();

  addGastoAdminAnnualSheet(wb, batchesForYear, targetYear);
  addResumenAnualEfectoresSheet(wb, batchesForYear, targetYear);

  const buffer = await wb.xlsx.writeBuffer();
  triggerExcelBrowserDownload(buffer, `Consolidado_Anual_TGP_${targetYear}.xlsx`);
}
