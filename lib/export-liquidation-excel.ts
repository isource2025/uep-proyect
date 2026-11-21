import ExcelJS from "exceljs";
import { getLiquidationStatusConfig } from "@/lib/constants";
import { getLiquidationExcelReportData } from "@/app/dashboard/liquidations/actions";
import { formatCuit } from "@/lib/hospital-mapping";

function formatMoney(val: any): number {
  const num = Number(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function getMonthName(mes: number): string {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return meses[mes - 1] || `Mes ${mes}`;
}

export function formatNormaLegalText(normaLegal?: string | null, status?: string): string {
  if (normaLegal && normaLegal.trim()) {
    const trimmed = normaLegal.trim();
    if (/^disp\s*n[°º]?\s*/i.test(trimmed)) {
      return trimmed.replace(/^disp\s*n[°º]?\s*/i, "Disp N° ");
    }
    return `Disp N° ${trimmed}`;
  }
  // Si está pendiente o no tiene número asignado
  return "Sin asignar";
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

const headerFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" }, // Slate 100
};

const sectionFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2E8F0" }, // Slate 200
};

const titleFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A8A" }, // Blue 900
};

const accountingNumFmt = '"$" #,##0.00;[Red]("$" #,##0.00);"$ 0.00"';

/**
 * Aplica estilos y bordes a una fila completa en un rango de columnas
 */
function styleRow(
  row: ExcelJS.Row,
  startCol: number,
  endCol: number,
  options: {
    font?: Partial<ExcelJS.Font>;
    fill?: ExcelJS.Fill;
    border?: Partial<ExcelJS.Borders>;
    alignment?: Partial<ExcelJS.Alignment>;
    numFmt?: string;
  }
) {
  for (let c = startCol; c <= endCol; c++) {
    const cell = row.getCell(c);
    if (options.font) cell.font = { ...cell.font, ...options.font };
    if (options.fill) cell.fill = options.fill;
    if (options.border) cell.border = options.border;
    if (options.alignment) cell.alignment = { ...cell.alignment, ...options.alignment };
    if (options.numFmt) cell.numFmt = options.numFmt;
  }
}

/**
 * Construye el objeto ExcelJS.Workbook completo para una liquidación
 * Cumpliendo con:
 * - Orientación horizontal (Landscape)
 * - Ajuste a 1 página de ancho (fitToWidth: 1)
 * - Cuadrícula visible en impresión
 * - Formato contable $ #,##0.00 con puntos y comas
 * - Nombres completos y campo N° NORMA LEGAL
 */
export function buildLiquidationWorkbook(
  liq: any,
  mspAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> = {},
  customNormaLegal?: string,
  reportMode: "PENDIENTE" | "DISTRIBUIDA" | "AUTO" = "AUTO"
): { workbook: ExcelJS.Workbook; fileName: string } {
  const hospitalScopeName = typeof liq.hospitalScopeName === "string" && liq.hospitalScopeName.trim()
    ? liq.hospitalScopeName.trim()
    : "";
  const isHospitalScoped = Boolean(hospitalScopeName || liq.hospitalScopeCuit);
  const showOperatorInReport = !isHospitalScoped;
  const operador = (liq.createdByName && String(liq.createdByName).trim()) || "Sin asignar";

  const wb = new ExcelJS.Workbook();
  wb.creator = "UEP - Unidad Ejecutora Provincial";
  wb.lastModifiedBy =
    showOperatorInReport && liq.createdByName && String(liq.createdByName).trim()
      ? String(liq.createdByName).trim()
      : "UEP - Unidad Ejecutora Provincial";
  wb.created = new Date();
  wb.modified = new Date();

  const isExplicitPending = reportMode === "PENDIENTE";
  const isExplicitDistributed = reportMode === "DISTRIBUIDA";
  const effectiveStatus = isExplicitPending
    ? "PENDIENTE"
    : isExplicitDistributed
    ? "DISTRIBUIDA"
    : liq.status;

  const clientName = liq.rc?.cliente?.nombre || "Obra Social";
  const clientCuit = liq.rc?.cliente?.cuit ? formatCuit(liq.rc.cliente.cuit) : "-";
  const liqCode = `LIQ-${String(liq.id).padStart(4, "0")}`;
  const statusLabel = getLiquidationStatusConfig(effectiveStatus).label;
  const rcNumber = liq.rc ? `${String(liq.rc.puntoVenta).padStart(4, "0")}-${String(liq.rc.numero).padStart(8, "0")}` : "-";
  const fcVentasList: string[] = Array.from(
    new Set(
      (liq.rc?.appliedAsRc || [])
        .map((app: any) => {
          const fc = app?.fc;
          if (!fc) return null;
          const pto = String(fc.puntoVenta ?? "0").padStart(4, "0");
          const nro = String(fc.numero ?? fc.id ?? "0").padStart(8, "0");
          return `FC-${pto}-${nro}`;
        })
        .filter((v: string | null): v is string => Boolean(v))
    )
  );
  const fcVentasText = fcVentasList.length > 0 ? fcVentasList.join(", ") : "Sin asignar";
  const mesCarga = liq.mesCarga || (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "-");
  const fechaGeneracion = new Date().toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const normaLegalFinal = isExplicitPending
    ? null
    : (customNormaLegal !== undefined ? customNormaLegal : liq.normaLegal);
  const normaLegalText = formatNormaLegalText(normaLegalFinal, effectiveStatus);

  const details = liq.details || [];
  const personalDistributions = isExplicitPending ? [] : (liq.personalDistributions || []);
  const distributions = isExplicitPending ? [] : (liq.distributions || []);

  // =========================================================================
  // 1. HOJA 1: LIQUIDACIÓN DE COBRANZA
  // =========================================================================
  const ws1 = wb.addWorksheet("Liquidación de Cobranza", {
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

  // Título principal
  ws1.mergeCells("A1:M1");
  const title1 = ws1.getCell("A1");
  title1.value = isHospitalScoped
    ? `LIQUIDACIÓN DE COBRANZA - ${hospitalScopeName || "ESTABLECIMIENTO SANITARIO"}`
    : "LIQUIDACIÓN DE COBRANZA - UEP MSP";
  title1.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  title1.fill = titleFill;
  title1.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(1).height = 28;

  // Sección Datos Generales
  ws1.mergeCells("A3:M3");
  const sec1 = ws1.getCell("A3");
  sec1.value = "DATOS GENERALES DE LA LIQUIDACIÓN";
  sec1.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1E293B" } };
  sec1.fill = sectionFill;
  sec1.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws1.getRow(3).height = 20;

  // Fila Obra Social (un renglón completo visible sin recortes)
  ws1.getCell("A4").value = "Obra Social:";
  ws1.getCell("A4").font = { name: "Arial", size: 10, bold: true };
  ws1.mergeCells("B4:M4");
  const clientCell = ws1.getCell("B4");
  clientCell.value = clientName;
  clientCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF0F172A" } };
  clientCell.alignment = { horizontal: "left", vertical: "middle" };
  ws1.getRow(4).height = 22;

  // Fila CUIT, Período, Recibo (combinando celdas hacia la derecha para evitar cortes sin ensanchar la tabla)
  ws1.getCell("A5").value = "CUIT O.S.:";
  ws1.getCell("A5").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("B5:C5");
  ws1.getCell("B5").value = clientCuit;
  ws1.mergeCells("D5:E5");
  ws1.getCell("D5").value = "Mes Carga / Período:";
  ws1.getCell("D5").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("F5:H5");
  ws1.getCell("F5").value = mesCarga;
  ws1.mergeCells("I5:J5");
  ws1.getCell("I5").value = "Recibo UEP N°:";
  ws1.getCell("I5").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("K5:M5");
  ws1.getCell("K5").value = rcNumber;

  // Fila Liquidación, Expediente, Norma Legal
  ws1.getCell("A6").value = "Liquidación N°:";
  ws1.getCell("A6").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("B6:C6");
  ws1.getCell("B6").value = liqCode;
  ws1.mergeCells("D6:E6");
  ws1.getCell("D6").value = "N° Expediente:";
  ws1.getCell("D6").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("F6:H6");
  ws1.getCell("F6").value = liq.expediente || "Sin asignar";
  ws1.mergeCells("I6:J6");
  ws1.getCell("I6").value = "N° NORMA LEGAL:";
  ws1.getCell("I6").font = { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } };
  ws1.mergeCells("K6:M6");
  ws1.getCell("K6").value = normaLegalText;
  ws1.getCell("K6").font = { name: "Arial", size: 9, bold: true, color: normaLegalText === "Sin asignar" ? { argb: "FF64748B" } : { argb: "FF047857" } };

  // Fila Estado, Operador (solo reportes Sede UEP) y Fecha Emisión
  ws1.getCell("A7").value = "Estado:";
  ws1.getCell("A7").font = { name: "Arial", size: 9, bold: true };
  ws1.mergeCells("B7:C7");
  ws1.getCell("B7").value = statusLabel;
  if (showOperatorInReport) {
    ws1.mergeCells("D7:E7");
    ws1.getCell("D7").value = "Operador / Liquidador:";
    ws1.getCell("D7").font = { name: "Arial", size: 9, bold: true };
    ws1.mergeCells("F7:H7");
    ws1.getCell("F7").value = operador;
    ws1.mergeCells("I7:J7");
    ws1.getCell("I7").value = "Fecha Emisión:";
    ws1.getCell("I7").font = { name: "Arial", size: 9, bold: true };
    ws1.mergeCells("K7:M7");
    ws1.getCell("K7").value = fechaGeneracion;
  } else {
    ws1.mergeCells("D7:E7");
    ws1.getCell("D7").value = "Fecha Emisión:";
    ws1.getCell("D7").font = { name: "Arial", size: 9, bold: true };
    ws1.mergeCells("F7:H7");
    ws1.getCell("F7").value = fechaGeneracion;
  }

  // Fila Facturas de Venta (FC Ventas) asociadas al Recibo
  ws1.getCell("A8").value = "Facturas de Venta (FC):";
  ws1.getCell("A8").font = { name: "Arial", size: 9, bold: true };
  ws1.getCell("A8").alignment = { horizontal: "left", vertical: "middle" };
  ws1.mergeCells("B8:M8");
  const fcCell1 = ws1.getCell("B8");
  fcCell1.value = fcVentasText;
  fcCell1.font = {
    name: "Arial",
    size: 9,
    bold: fcVentasList.length > 0,
    color: fcVentasList.length > 0 ? { argb: "FF1D4ED8" } : { argb: "FF64748B" },
  };
  fcCell1.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws1.getRow(8).height = Math.max(20, Math.ceil(fcVentasText.length / 110) * 16);

  // Las observaciones internas son de uso exclusivo dentro del sistema y nunca se incluyen en reportes
  let nextRowIdx = 10;

  // Sección Totales
  ws1.mergeCells(`A${nextRowIdx}:M${nextRowIdx}`);
  const secTot = ws1.getCell(`A${nextRowIdx}`);
  secTot.value = isHospitalScoped
    ? "RESUMEN DE TOTALES DEL ESTABLECIMIENTO ($)"
    : "RESUMEN DE TOTALES CONSOLIDADOS ($)";
  secTot.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1E293B" } };
  secTot.fill = sectionFill;
  secTot.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws1.getRow(nextRowIdx).height = 20;
  nextRowIdx++;

  const totMetrics = [
    ["Total Facturado:", formatMoney(liq.totalFacturado), "Bruto a Pagar:", formatMoney(liq.brutoAPagar)],
    ["Total Créditos:", formatMoney(liq.creditos), "Gastos Administrativos (GA):", formatMoney(liq.ga)],
    ["Total Débitos:", formatMoney(liq.debitos), "Adelantos:", formatMoney(liq.ajusteRecupero)],
    ["Ajustes O.S.:", formatMoney(liq.ajustesOs), "NETO FINAL A DISTRIBUIR:", formatMoney(liq.netoAPagar)],
    ["Pendientes de Cobro:", formatMoney(liq.pendientesCobro), "Total Honorarios:", formatMoney(liq.totalHonorarios)],
    ["Pagos Parciales Anteriores:", formatMoney(liq.pagosParcialesAnteriores), "Total Sobreasignación:", formatMoney(liq.totalSobreasignaciones)],
    ["", 0, "Total Gastos Transferibles:", formatMoney(liq.totalGastos)],
    ["", 0, "TOTAL DISTRIBUIDO:", formatMoney(liq.totalDistribuido)],
  ];

  for (const m of totMetrics) {
    const r = ws1.getRow(nextRowIdx);
    if (m[0]) {
      r.getCell(1).value = m[0];
      r.getCell(1).font = { name: "Arial", size: 9 };
      ws1.mergeCells(`B${nextRowIdx}:C${nextRowIdx}`);
      r.getCell(2).value = m[1];
      r.getCell(2).numFmt = accountingNumFmt;
      r.getCell(2).font = { name: "Arial", size: 9, bold: true };
      r.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    }
    if (m[2]) {
      ws1.mergeCells(`D${nextRowIdx}:E${nextRowIdx}`);
      r.getCell(4).value = m[2];
      r.getCell(4).font = { name: "Arial", size: 9, bold: m[2] === "NETO FINAL A DISTRIBUIR:" || m[2] === "TOTAL DISTRIBUIDO:" };
      ws1.mergeCells(`F${nextRowIdx}:G${nextRowIdx}`);
      r.getCell(6).value = m[3];
      r.getCell(6).numFmt = accountingNumFmt;
      r.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      r.getCell(6).font = {
        name: "Arial",
        size: 9,
        bold: true,
        color: m[2] === "NETO FINAL A DISTRIBUIR:" ? { argb: "FF047857" } : undefined,
      };
      if (m[2] === "NETO FINAL A DISTRIBUIR:") {
        r.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      }
    }
    nextRowIdx++;
  }
  nextRowIdx++;

  // Sección Detalle de Facturas
  ws1.mergeCells(`A${nextRowIdx}:M${nextRowIdx}`);
  const secDet = ws1.getCell(`A${nextRowIdx}`);
  secDet.value = isHospitalScoped
    ? "DETALLE DE COMPROBANTES DEL ESTABLECIMIENTO"
    : "DETALLE DE COMPROBANTES Y FACTURAS DE HOSPITALES";
  secDet.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1E293B" } };
  secDet.fill = sectionFill;
  secDet.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws1.getRow(nextRowIdx).height = 20;
  nextRowIdx++;

  // Encabezados de la tabla
  const headers1 = [
    "Hospital / Establecimiento",
    "CUIT",
    "Factura N°",
    "Total Facturado ($)",
    "Créditos ($)",
    "Débitos ($)",
    "Ajustes O.S. ($)",
    "Pendiente Cobro ($)",
    "Pagos Parciales ($)",
    "Bruto a Pagar ($)",
    "G.A. ($)",
    "Adelantos ($)",
    "Neto a Distribuir ($)",
  ];

  const headerRow1 = ws1.getRow(nextRowIdx);
  headerRow1.values = headers1;
  headerRow1.height = 24;
  styleRow(headerRow1, 1, 13, {
    font: { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } },
    fill: headerFill,
    border: thinBorder,
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
  });
  headerRow1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  nextRowIdx++;

  // Datos de la tabla
  for (const d of details) {
    const hospName = d.prestadorNombre || d.hospital?.nombre || `Hospital #${d.hospitalId || "?"}`;
    const cuitFormatted = formatCuit(d.cuit || d.hospital?.cuit || "") || "-";
    const fcNum = d.fcHospital || (d.compra ? `FC-${d.compra.grupoCbte || "0000"}-${d.compra.numero || ""}` : "-");

    const r = ws1.getRow(nextRowIdx);
    r.values = [
      hospName,
      cuitFormatted,
      fcNum,
      formatMoney(d.totalFacturado),
      formatMoney(d.creditos),
      formatMoney(d.debitos),
      formatMoney(d.ajustesOs),
      formatMoney(d.pendientesCobro),
      formatMoney(d.pagosParcialesAnteriores),
      formatMoney(d.brutoAPagar),
      formatMoney(d.ga),
      formatMoney(d.ajusteRecupero),
      formatMoney(d.netoAPagar),
    ];
    r.height = 20;

    styleRow(r, 1, 13, {
      font: { name: "Arial", size: 9 },
      border: thinBorder,
      alignment: { vertical: "middle" },
    });

    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };

    for (let c = 4; c <= 13; c++) {
      r.getCell(c).numFmt = accountingNumFmt;
      r.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
    }

    // Resaltado sutil si el bruto es negativo (excedido)
    const rowBruto = formatMoney(d.brutoAPagar);
    if (rowBruto < 0) {
      styleRow(r, 1, 13, {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF2F2" } },
      });
      r.getCell(10).font = { name: "Arial", size: 9, bold: true, color: { argb: "FFDC2626" } };
    }

    nextRowIdx++;
  }

  // Fila de Totales Generales
  const totRow1 = ws1.getRow(nextRowIdx);
  totRow1.values = [
    "TOTALES GENERALES",
    "",
    "",
    formatMoney(liq.totalFacturado),
    formatMoney(liq.creditos),
    formatMoney(liq.debitos),
    formatMoney(liq.ajustesOs),
    formatMoney(liq.pendientesCobro),
    formatMoney(liq.pagosParcialesAnteriores),
    formatMoney(liq.brutoAPagar),
    formatMoney(liq.ga),
    formatMoney(liq.ajusteRecupero),
    formatMoney(liq.netoAPagar),
  ];
  totRow1.height = 24;

  const doubleBottomBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF0F172A" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "double", color: { argb: "FF0F172A" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };

  styleRow(totRow1, 1, 13, {
    font: { name: "Arial", size: 9, bold: true },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } },
    border: doubleBottomBorder,
    alignment: { vertical: "middle" },
  });

  totRow1.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  for (let c = 4; c <= 13; c++) {
    totRow1.getCell(c).numFmt = accountingNumFmt;
    totRow1.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
  }
  totRow1.getCell(13).font = { name: "Arial", size: 9, bold: true, color: { argb: "FF047857" } };

  // Anchos de columna Hoja 1 (encabezados en 1 sola línea sin cortar ($), ajustado a 1 hoja A4 horizontal)
  ws1.columns = [
    { key: "hosp", width: 38 }, // Hospital
    { key: "cuit", width: 15 }, // CUIT
    { key: "fc", width: 19 }, // Factura
    { key: "fact", width: 21 }, // Total Facturado ($)
    { key: "cred", width: 15 }, // Créditos ($)
    { key: "deb", width: 15 }, // Débitos ($)
    { key: "ajos", width: 18 }, // Ajustes O.S. ($)
    { key: "pend", width: 21 }, // Pendiente Cobro ($)
    { key: "pagp", width: 21 }, // Pagos Parciales ($)
    { key: "bruto", width: 19 }, // Bruto a Pagar ($)
    { key: "ga", width: 14 }, // G.A. ($)
    { key: "recup", width: 16 }, // Adelantos ($)
    { key: "neto", width: 23 }, // Neto a Distribuir ($)
  ];

  // =========================================================================
  // 2. HOJA 2: RESUMEN DISTRIBUCIÓN DE COBRANZA
  // =========================================================================
  const ws2 = wb.addWorksheet("Resumen Distribución Cobranza", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
      showGridLines: true,
    },
    views: [{ showGridLines: true }],
  });

  // Título principal
  ws2.mergeCells("A1:H1");
  const title2 = ws2.getCell("A1");
  title2.value = isHospitalScoped
    ? `RESUMEN DE DISTRIBUCIÓN - ${hospitalScopeName || "ESTABLECIMIENTO SANITARIO"}`
    : "RESUMEN DISTRIBUCIÓN DE COBRANZA - UEP MSP";
  title2.font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  title2.fill = titleFill;
  title2.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(1).height = 28;

  // Datos Generales
  ws2.mergeCells("A3:H3");
  const sec2 = ws2.getCell("A3");
  sec2.value = "DATOS GENERALES DE LA DISTRIBUCIÓN";
  sec2.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1E293B" } };
  sec2.fill = sectionFill;
  sec2.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws2.getRow(3).height = 20;

  // Fila Obra Social
  ws2.getCell("A4").value = "Obra Social:";
  ws2.getCell("A4").font = { name: "Arial", size: 10, bold: true };
  ws2.mergeCells("B4:H4");
  const clientCell2 = ws2.getCell("B4");
  clientCell2.value = clientName;
  clientCell2.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF0F172A" } };
  clientCell2.alignment = { horizontal: "left", vertical: "middle" };
  ws2.getRow(4).height = 22;

  // Fila Liquidación, Mes, Recibo
  ws2.getCell("A5").value = "Liquidación N°:";
  ws2.getCell("A5").font = { name: "Arial", size: 9, bold: true };
  ws2.getCell("B5").value = liqCode;
  ws2.getCell("C5").value = "Mes Carga / Período:";
  ws2.getCell("C5").font = { name: "Arial", size: 9, bold: true };
  ws2.mergeCells("D5:E5");
  ws2.getCell("D5").value = mesCarga;
  ws2.getCell("F5").value = "Recibo UEP N°:";
  ws2.getCell("F5").font = { name: "Arial", size: 9, bold: true };
  ws2.mergeCells("G5:H5");
  ws2.getCell("G5").value = rcNumber;

  // Fila Estado, Expediente, Norma Legal
  ws2.getCell("A6").value = "Estado:";
  ws2.getCell("A6").font = { name: "Arial", size: 9, bold: true };
  ws2.getCell("B6").value = statusLabel;
  ws2.getCell("C6").value = "N° Expediente:";
  ws2.getCell("C6").font = { name: "Arial", size: 9, bold: true };
  ws2.mergeCells("D6:E6");
  ws2.getCell("D6").value = liq.expediente || "Sin asignar";
  ws2.getCell("F6").value = "N° NORMA LEGAL:";
  ws2.getCell("F6").font = { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } };
  ws2.mergeCells("G6:H6");
  ws2.getCell("G6").value = normaLegalText;
  ws2.getCell("G6").font = { name: "Arial", size: 9, bold: true, color: normaLegalText === "Sin asignar" ? { argb: "FF64748B" } : { argb: "FF047857" } };

  // Fila Operador (solo reportes Sede UEP) y Fecha Emisión
  if (showOperatorInReport) {
    ws2.getCell("A7").value = "Operador / Liquidador:";
    ws2.getCell("A7").font = { name: "Arial", size: 9, bold: true };
    ws2.mergeCells("B7:E7");
    ws2.getCell("B7").value = operador;
    ws2.getCell("F7").value = "Fecha Emisión:";
    ws2.getCell("F7").font = { name: "Arial", size: 9, bold: true };
    ws2.mergeCells("G7:H7");
    ws2.getCell("G7").value = fechaGeneracion;
  } else {
    ws2.getCell("A7").value = "Fecha Emisión:";
    ws2.getCell("A7").font = { name: "Arial", size: 9, bold: true };
    ws2.mergeCells("B7:D7");
    ws2.getCell("B7").value = fechaGeneracion;
  }

  // Fila Facturas de Venta (FC Ventas) asociadas al Recibo
  ws2.getCell("A8").value = "Facturas de Venta (FC):";
  ws2.getCell("A8").font = { name: "Arial", size: 9, bold: true };
  ws2.getCell("A8").alignment = { horizontal: "left", vertical: "middle" };
  ws2.mergeCells("B8:H8");
  const fcCell2 = ws2.getCell("B8");
  fcCell2.value = fcVentasText;
  fcCell2.font = {
    name: "Arial",
    size: 9,
    bold: fcVentasList.length > 0,
    color: fcVentasList.length > 0 ? { argb: "FF1D4ED8" } : { argb: "FF64748B" },
  };
  fcCell2.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws2.getRow(8).height = Math.max(20, Math.ceil(fcVentasText.length / 85) * 16);

  // Agrupar distribución por hospital
  const hospitalMap = new Map<string, {
    id?: number;
    name: string;
    localidad: string;
    cuit: string;
    brutoAPagar: number;
    debitos: number;
    ga: number;
    netoAPagar: number;
    honorarios: number;
    sobreasignacion: number;
    gastos: number;
  }>();

  for (const d of details) {
    const hid = d.hospitalId || d.compra?.hospitalId;
    const name = d.prestadorNombre || d.hospital?.nombre || `Hospital #${hid || "?"}`;
    const localidad = String(d.localidad || "").trim();
    const cuit = formatCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit || "");
    const key = hid ? `id-${hid}` : `name-${name}`;
    const existing = hospitalMap.get(key) || {
      id: hid,
      name,
      localidad: localidad || "-",
      cuit: cuit || "-",
      brutoAPagar: 0,
      debitos: 0,
      ga: 0,
      netoAPagar: 0,
      honorarios: 0,
      sobreasignacion: 0,
      gastos: 0,
    };
    if ((!existing.localidad || existing.localidad === "-") && localidad) {
      existing.localidad = localidad;
    }
    if ((!existing.cuit || existing.cuit === "-") && cuit) {
      existing.cuit = cuit;
    }
    existing.brutoAPagar = formatMoney(existing.brutoAPagar + Number(d.brutoAPagar || 0));
    existing.debitos = formatMoney(existing.debitos + Number(d.debitos || 0));
    existing.ga = formatMoney(existing.ga + Number(d.ga || 0));
    existing.netoAPagar = formatMoney(existing.netoAPagar + Number(d.netoAPagar || 0));
    hospitalMap.set(key, existing);
  }

  for (const p of personalDistributions) {
    const hon = formatMoney(p.honorarios || 0);
    const sob = formatMoney(p.sobreasignacion || 0);
    const key = p.hospitalKey || (p.hospitalId ? `id-${p.hospitalId}` : undefined);

    if (key && hospitalMap.has(key)) {
      const item = hospitalMap.get(key)!;
      item.honorarios = formatMoney(item.honorarios + hon);
      item.sobreasignacion = formatMoney(item.sobreasignacion + sob);
    } else if (hospitalMap.size === 1) {
      const item = Array.from(hospitalMap.values())[0];
      item.honorarios = formatMoney(item.honorarios + hon);
      item.sobreasignacion = formatMoney(item.sobreasignacion + sob);
    }
  }

  for (const dist of distributions) {
    const hon = formatMoney(dist.honorarios || 0);
    const sob = formatMoney(dist.sobreasignaciones || 0);
    const gas = formatMoney(dist.gastos || 0);
    const hid = dist.agent?.hospitalId;
    if (hid && hospitalMap.has(`id-${hid}`)) {
      const item = hospitalMap.get(`id-${hid}`)!;
      item.honorarios = formatMoney(item.honorarios + hon);
      item.sobreasignacion = formatMoney(item.sobreasignacion + sob);
      item.gastos = formatMoney(item.gastos + gas);
    } else if (hospitalMap.size === 1) {
      const item = Array.from(hospitalMap.values())[0];
      item.honorarios = formatMoney(item.honorarios + hon);
      item.sobreasignacion = formatMoney(item.sobreasignacion + sob);
      item.gastos = formatMoney(item.gastos + gas);
    }
  }

  // Tabla Distribución
  let nextRow2 = 10;
  const headers2 = [
    "Hospital / Establecimiento",
    "Neto a Distribuir ($)",
    "Sobreasignación Personal ($)",
    "Honorarios Médicos ($)",
    "Gastos Disponible ($)",
    "Total Distribuido ($)",
    "Diferencia / Restante ($)",
    "Estado Distribución",
  ];

  const headerRow2 = ws2.getRow(nextRow2);
  headerRow2.values = headers2;
  headerRow2.height = 24;
  styleRow(headerRow2, 1, 8, {
    font: { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } },
    fill: headerFill,
    border: thinBorder,
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
  });
  headerRow2.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  nextRow2++;

  let sumNeto = 0;
  let sumHon = 0;
  let sumSob = 0;
  let sumGas = 0;
  let sumDist = 0;

  for (const h of Array.from(hospitalMap.values())) {
    const totalAsignado = formatMoney(h.honorarios + h.sobreasignacion);
    const gastosCalc = Math.max(0, formatMoney(h.netoAPagar - totalAsignado));
    const totalDist = formatMoney(totalAsignado + gastosCalc);
    const diff = formatMoney(h.netoAPagar - totalDist);

    const isCompleted = h.netoAPagar > 0 && Math.abs(diff) <= 0.05;
    const hasStarted = totalAsignado > 0;
    const estado = isCompleted ? "COMPLETO" : hasStarted ? "EN CARGA" : "SIN INICIAR";

    sumNeto += h.netoAPagar;
    sumHon += h.honorarios;
    sumSob += h.sobreasignacion;
    sumGas += gastosCalc;
    sumDist += totalDist;

    const r = ws2.getRow(nextRow2);
    r.values = [
      h.name,
      formatMoney(h.netoAPagar),
      formatMoney(h.sobreasignacion),
      formatMoney(h.honorarios),
      formatMoney(gastosCalc),
      formatMoney(totalDist),
      formatMoney(diff),
      estado,
    ];
    r.height = 20;

    styleRow(r, 1, 8, {
      font: { name: "Arial", size: 9 },
      border: thinBorder,
      alignment: { vertical: "middle" },
    });

    r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    for (let c = 2; c <= 7; c++) {
      r.getCell(c).numFmt = accountingNumFmt;
      r.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
    }
    r.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
    r.getCell(8).font = {
      name: "Arial",
      size: 9,
      bold: true,
      color: isCompleted ? { argb: "FF047857" } : hasStarted ? { argb: "FFB45309" } : { argb: "FF64748B" },
    };

    nextRow2++;
  }

  // Fila Totales Generales Hoja 2
  const totRow2 = ws2.getRow(nextRow2);
  totRow2.values = [
    "TOTALES GENERALES",
    formatMoney(sumNeto),
    formatMoney(sumSob),
    formatMoney(sumHon),
    formatMoney(sumGas),
    formatMoney(sumDist),
    formatMoney(sumNeto - sumDist),
    sumNeto > 0 && Math.abs(sumNeto - sumDist) <= 0.05 ? "COMPLETADO" : "EN PROCESO",
  ];
  totRow2.height = 24;

  styleRow(totRow2, 1, 8, {
    font: { name: "Arial", size: 9, bold: true },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } },
    border: doubleBottomBorder,
    alignment: { vertical: "middle" },
  });

  totRow2.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  for (let c = 2; c <= 7; c++) {
    totRow2.getCell(c).numFmt = accountingNumFmt;
    totRow2.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
  }
  totRow2.getCell(8).alignment = { vertical: "middle", horizontal: "center" };

  // Anchos de columna Hoja 2 (encabezados en 1 sola línea sin cortar ($), ajustado a 1 hoja A4 horizontal)
  ws2.columns = [
    { key: "hosp", width: 38 }, // Hospital / Establecimiento
    { key: "neto", width: 24 }, // Neto a Distribuir ($)
    { key: "sob", width: 30 }, // Sobreasignación Personal ($)
    { key: "hon", width: 25 }, // Honorarios Médicos ($)
    { key: "gas", width: 24 }, // Gastos Disponible ($)
    { key: "totd", width: 24 }, // Total Distribuido ($)
    { key: "diff", width: 27 }, // Diferencia / Restante ($)
    { key: "est", width: 22 }, // Estado Distribución
  ];

  // =========================================================================
  // 3. HOJA 3: NÓMINA SISPER (si existen asignaciones individuales)
  // =========================================================================
  let hasAgents = false;
  const agentRows: any[] = [];

  for (const p of personalDistributions) {
    const cuilStr = String(p.cuil || "").replace(/\D/g, "");
    const agentInfo = mspAgentsMap[cuilStr] || {};

    const dni = agentInfo.idAgente || (p.idAgente ? String(p.idAgente) : cuilStr.slice(2, 10));
    const cuilFormatted = formatCuit(cuilStr || p.cuil || "");
    const nombre = agentInfo.apellidoyNombre || `Agente CUIL ${cuilFormatted}`;
    const hospital = p.hospitalNombre || agentInfo.hospitalNombre || `Hospital #${p.hospitalId || "?"}`;

    const hon = formatMoney(p.honorarios || 0);
    const sob = formatMoney(p.sobreasignacion || 0);

    if (hon > 0) {
      hasAgents = true;
      agentRows.push([dni, cuilFormatted, nombre, hospital, "Honorarios Médicos", hon, clientName, mesCarga]);
    }
    if (sob > 0) {
      hasAgents = true;
      agentRows.push([dni, cuilFormatted, nombre, hospital, "Sobreasignación al Personal", sob, clientName, mesCarga]);
    }
  }

  for (const d of distributions) {
    const agent = d.agent || {};
    const dni = agent.dni ? String(agent.dni) : "-";
    const cuilFormatted = formatCuit(agent.cuil || "");
    const nombre = agent.nombre || "-";
    const hospital = agent.hospital?.nombre || "-";

    const hon = formatMoney(d.honorarios || 0);
    const sob = formatMoney(d.sobreasignaciones || 0);

    if (hon > 0) {
      hasAgents = true;
      agentRows.push([dni, cuilFormatted, nombre, hospital, "Honorarios Médicos", hon, clientName, mesCarga]);
    }
    if (sob > 0) {
      hasAgents = true;
      agentRows.push([dni, cuilFormatted, nombre, hospital, "Sobreasignación al Personal", sob, clientName, mesCarga]);
    }
  }

  if (hasAgents) {
    const ws3 = wb.addWorksheet("Nómina SISPER", {
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        showGridLines: true,
      },
      views: [{ showGridLines: true }],
    });

    ws3.mergeCells("A1:H1");
    const title3 = ws3.getCell("A1");
    title3.value = isHospitalScoped && hospitalScopeName
      ? `NÓMINA DE AGENTES ASIGNADOS (SISPER) - ${liqCode} - ${hospitalScopeName}`
      : `NÓMINA DE AGENTES Y PROFESIONALES ASIGNADOS (SISPER) - ${liqCode}`;
    title3.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    title3.fill = titleFill;
    title3.alignment = { horizontal: "center", vertical: "middle" };
    ws3.getRow(1).height = 26;

    const headers3 = [
      "DNI / ID Agente",
      "CUIL",
      "Apellido y Nombre",
      "Establecimiento Sanitario (Hospital)",
      "Concepto Asignado",
      "Importe Asignado ($)",
      "Obra Social",
      "Período",
    ];

    const hRow3 = ws3.getRow(3);
    hRow3.values = headers3;
    hRow3.height = 22;
    styleRow(hRow3, 1, 8, {
      font: { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } },
      fill: headerFill,
      border: thinBorder,
      alignment: { vertical: "middle", horizontal: "center" },
    });
    hRow3.getCell(3).alignment = { vertical: "middle", horizontal: "left" };
    hRow3.getCell(4).alignment = { vertical: "middle", horizontal: "left" };

    let r3Idx = 4;
    for (const aRow of agentRows) {
      const r = ws3.getRow(r3Idx);
      r.values = aRow;
      r.height = 19;
      styleRow(r, 1, 8, {
        font: { name: "Arial", size: 9 },
        border: thinBorder,
        alignment: { vertical: "middle" },
      });
      r.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(6).numFmt = accountingNumFmt;
      r.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
      r3Idx++;
    }

    ws3.columns = [
      { key: "dni", width: 16 },
      { key: "cuil", width: 17 },
      { key: "nom", width: 34 },
      { key: "hosp", width: 38 },
      { key: "con", width: 26 },
      { key: "imp", width: 19 },
      { key: "os", width: 28 },
      { key: "per", width: 16 },
    ];
  }

  // =========================================================================
  // 4. HOJA 4: POR EXPTE (Tesorería / TGP - exclusivo reportes Sede UEP)
  // =========================================================================
  if (!isHospitalScoped) {
    const totalSueldos = formatMoney((liq.totalHonorarios || 0) + (liq.totalSobreasignaciones || 0));
    const wsExpte = wb.addWorksheet("Por Expte.", {
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        showGridLines: true,
      },
      views: [{ showGridLines: true }],
    });

    wsExpte.mergeCells("A1:G1");
    const titleExpte = wsExpte.getCell("A1");
    titleExpte.value = "REPORTE RESUMEN POR EXPEDIENTE ADMINISTRATIVO - UEP MSP";
    titleExpte.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titleExpte.fill = titleFill;
    titleExpte.alignment = { horizontal: "center", vertical: "middle" };
    wsExpte.getRow(1).height = 26;

    const headersExpte = ["SIGLAS OS", "LIQUIDACIÓN N°", "expte", "N° NORMA LEGAL", "Hon. Médicos", "Sobreasignación", "SUELDOS"];
    const hExpRow = wsExpte.getRow(3);
    hExpRow.values = headersExpte;
    hExpRow.height = 22;
    styleRow(hExpRow, 1, 7, {
      font: { name: "Arial", size: 9, bold: true },
      fill: headerFill,
      border: thinBorder,
      alignment: { vertical: "middle", horizontal: "center" },
    });

    const rowDataExp = wsExpte.getRow(4);
    rowDataExp.values = [
      clientName,
      `Liq. N° ${liq.id} - ${clientName} - ${mesCarga}`,
      liq.expediente || "Pendiente de Asignación",
      normaLegalText,
      formatMoney(liq.totalHonorarios || 0),
      formatMoney(liq.totalSobreasignaciones || 0),
      totalSueldos,
    ];
    rowDataExp.height = 20;
    styleRow(rowDataExp, 1, 7, {
      font: { name: "Arial", size: 9 },
      border: thinBorder,
      alignment: { vertical: "middle" },
    });
    rowDataExp.getCell(5).numFmt = accountingNumFmt;
    rowDataExp.getCell(6).numFmt = accountingNumFmt;
    rowDataExp.getCell(7).numFmt = accountingNumFmt;

    const rowTotExp = wsExpte.getRow(6);
    rowTotExp.values = [
      "TOTAL GENERAL",
      "",
      "",
      "",
      formatMoney(liq.totalHonorarios || 0),
      formatMoney(liq.totalSobreasignaciones || 0),
      totalSueldos,
    ];
    rowTotExp.height = 22;
    styleRow(rowTotExp, 1, 7, {
      font: { name: "Arial", size: 9, bold: true },
      border: doubleBottomBorder,
      alignment: { vertical: "middle" },
    });
    rowTotExp.getCell(5).numFmt = accountingNumFmt;
    rowTotExp.getCell(6).numFmt = accountingNumFmt;
    rowTotExp.getCell(7).numFmt = accountingNumFmt;

    wsExpte.columns = [
      { key: "os", width: 28 },
      { key: "liq", width: 44 },
      { key: "exp", width: 24 },
      { key: "norma", width: 20 },
      { key: "hon", width: 20 },
      { key: "sob", width: 20 },
      { key: "suel", width: 20 },
    ];
  }

  // =========================================================================
  // 5. HOJA 5: GASTOS Y HONORARIOS MÉDICOS GENERAL (solo Sede UEP y Reporte Distribuido)
  // =========================================================================
  const isDistributedReport =
    isExplicitDistributed ||
    (!isExplicitPending && (effectiveStatus === "DISTRIBUIDA" || effectiveStatus === "DISTRIBUIDO"));

  if (!isHospitalScoped && isDistributedReport) {
    const wsGen = wb.addWorksheet("Gastos y Hon. Médicos General", {
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

    wsGen.mergeCells("A1:N1");
    const titleGen = wsGen.getCell("A1");
    titleGen.value = "GASTOS Y HONORARIOS MÉDICOS GENERAL - UEP MSP";
    titleGen.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titleGen.fill = titleFill;
    titleGen.alignment = { horizontal: "center", vertical: "middle" };
    wsGen.getRow(1).height = 26;

    const headersGen = [
      "LIQ",
      "N° NORMA LEGAL",
      "N° EXPTE",
      "PRESTADORES",
      "LOCALIDAD",
      "CUIT N°",
      "TOTAL BRUTO ($)",
      "NETO A DISTRIBUIR ($)",
      "DÉBITOS ($)",
      "GASTO ADMIN. ($)",
      "SOBREASIGNACIÓN ($)",
      "HONORARIOS ($)",
      "GASTOS DISPONIBLE ($)",
      "CÓDIGO IMEDIC",
    ];

    const hGenRow = wsGen.getRow(3);
    hGenRow.values = headersGen;
    hGenRow.height = 24;
    styleRow(hGenRow, 1, 14, {
      font: { name: "Arial", size: 9, bold: true, color: { argb: "FF0F172A" } },
      fill: headerFill,
      border: thinBorder,
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    });
    hGenRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    hGenRow.getCell(4).alignment = { vertical: "middle", horizontal: "left" };

    const liqLabelGen = `Liq. N° ${liq.id} - ${clientName} - ${mesCarga}`;
    const expteLabelGen = liq.expediente || "Sin asignar";

    let genRowIdx = 4;
    let genSumBruto = 0;
    let genSumNeto = 0;
    let genSumDebitos = 0;
    let genSumGa = 0;
    let genSumSob = 0;
    let genSumHon = 0;
    let genSumGastos = 0;

    for (const h of Array.from(hospitalMap.values())) {
      const totalAsignado = formatMoney(h.honorarios + h.sobreasignacion);
      const gastosCalc = Math.max(0, formatMoney(h.netoAPagar - totalAsignado));

      genSumBruto += h.brutoAPagar;
      genSumNeto += h.netoAPagar;
      genSumDebitos += h.debitos;
      genSumGa += h.ga;
      genSumSob += h.sobreasignacion;
      genSumHon += h.honorarios;
      genSumGastos += gastosCalc;

      const r = wsGen.getRow(genRowIdx);
      r.values = [
        liqLabelGen,
        normaLegalText,
        expteLabelGen,
        h.name,
        h.localidad || "-",
        h.cuit || "-",
        formatMoney(h.brutoAPagar),
        formatMoney(h.netoAPagar),
        formatMoney(h.debitos),
        formatMoney(h.ga),
        formatMoney(h.sobreasignacion),
        formatMoney(h.honorarios),
        formatMoney(gastosCalc),
        h.id ?? "-",
      ];
      r.height = 20;

      styleRow(r, 1, 14, {
        font: { name: "Arial", size: 9 },
        border: thinBorder,
        alignment: { vertical: "middle" },
      });

      r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      r.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      r.getCell(4).alignment = { vertical: "middle", horizontal: "left" };
      r.getCell(5).alignment = { vertical: "middle", horizontal: "left" };
      r.getCell(6).alignment = { vertical: "middle", horizontal: "center" };
      for (let c = 7; c <= 13; c++) {
        r.getCell(c).numFmt = accountingNumFmt;
        r.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
      }
      r.getCell(8).font = { name: "Arial", size: 9, bold: true, color: { argb: "FF047857" } };
      r.getCell(14).alignment = { vertical: "middle", horizontal: "center" };

      genRowIdx++;
    }

    // Fila Total General (sin sumar Código iMedic)
    const totRowGen = wsGen.getRow(genRowIdx);
    totRowGen.values = [
      "TOTAL GENERAL",
      "",
      "",
      "",
      "",
      "",
      formatMoney(genSumBruto),
      formatMoney(genSumNeto),
      formatMoney(genSumDebitos),
      formatMoney(genSumGa),
      formatMoney(genSumSob),
      formatMoney(genSumHon),
      formatMoney(genSumGastos),
      "",
    ];
    totRowGen.height = 24;

    styleRow(totRowGen, 1, 14, {
      font: { name: "Arial", size: 9, bold: true },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } },
      border: doubleBottomBorder,
      alignment: { vertical: "middle" },
    });

    totRowGen.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    for (let c = 7; c <= 13; c++) {
      totRowGen.getCell(c).numFmt = accountingNumFmt;
      totRowGen.getCell(c).alignment = { vertical: "middle", horizontal: "right" };
    }
    totRowGen.getCell(8).font = { name: "Arial", size: 9, bold: true, color: { argb: "FF047857" } };

    wsGen.columns = [
      { key: "liq", width: 34 }, // LIQ
      { key: "norma", width: 19 }, // N° NORMA LEGAL
      { key: "expte", width: 20 }, // N° EXPTE
      { key: "prest", width: 36 }, // PRESTADORES
      { key: "loc", width: 18 }, // LOCALIDAD
      { key: "cuit", width: 16 }, // CUIT N°
      { key: "bruto", width: 19 }, // TOTAL BRUTO ($)
      { key: "neto", width: 23 }, // NETO A DISTRIBUIR ($)
      { key: "deb", width: 15 }, // DÉBITOS ($)
      { key: "ga", width: 19 }, // GASTO ADMIN. ($)
      { key: "sob", width: 22 }, // SOBREASIGNACIÓN ($)
      { key: "hon", width: 18 }, // HONORARIOS ($)
      { key: "gas", width: 23 }, // GASTOS DISPONIBLE ($)
      { key: "imed", width: 17 }, // CÓDIGO IMEDIC
    ];
  }

  const sanitizedClient = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);

  const sanitizedHospital = hospitalScopeName
    ? hospitalScopeName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 22)
    : "";

  let filePrefix = "Reporte_Liquidacion";
  if (isExplicitPending || effectiveStatus === "PENDIENTE") {
    filePrefix = "Reporte_Pendiente";
  } else if (isExplicitDistributed || effectiveStatus === "DISTRIBUIDA" || effectiveStatus === "DISTRIBUIDO") {
    filePrefix = "Reporte_Distribuido";
  }

  const fileName = sanitizedHospital
    ? `${filePrefix}_${liqCode}_${sanitizedHospital}_${sanitizedClient}.xlsx`
    : `${filePrefix}_${liqCode}_${sanitizedClient}.xlsx`;

  return { workbook: wb, fileName };
}

/**
 * Genera el buffer binario del Excel en el servidor (para subir a Blob Storage / Local Server)
 */
export async function generateLiquidationExcelBuffer(
  liq: any,
  mspAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> = {},
  customNormaLegal?: string,
  reportMode: "PENDIENTE" | "DISTRIBUIDA" | "AUTO" = "AUTO"
): Promise<{ buffer: Buffer; fileName: string }> {
  const { workbook, fileName } = buildLiquidationWorkbook(liq, mspAgentsMap, customNormaLegal, reportMode);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), fileName };
}

/**
 * Genera y descarga un reporte completo en Excel (.xlsx) en el cliente
 */
export async function downloadLiquidationExcel(
  liquidationId: number,
  existingLiquidation?: any,
  customNormaLegal?: string,
  reportMode: "PENDIENTE" | "DISTRIBUIDA" | "AUTO" = "AUTO"
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await getLiquidationExcelReportData(liquidationId);
    if (!res || res.error || !res.liquidation) {
      throw new Error(res?.error || "No se pudo cargar la información de la liquidación.");
    }

    const liq = res.liquidation;
    const mspAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> =
      res.mspAgentsMap || {};

    const { workbook, fileName } = buildLiquidationWorkbook(liq, mspAgentsMap, customNormaLegal, reportMode);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (err: any) {
    console.error("Error generating liquidation excel report:", err);
    return { success: false, error: err.message || "Error al generar el archivo Excel." };
  }
}
