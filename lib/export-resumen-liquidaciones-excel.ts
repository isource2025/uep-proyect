import ExcelJS from "exceljs";

export interface ResumenLiquidacionRow {
  anio: number;
  obraSocial: string;
  periodo: string;
  cuit: string;
  codigoInterno: string;
  prestador: string;
  localidad: string;
  fcHospital: string;
  fcUep: string;
  reciboUep: string;
  mesCarga: string;
  totalFacturado: number;
  creditos: number;
  debitos: number;
  ajustesOs: number;
  pendientesCobro: number;
  pagosParcialesAnteriores: number;
  brutoAPagar: number;
  ga: number;
  adelantos: number;
  netoADistribuir: number;
  nroLiq: string;
}

export interface ResumenLiquidacionesPayload {
  rows: ResumenLiquidacionRow[];
  liquidationsCount: number;
  availableYears: number[];
  selectedYear: number | null;
  selectedMonth: number | null;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MONEY_FMT = '$ #,##0.00;-$ #,##0.00;"-"';

const COLUMNS: Array<{
  header: string;
  width: number;
  mandatory: boolean;
  align: "left" | "center" | "right";
  money?: boolean;
}> = [
  { header: "AÑO", width: 7, mandatory: false, align: "center" },
  { header: "OBRA SOCIAL", width: 22, mandatory: true, align: "left" },
  { header: "PERIODO", width: 11, mandatory: true, align: "center" },
  { header: "CUIT N°", width: 15, mandatory: false, align: "center" },
  { header: "C°*", width: 13, mandatory: true, align: "center" },
  { header: "PRESTADOR", width: 34, mandatory: true, align: "left" },
  { header: "LOCALIDAD", width: 18, mandatory: false, align: "left" },
  { header: "N° FC HOSPITAL", width: 18, mandatory: true, align: "center" },
  { header: "N° FACTURA UEP", width: 18, mandatory: false, align: "center" },
  { header: "N° RECIBO UEP", width: 16, mandatory: false, align: "center" },
  { header: "MES CARGA", width: 11, mandatory: false, align: "center" },
  { header: "TOTAL FACTURADO", width: 16, mandatory: true, align: "right", money: true },
  { header: "CRÉDITOS", width: 13, mandatory: true, align: "right", money: true },
  { header: "DÉBITOS", width: 13, mandatory: true, align: "right", money: true },
  { header: "AJUSTES O.S.", width: 13, mandatory: true, align: "right", money: true },
  { header: "PEND. COBRO", width: 14, mandatory: true, align: "right", money: true },
  { header: "PAGOS PARC. ANT.", width: 15, mandatory: true, align: "right", money: true },
  { header: "BRUTO A PAGAR", width: 16, mandatory: true, align: "right", money: true },
  { header: "GA (GASTO ADMIN.)", width: 15, mandatory: true, align: "right", money: true },
  { header: "ADELANTOS", width: 13, mandatory: true, align: "right", money: true },
  { header: "NETO A DISTRIBUIR", width: 17, mandatory: true, align: "right", money: true },
  { header: "N° LIQ", width: 12, mandatory: true, align: "center" },
];

function buildScopeLabel(year: number | null, month: number | null): string {
  if (year && month && month >= 1 && month <= 12) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }
  if (year) {
    return `Año ${year}`;
  }
  return "Histórico Completo";
}

function buildFileName(year: number | null, month: number | null): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  if (year && month && month >= 1 && month <= 12) {
    return `Resumen_Liquidaciones_UEP_${year}_${String(month).padStart(2, "0")}_${ymd}.xlsx`;
  }
  if (year) {
    return `Resumen_Liquidaciones_UEP_${year}_${ymd}.xlsx`;
  }
  return `Resumen_Liquidaciones_UEP_Historico_${ymd}.xlsx`;
}

export async function buildResumenLiquidacionesWorkbook(
  payload: ResumenLiquidacionesPayload
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal UEP - MSP Corrientes";
  wb.created = new Date();

  const ws = wb.addWorksheet("Resumen Liquidaciones", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0.15, footer: 0.15 },
    },
  });

  const scopeLabel = buildScopeLabel(payload.selectedYear, payload.selectedMonth);

  // Row 1: Institutional Title
  ws.mergeCells("A1:V1");
  const titleRow = ws.getRow(1);
  titleRow.height = 28;
  const titleCell = ws.getCell("A1");
  titleCell.value = `RESUMEN GENERAL DE LIQUIDACIONES NOTIFICADAS - UEP MSP (${scopeLabel.toUpperCase()})`;
  titleCell.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Row 2: Subtitle
  const todayStr = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  ws.mergeCells("A2:V2");
  const subRow = ws.getRow(2);
  subRow.height = 18;
  const subCell = ws.getCell("A2");
  subCell.value = `Generado automáticamente desde Portal UEP · ${todayStr} · Liquidaciones notificadas (única carga al notificar): ${payload.liquidationsCount}`;
  subCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF475569" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  // Row 3: Blank spacer
  ws.getRow(3).height = 8;

  COLUMNS.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  // Row 4: Headers
  const headerRow = ws.getRow(4);
  headerRow.height = 26;
  COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Arial", size: 8, bold: true, color: { argb: "FF0F172A" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: col.mandatory ? "FFD9E8FB" : "FFE2E8F0" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: "FF94A3B8" } },
      bottom: { style: "medium", color: { argb: "FF94A3B8" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  ws.autoFilter = "A4:V4";

  let rowIdx = 5;
  payload.rows.forEach((item, i) => {
    const values: Array<string | number> = [
      item.anio,
      item.obraSocial,
      item.periodo,
      item.cuit,
      item.codigoInterno,
      item.prestador,
      item.localidad,
      item.fcHospital,
      item.fcUep,
      item.reciboUep,
      item.mesCarga,
      item.totalFacturado,
      item.creditos,
      item.debitos,
      item.ajustesOs,
      item.pendientesCobro,
      item.pagosParcialesAnteriores,
      item.brutoAPagar,
      item.ga,
      item.adelantos,
      item.netoADistribuir,
      item.nroLiq,
    ];

    const row = ws.getRow(rowIdx);
    row.height = 19;
    const isZebra = i % 2 === 1;

    values.forEach((val, idx) => {
      const col = COLUMNS[idx];
      const cell = row.getCell(idx + 1);
      cell.value = val;
      cell.font = {
        name: "Arial",
        size: 8,
        bold: idx === 4 || idx === 20 || idx === 21,
        color: { argb: idx === 20 ? "FF047857" : "FF0F172A" },
      };
      if (idx === 20) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
      } else if (isZebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      cell.alignment = {
        horizontal: col.align,
        vertical: "middle",
        wrapText: idx === 4 || idx === 5,
      };
      if (col.money) {
        cell.numFmt = MONEY_FMT;
      }
      cell.border = thinBorder;
    });

    rowIdx++;
  });

  // Totals row
  const lastDataRow = rowIdx - 1;
  const totalRow = ws.getRow(rowIdx);
  totalRow.height = 22;
  totalRow.getCell(1).value = "TOTAL GENERAL";
  totalRow.getCell(2).value = `${payload.rows.length} renglón(es)`;

  for (let c = 1; c <= 22; c++) {
    const cell = totalRow.getCell(c);
    if (c >= 12 && c <= 21) {
      if (payload.rows.length > 0) {
        const colLetter = ws.getColumn(c).letter;
        cell.value = { formula: `SUM(${colLetter}5:${colLetter}${lastDataRow})` };
      } else {
        cell.value = 0;
      }
      cell.numFmt = MONEY_FMT;
    }
    cell.font = {
      name: "Arial",
      size: 9,
      bold: true,
      color: { argb: c === 21 ? "FF047857" : "FF0F172A" },
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F4EC" } };
    cell.alignment = {
      horizontal: c >= 12 && c <= 21 ? "right" : c === 1 || c === 2 ? "left" : "center",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF10B981" } },
      bottom: { style: "medium", color: { argb: "FF10B981" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  }

  return wb;
}

export async function downloadResumenLiquidacionesWorkbook(
  payload: ResumenLiquidacionesPayload
): Promise<string> {
  const wb = await buildResumenLiquidacionesWorkbook(payload);
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = buildFileName(payload.selectedYear, payload.selectedMonth);
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
  return fileName;
}
