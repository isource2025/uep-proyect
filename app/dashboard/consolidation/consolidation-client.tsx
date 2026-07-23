"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { fetchConsolidationData, closePeriodLiquidations } from "./actions";
import * as XLSX from "xlsx";

interface Period {
  anio: number;
  mes: number;
  iva: string;
  fechaCierre: any;
}

interface ConsolidationClientProps {
  periods: Period[];
}

export function ConsolidationClient({ periods }: ConsolidationClientProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [liquidations, setLiquidations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [closing, setClosing] = useState(false);

  // Initialize with the first available period
  useEffect(() => {
    if (periods.length > 0) {
      const first = periods[0];
      setSelectedPeriod(`${first.anio}-${first.mes}`);
    }
  }, [periods]);

  // Load data when selected period changes
  useEffect(() => {
    if (!selectedPeriod) return;
    const [anio, mes] = selectedPeriod.split("-").map(Number);
    
    const loadData = async () => {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetchConsolidationData(anio, mes);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setLiquidations(res.liquidations || []);
        }
      } catch (err) {
        setErrorMsg("Error de conexión al cargar los datos del período.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedPeriod]);

  const getMonthName = (monthNum: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[monthNum - 1] || `Mes ${monthNum}`;
  };

  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  // Calculations
  const totalNet = liquidations.reduce((sum, liq) => {
    const liqNet = liq.details.reduce((s: number, d: any) => s + Number(d.netoAPagar), 0);
    return sum + liqNet;
  }, 0);

  const totalDistributed = liquidations.reduce((sum, liq) => {
    const liqDist = liq.distributions.reduce(
      (s: number, d: any) => s + Number(d.honorarios) + Number(d.sobreasignaciones) + Number(d.gastos),
      0
    );
    return sum + liqDist;
  }, 0);

  const totalGastos = liquidations.reduce((sum, liq) => {
    const liqGastos = liq.distributions.reduce((s: number, d: any) => s + Number(d.gastos), 0);
    return sum + liqGastos;
  }, 0);

  const totalHonorarios = liquidations.reduce((sum, liq) => {
    const liqHon = liq.distributions.reduce(
      (s: number, d: any) => s + Number(d.honorarios) + Number(d.sobreasignaciones),
      0
    );
    return sum + liqHon;
  }, 0);

  const totalRemaining = totalNet - totalDistributed;

  const activePeriodObj = periods.find(p => {
    if (!selectedPeriod) return false;
    const [anio, mes] = selectedPeriod.split("-").map(Number);
    return p.anio === anio && p.mes === mes;
  });

  const isPeriodClosed = activePeriodObj ? activePeriodObj.fechaCierre !== null : false;

  // Export SISPER Excel Sheet
  const handleExportSisper = () => {
    if (liquidations.length === 0) return;
    const [anio, mes] = selectedPeriod.split("-").map(Number);

    const exportRows: any[] = [];

    liquidations.forEach((liq) => {
      const clientName = liq.rc.cliente?.nombre || "OBRA SOCIAL";

      liq.distributions.forEach((d: any) => {
        const agentName = d.agent?.nombre || "N/A";
        const agentCuil = d.agent?.cuil || "";
        const cleanCuil = agentCuil.replace(/[^0-9]/g, "");
        const agentDni = cleanCuil.length >= 10 ? cleanCuil.substring(2, 10) : cleanCuil;
        const cargoStr =
          d.agent?.cargo === "1"
            ? "ADMINISTRATIVO"
            : d.agent?.cargo === "2"
            ? "HONORARIOS MEDICOS"
            : d.agent?.cargo === "3"
            ? "ENFERMERO"
            : d.agent?.cargo || "PROFESIONAL";

        const hospitalName = d.agent?.hospital?.nombre || d.agent?.establecimiento || "HOSPITAL";

        // 1. Honorarios
        if (Number(d.honorarios) > 0) {
          exportRows.push({
            DNI: agentDni,
            CUIL: agentCuil,
            "APELLIDO Y NOMBRE": agentName,
            "PUESTO LABORAL": cargoStr,
            "ESTABLECIMIENTO SANITARIO": hospitalName,
            CONCEPTO: "Honorarios Médicos",
            "OBRA SOCIAL": clientName,
            MES: getMonthName(mes),
            AÑO: anio,
            IMPORTE: Number(d.honorarios),
          });
        }

        // 2. Sobreasignaciones
        if (Number(d.sobreasignaciones) > 0) {
          exportRows.push({
            DNI: agentDni,
            CUIL: agentCuil,
            "APELLIDO Y NOMBRE": agentName,
            "PUESTO LABORAL": cargoStr,
            "ESTABLECIMIENTO SANITARIO": hospitalName,
            CONCEPTO: "Sobreasignación al Personal",
            "OBRA SOCIAL": clientName,
            MES: getMonthName(mes),
            AÑO: anio,
            IMPORTE: Number(d.sobreasignaciones),
          });
        }
      });
    });

    if (exportRows.length === 0) {
      alert("No hay montos de honorarios o sobreasignaciones distribuidos en este período para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Planilla SISPER");

    // Auto fit columns
    worksheet["!cols"] = [
      { wch: 12 }, // DNI
      { wch: 15 }, // CUIL
      { wch: 30 }, // APELLIDO Y NOMBRE
      { wch: 25 }, // PUESTO LABORAL
      { wch: 35 }, // ESTABLECIMIENTO SANITARIO
      { wch: 25 }, // CONCEPTO
      { wch: 25 }, // OBRA SOCIAL
      { wch: 12 }, // MES
      { wch: 8 },  // AÑO
      { wch: 15 }, // IMPORTE
    ];

    XLSX.writeFile(workbook, `Consolidado_SISPER_${getMonthName(mes)}_${anio}.xlsx`);
  };

  // Export Treasury Excel Sheet
  const handleExportTesoreria = () => {
    if (liquidations.length === 0) return;
    const [anio, mes] = selectedPeriod.split("-").map(Number);

    const exportRows: any[] = [];

    liquidations.forEach((liq) => {
      const clientName = liq.rc.cliente?.nombre || "OBRA SOCIAL";

      // Group distributions by agent's hospital/provider to sum total expenses per hospital
      const hospitalGroup: Record<string, number> = {};

      liq.distributions.forEach((d: any) => {
        if (Number(d.gastos) > 0) {
          const hospitalName = d.agent?.hospital?.nombre || d.agent?.establecimiento || "HOSPITAL";
          hospitalGroup[hospitalName] = (hospitalGroup[hospitalName] || 0) + Number(d.gastos);
        }
      });

      Object.entries(hospitalGroup).forEach(([hospitalName, totalGasto]) => {
        exportRows.push({
          "Establecimiento Sanitario (Hospital)": hospitalName,
          "Obra Social (Origen)": clientName,
          Concepto: "Gastos de Funcionamiento",
          Periodo: `${getMonthName(mes)} ${anio}`,
          "Importe a Transferir": totalGasto,
        });
      });
    });

    if (exportRows.length === 0) {
      alert("No hay montos de gastos de funcionamiento distribuidos en este período para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Tesorería");

    // Auto fit columns
    worksheet["!cols"] = [
      { wch: 40 }, // Hospital
      { wch: 30 }, // Obra social
      { wch: 25 }, // Concepto
      { wch: 15 }, // Periodo
      { wch: 20 }, // Importe
    ];

    XLSX.writeFile(workbook, `Reporte_Gastos_Tesoreria_${getMonthName(mes)}_${anio}.xlsx`);
  };

  // Close period trigger
  const handleClosePeriod = async () => {
    if (!window.confirm("¿Está seguro de que desea cerrar definitivamente las liquidaciones de este período? Esto bloqueará cualquier cambio posterior en distribuciones, facturas o adjuntos.")) {
      return;
    }

    setClosing(true);
    setErrorMsg("");
    setSuccessMsg("");
    const [anio, mes] = selectedPeriod.split("-").map(Number);

    try {
      const res = await closePeriodLiquidations(anio, mes);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("El período ha sido cerrado exitosamente.");
        // Reload data
        const updatedReq = await fetchConsolidationData(anio, mes);
        if (!updatedReq.error) {
          setLiquidations(updatedReq.liquidations || []);
        }
      }
    } catch (err) {
      setErrorMsg("Ocurrió un error al intentar cerrar el período.");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selection Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600/10 border border-emerald-500/25 p-2 rounded-xl text-emerald-600 dark:text-emerald-400">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Consolidación del Período</h2>
            <p className="text-xs text-muted-foreground">Consolide planillas de haberes SISPER y transferencias de Tesorería.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Label htmlFor="periodSelect" className="text-xs font-semibold text-muted-foreground uppercase">Período:</Label>
          <select
            id="periodSelect"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-card text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 font-bold"
          >
            {periods.map((p) => (
              <option key={`${p.anio}-${p.mes}`} value={`${p.anio}-${p.mes}`}>
                {getMonthName(p.mes)} {p.anio} {p.fechaCierre ? "🔒 (Cerrado)" : "🔓 (Abierto)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/25 p-3 text-red-600 dark:text-red-400 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="font-semibold">{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-emerald-600 dark:text-emerald-400 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {/* Metrics Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-card text-card-foreground">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Neto Liquidado O.S.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-foreground">{formatCurrency(totalNet)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Total recaudado de las obras sociales</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-card-foreground">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Planilla SISPER (Haberes)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatCurrency(totalHonorarios)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Honorarios y sobreasignaciones médicas</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-card-foreground">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gastos de Funcionamiento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-teal-600 dark:text-teal-400">{formatCurrency(totalGastos)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Transferencias a cuentas de hospitales</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card text-card-foreground">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saldo por Asignar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-black ${totalRemaining > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {formatCurrency(totalRemaining)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Remanente no distribuido por los hospitales</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Control / Download Excel Panel */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Side: Hospital Submission Monitor */}
        <Card className="col-span-2 border-border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-foreground">Monitor de Carga de Hospitales</CardTitle>
            <CardDescription className="text-muted-foreground text-2xs mt-0.5">
              Estado de distribución y rendición de fondos por establecimiento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Establecimiento (Hospital)</TableHead>
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Obra Social</TableHead>
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Estado</TableHead>
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Neto OS</TableHead>
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Asignado</TableHead>
                    <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liquidations.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-10">
                        No hay liquidaciones generadas en este período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    liquidations.map((liq) => {
                      const clientName = liq.rc.cliente?.nombre || "N/A";
                      
                      const liqNet = liq.details.reduce((s: number, d: any) => s + Number(d.netoAPagar), 0);
                      const liqDist = liq.distributions.reduce(
                        (s: number, d: any) => s + Number(d.honorarios) + Number(d.sobreasignaciones) + Number(d.gastos),
                        0
                      );
                      const liqRem = liqNet - liqDist;

                      // Use hospital name from details
                      const hospitalName = liq.details[0]?.prestadorNombre || "HOSPITAL";

                      return (
                        <TableRow key={liq.id} className="hover:bg-muted/20 border-border text-foreground text-xs">
                          <TableCell className="font-semibold text-foreground py-2.5">{hospitalName}</TableCell>
                          <TableCell className="text-muted-foreground text-[11px] truncate max-w-[120px]">{clientName}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold border ${
                              liq.status === "PENDIENTE"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                                : liq.status === "EN_PROCESO" || liq.status === "NOTIFICADO"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                            }`}>
                              {liq.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right py-2.5 font-medium">{formatCurrency(liqNet)}</TableCell>
                          <TableCell className="text-right py-2.5 text-blue-600 dark:text-blue-400">{formatCurrency(liqDist)}</TableCell>
                          <TableCell className={`text-right py-2.5 font-bold ${liqRem > 0.01 ? "text-amber-500" : "text-emerald-500"}`}>
                            {formatCurrency(liqRem)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Consolidation Actions Panel */}
        <Card className="border-border bg-card text-card-foreground flex flex-col justify-between">
          <div>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-foreground">Exportación y Acciones</CardTitle>
              <CardDescription className="text-muted-foreground text-2xs mt-0.5">
                Consolide los datos cargados y envíelos a Tesorería y SISPER.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                onClick={handleExportSisper}
                disabled={liquidations.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs h-10 gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar Planilla SISPER
              </Button>

              <Button
                type="button"
                onClick={handleExportTesoreria}
                disabled={liquidations.length === 0}
                className="w-full bg-teal-600 hover:bg-teal-500 text-zinc-950 font-extrabold text-xs h-10 gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Descargar Reporte Tesorería
              </Button>

              {totalRemaining > 0 && !isPeriodClosed && (
                <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-600 dark:text-amber-400 text-3xs leading-normal">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <p>
                    <strong>Atención:</strong> Quedan <strong>{formatCurrency(totalRemaining)}</strong> sin asignar por los hospitales. Se recomienda esperar a la rendición total antes de consolidar y cerrar.
                  </p>
                </div>
              )}
            </CardContent>
          </div>

          <CardContent className="border-t border-border pt-4 mt-auto">
            {isPeriodClosed ? (
              <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg border border-border text-muted-foreground text-xs font-bold w-full">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Período Cerrado
              </div>
            ) : closing ? (
              <Button disabled className="w-full bg-red-600 text-zinc-950 font-bold text-xs h-10 gap-1.5">
                <Clock className="h-4 w-4 animate-spin" />
                Cerrando Período...
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleClosePeriod}
                disabled={liquidations.length === 0}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs h-10 gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ShieldAlert className="h-4 w-4" />
                Cerrar Período de Liquidación
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
