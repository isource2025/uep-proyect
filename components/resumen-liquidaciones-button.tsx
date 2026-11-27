"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchResumenLiquidacionesExportAction,
  fetchResumenLiquidacionesMetaAction,
  type ResumenLiquidacionesMeta,
} from "@/app/dashboard/liquidations/resumen-actions";
import { downloadResumenLiquidacionesWorkbook } from "@/lib/export-resumen-liquidaciones-excel";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
} from "lucide-react";

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

interface ResumenLiquidacionesButtonProps {
  className?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  label?: string;
}

export function ResumenLiquidacionesButton({
  className,
  size = "default",
  variant = "outline",
  label = "Resumen Liquidaciones (Excel)",
}: ResumenLiquidacionesButtonProps) {
  const currentYear = new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [meta, setMeta] = useState<ResumenLiquidacionesMeta | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setErrorMsg("");
    try {
      const res = await fetchResumenLiquidacionesMetaAction();
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.data) {
        setMeta(res.data);
        // Si el año actual no tiene notificadas pero sí hay en otros años, dejar "ALL" o el último con datos
        if (
          (res.data.countsByYear[currentYear] || 0) === 0 &&
          res.data.totalNotifiedLiquidations > 0
        ) {
          setSelectedYear("ALL");
          setSelectedMonth("ALL");
        }
      }
    } catch {
      setErrorMsg("Error de red al consultar liquidaciones notificadas.");
    } finally {
      setLoadingMeta(false);
    }
  }, [currentYear]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setErrorMsg("");
      setSuccessMsg("");
      void loadMeta();
    }
  };

  const handleYearChange = (val: string) => {
    setSelectedYear(val);
    if (val === "ALL") {
      setSelectedMonth("ALL");
    }
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleDownload = async () => {
    setDownloading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const yearNum = selectedYear === "ALL" ? null : parseInt(selectedYear, 10);
      const monthNum =
        yearNum && selectedMonth !== "ALL" ? parseInt(selectedMonth, 10) : null;

      const res = await fetchResumenLiquidacionesExportAction({
        year: yearNum,
        month: monthNum,
      });

      if (res.error) {
        setErrorMsg(res.error);
        return;
      }

      if (!res.data || res.data.rows.length === 0) {
        setErrorMsg(
          "No se encontraron liquidaciones notificadas para el período seleccionado."
        );
        return;
      }

      const fileName = await downloadResumenLiquidacionesWorkbook(res.data);
      setSuccessMsg(
        `Archivo ${fileName} descargado (${res.data.liquidationsCount} liquidación(es) · ${res.data.rows.length} renglón(es)).`
      );
    } catch {
      setErrorMsg("No se pudo generar el archivo Excel. Intente nuevamente.");
    } finally {
      setDownloading(false);
    }
  };

  const availableYears = meta?.availableYears?.length ? meta.availableYears : [currentYear];
  const previewCount =
    selectedYear === "ALL"
      ? meta?.totalNotifiedLiquidations ?? null
      : meta?.countsByYear?.[parseInt(selectedYear, 10)] ?? 0;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => handleOpenChange(true)}
        className={cn(
          "gap-2 font-semibold cursor-pointer whitespace-nowrap",
          variant === "outline" &&
            "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200",
          className
        )}
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="truncate">{label}</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-xl border-border bg-card p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-foreground">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-500" />
              <span className="break-words">Resumen General de Liquidaciones</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Planilla oficial dinámica de 22 columnas (A–V) con códigos internos (C°*), localidades y totales formulados en Excel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Info banner explaining single-load rule */}
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
              <p className="leading-relaxed break-words">
                Se incluyen <strong className="text-foreground">únicamente liquidaciones notificadas</strong> a los hospitales. Cada liquidación se carga una sola vez al notificarse y nunca se duplica al pasar a estados posteriores.
              </p>
            </div>

            {/* Filter selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="resumen-year-select" className="text-xs font-semibold text-foreground">
                  Año
                </Label>
                <select
                  id="resumen-year-select"
                  value={selectedYear}
                  onChange={(e) => handleYearChange(e.target.value)}
                  disabled={loadingMeta || downloading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ALL">Todos los años</option>
                  {availableYears.map((y) => (
                    <option key={y} value={String(y)}>
                      {y} {meta ? `(${meta.countsByYear[y] ?? 0} notif.)` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="resumen-month-select" className="text-xs font-semibold text-foreground">
                  Mes (opcional)
                </Label>
                <select
                  id="resumen-month-select"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setErrorMsg("");
                    setSuccessMsg("");
                  }}
                  disabled={selectedYear === "ALL" || loadingMeta || downloading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="ALL">Todo el año</option>
                  {MONTHS.map((m) => (
                    <option key={m.value} value={String(m.value)}>
                      {String(m.value).padStart(2, "0")} - {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live count indicator */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Liquidaciones notificadas disponibles:</span>
              {loadingMeta ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <span className="font-bold text-foreground">
                  {previewCount !== null ? `${previewCount}` : "-"}
                  {selectedMonth !== "ALL" && selectedYear !== "ALL" ? " en el año" : ""}
                </span>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="break-words">{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="break-words">{successMsg}</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={downloading}
              className="w-full sm:w-auto cursor-pointer"
            >
              Cerrar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={downloading || loadingMeta || previewCount === 0}
              className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Generando Excel...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 shrink-0" />
                  <span>Descargar Excel (.xlsx)</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
