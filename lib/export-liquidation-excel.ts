import * as XLSX from "xlsx";
import { getLiquidationStatusConfig } from "@/lib/constants";
import { getLiquidationExcelReportData } from "@/app/dashboard/liquidations/actions";

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

/**
 * Genera y descarga un reporte completo en Excel (.xlsx) para una liquidación
 * @param liquidationId ID de la liquidación
 * @param existingLiquidation Objeto de liquidación opcional si ya está cargado en memoria
 */
export async function downloadLiquidationExcel(
  liquidationId: number,
  existingLiquidation?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    let liq = existingLiquidation;
    let mspAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> = {};

    // Obtener datos frescos y nómina de agentes si no vienen completos
    const res = await getLiquidationExcelReportData(liquidationId);
    if (!res || res.error || !res.liquidation) {
      if (!liq) {
        throw new Error(res?.error || "No se pudo cargar la información de la liquidación.");
      }
    } else {
      liq = res.liquidation;
      mspAgentsMap = res.mspAgentsMap || {};
    }

    const wb = XLSX.utils.book_new();

    const clientName = liq.rc?.cliente?.nombre || "Obra Social";
    const clientCuit = liq.rc?.cliente?.cuit ? String(liq.rc.cliente.cuit) : "-";
    const liqCode = `LIQ-${String(liq.id).padStart(4, "0")}`;
    const statusLabel = getLiquidationStatusConfig(liq.status).label;
    const rcNumber = liq.rc ? `${liq.rc.puntoVenta}-${liq.rc.numero}` : "-";
    const mesCarga = liq.mesCarga || (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "-");
    const operador = liq.createdByName || "UEP Operador";
    const fechaGeneracion = new Date().toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const details = liq.details || [];
    const personalDistributions = liq.personalDistributions || [];
    const distributions = liq.distributions || [];

    // =========================================================================
    // 1. HOJA 1: RESUMEN Y DÉBITOS POR HOSPITAL
    // =========================================================================
    const sheet1Data: any[][] = [
      ["PLANILLA DE LIQUIDACIÓN Y DÉBITOS - UEP MSP"],
      [],
      ["DATOS GENERALES DE LA LIQUIDACIÓN"],
      ["Liquidación N°:", liqCode, "", "Estado:", statusLabel],
      ["Obra Social:", clientName, "", "CUIT O.S.:", clientCuit],
      ["Recibo UEP N°:", rcNumber, "", "Mes de Carga / Período:", mesCarga],
      ["Operador / Liquidador:", operador, "", "Fecha Emisión Reporte:", fechaGeneracion],
      ...(liq.observaciones ? [["Observaciones:", liq.observaciones]] : []),
      [],
      ["RESUMEN DE TOTALES CONSOLIDADOS ($)"],
      ["Total Facturado:", formatMoney(liq.totalFacturado), "", "Bruto a Pagar:", formatMoney(liq.brutoAPagar)],
      ["Total Créditos:", formatMoney(liq.creditos), "", "Gastos Administrativos (GA):", formatMoney(liq.ga)],
      ["Total Débitos:", formatMoney(liq.debitos), "", "Ajuste por Recupero:", formatMoney(liq.ajusteRecupero)],
      ["Ajustes O.S.:", formatMoney(liq.ajustesOs), "", "NETO FINAL A PAGAR:", formatMoney(liq.netoAPagar)],
      ["Pendientes de Cobro:", formatMoney(liq.pendientesCobro), "", "Total Honorarios:", formatMoney(liq.totalHonorarios)],
      ["Pagos Parciales Anteriores:", formatMoney(liq.pagosParcialesAnteriores), "", "Total Sobreasignación:", formatMoney(liq.totalSobreasignaciones)],
      ["", "", "", "Total Gastos Transferibles:", formatMoney(liq.totalGastos)],
      ["", "", "", "TOTAL DISTRIBUIDO:", formatMoney(liq.totalDistribuido)],
      [],
      ["DETALLE DE COMPROBANTES Y FACTURAS DE HOSPITALES"],
      [
        "Hospital / Establecimiento",
        "Localidad",
        "Factura N°",
        "Total Facturado ($)",
        "Créditos ($)",
        "Débitos ($)",
        "Ajustes O.S. ($)",
        "Pendiente Cobro ($)",
        "Pagos Parciales ($)",
        "Bruto a Pagar ($)",
        "G.A. ($)",
        "Ajuste Recupero ($)",
        "Neto a Pagar ($)",
      ],
    ];

    for (const d of details) {
      const hospName = d.prestadorNombre || d.hospital?.nombre || `Hospital #${d.hospitalId || "?"}`;
      const localidad = d.localidad || "CAPITAL";
      const fcNum = d.fcHospital || (d.compra ? `FC-${d.compra.grupoCbte || "0000"}-${d.compra.numero || ""}` : "-");

      sheet1Data.push([
        hospName,
        localidad,
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
      ]);
    }

    // Fila de totales en la tabla
    sheet1Data.push([
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
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

    // Ajustar anchos de columnas en Hoja 1
    ws1["!cols"] = [
      { wch: 38 }, // Hospital
      { wch: 18 }, // Localidad
      { wch: 22 }, // Factura
      { wch: 18 }, // Facturado
      { wch: 15 }, // Creditos
      { wch: 15 }, // Debitos
      { wch: 15 }, // Ajustes OS
      { wch: 18 }, // Pendientes Cobro
      { wch: 18 }, // Pagos Parciales
      { wch: 18 }, // Bruto a Pagar
      { wch: 15 }, // GA
      { wch: 18 }, // Ajuste Recupero
      { wch: 20 }, // Neto a Pagar
    ];

    XLSX.utils.book_append_sheet(wb, ws1, "Resumen y Débitos");

    // =========================================================================
    // 2. HOJA 2: DISTRIBUCIÓN POR HOSPITAL
    // =========================================================================
    const hospitalMap = new Map<string, {
      id?: number;
      name: string;
      netoAPagar: number;
      honorarios: number;
      sobreasignacion: number;
      gastos: number;
    }>();

    for (const d of details) {
      const hid = d.hospitalId || d.compra?.hospitalId;
      const name = d.prestadorNombre || d.hospital?.nombre || `Hospital #${hid || "?"}`;
      const key = hid ? `id-${hid}` : `name-${name}`;
      const existing = hospitalMap.get(key) || {
        id: hid,
        name,
        netoAPagar: 0,
        honorarios: 0,
        sobreasignacion: 0,
        gastos: 0,
      };
      existing.netoAPagar = formatMoney(existing.netoAPagar + Number(d.netoAPagar || 0));
      hospitalMap.set(key, existing);
    }

    // Sumar personal distributions
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

    // Sumar legacy distributions si existieran
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

    const sheet2Data: any[][] = [
      [`DISTRIBUCIÓN POR HOSPITAL - ${liqCode}`],
      [`Obra Social: ${clientName} | Mes Carga: ${mesCarga} | Estado: ${statusLabel}`],
      [],
      [
        "Hospital / Establecimiento",
        "Neto a Pagar ($)",
        "Honorarios Médicos ($)",
        "Sobreasignación Personal ($)",
        "Gastos Funcionamiento ($)",
        "Total Distribuido ($)",
        "Diferencia / Restante ($)",
        "Estado Distribución",
      ],
    ];

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

      sheet2Data.push([
        h.name,
        formatMoney(h.netoAPagar),
        formatMoney(h.honorarios),
        formatMoney(h.sobreasignacion),
        formatMoney(gastosCalc),
        formatMoney(totalDist),
        formatMoney(diff),
        estado,
      ]);
    }

    sheet2Data.push([
      "TOTALES GENERALES",
      formatMoney(sumNeto),
      formatMoney(sumHon),
      formatMoney(sumSob),
      formatMoney(sumGas),
      formatMoney(sumDist),
      formatMoney(sumNeto - sumDist),
      sumNeto > 0 && Math.abs(sumNeto - sumDist) <= 0.05 ? "COMPLETADO" : "EN PROCESO",
    ]);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2["!cols"] = [
      { wch: 38 }, // Hospital
      { wch: 18 }, // Neto
      { wch: 22 }, // Honorarios
      { wch: 24 }, // Sobreasignacion
      { wch: 24 }, // Gastos
      { wch: 20 }, // Total Distribuido
      { wch: 22 }, // Restante
      { wch: 20 }, // Estado
    ];

    XLSX.utils.book_append_sheet(wb, ws2, "Distribución Hospitales");

    // =========================================================================
    // 3. HOJA 3: NÓMINA DE AGENTES SISPER ASIGNADOS
    // =========================================================================
    const sheet3Data: any[][] = [
      [`NÓMINA DE AGENTES Y PROFESIONALES ASIGNADOS (SISPER) - ${liqCode}`],
      [`Obra Social: ${clientName} | Mes Carga: ${mesCarga} | Recibo: ${rcNumber}`],
      [],
      [
        "DNI / ID Agente",
        "CUIL",
        "Apellido y Nombre",
        "Establecimiento Sanitario (Hospital)",
        "Concepto Asignado",
        "Importe Asignado ($)",
        "Obra Social",
        "Período",
      ],
    ];

    let hasAgents = false;

    // 1. Personal distributions (LiquidacionPersonal)
    for (const p of personalDistributions) {
      const cuilStr = String(p.cuil || "").replace(/\D/g, "");
      const agentInfo = mspAgentsMap[cuilStr] || {};

      const dni = agentInfo.idAgente || (p.idAgente ? String(p.idAgente) : cuilStr.slice(2, 10));
      const cuil = cuilStr || (p.cuil ? String(p.cuil) : "-");
      const nombre = agentInfo.apellidoyNombre || `Agente CUIL ${cuil}`;
      const hospital = agentInfo.hospitalNombre || `Hospital #${p.hospitalId || "?"}`;

      const hon = formatMoney(p.honorarios || 0);
      const sob = formatMoney(p.sobreasignacion || 0);

      if (hon > 0) {
        hasAgents = true;
        sheet3Data.push([
          dni,
          cuil,
          nombre,
          hospital,
          "Honorarios Médicos",
          hon,
          clientName,
          mesCarga,
        ]);
      }

      if (sob > 0) {
        hasAgents = true;
        sheet3Data.push([
          dni,
          cuil,
          nombre,
          hospital,
          "Sobreasignación al Personal",
          sob,
          clientName,
          mesCarga,
        ]);
      }
    }

    // 2. Legacy distributions if any
    for (const d of distributions) {
      const agent = d.agent || {};
      const dni = agent.dni ? String(agent.dni) : "-";
      const cuil = agent.cuil ? String(agent.cuil) : "-";
      const nombre = agent.nombre || "-";
      const hospital = agent.hospital?.nombre || "-";

      const hon = formatMoney(d.honorarios || 0);
      const sob = formatMoney(d.sobreasignaciones || 0);

      if (hon > 0) {
        hasAgents = true;
        sheet3Data.push([
          dni,
          cuil,
          nombre,
          hospital,
          "Honorarios Médicos",
          hon,
          clientName,
          mesCarga,
        ]);
      }

      if (sob > 0) {
        hasAgents = true;
        sheet3Data.push([
          dni,
          cuil,
          nombre,
          hospital,
          "Sobreasignación al Personal",
          sob,
          clientName,
          mesCarga,
        ]);
      }
    }

    if (hasAgents) {
      const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
      ws3["!cols"] = [
        { wch: 16 }, // DNI
        { wch: 18 }, // CUIL
        { wch: 32 }, // Apellido y Nombre
        { wch: 35 }, // Hospital
        { wch: 28 }, // Concepto
        { wch: 20 }, // Importe
        { wch: 28 }, // Obra Social
        { wch: 18 }, // Periodo
      ];
      XLSX.utils.book_append_sheet(wb, ws3, "Nómina SISPER");
    }

    // Nombre del archivo exportado
    const sanitizedClient = clientName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .slice(0, 20);
    const fileName = `Reporte_Liquidacion_${liqCode}_${sanitizedClient}.xlsx`;

    XLSX.writeFile(wb, fileName);
    return { success: true };
  } catch (err: any) {
    console.error("Error generating liquidation excel report:", err);
    return { success: false, error: err.message || "Error al generar el archivo Excel." };
  }
}
