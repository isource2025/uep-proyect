"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchBar } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Inbox,
  Landmark,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";
import {
  closeConsolidationBatchAction,
  fetchConsolidationWorkspaceAction,
} from "./actions";
import {
  downloadAnnualTgpWorkbook,
  downloadConsolidatedSisperWorkbook,
  downloadConsolidatedTesoreriaWorkbook,
  downloadConsolidatedTgpWorkbook,
} from "@/lib/export-consolidation-excel";
import type {
  ConsolidationBatchData,
  ConsolidationWorkspaceData,
} from "@/lib/consolidation-types";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getConvenioBadgeClass(convenio: string): string {
  switch (convenio) {
    case "RGA":
      return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30";
    case "PAMI":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30";
    case "IOSCOR":
      return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30";
    default:
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  }
}

interface ConsolidationClientProps {
  initialWorkspace: ConsolidationWorkspaceData;
  initialError?: string;
  canClosePeriod?: boolean;
}

export function ConsolidationClient({
  initialWorkspace,
  initialError,
  canClosePeriod = true,
}: ConsolidationClientProps) {
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const [workspace, setWorkspace] = useState<ConsolidationWorkspaceData>(initialWorkspace);
  const [activeTab, setActiveTab] = useState<"BANDEJA" | "HISTORIAL">("BANDEJA");

  // Estado de selección en Bandeja (por defecto todas las DISTRIBUIDA seleccionadas)
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    initialWorkspace.pendingLiquidations.map((l) => l.id)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [targetMes, setTargetMes] = useState<number>(defaultMonth);
  const [targetAnio, setTargetAnio] = useState<number>(defaultYear);
  const [batchDescripcion, setBatchDescripcion] = useState<string>(
    `${MONTHS[defaultMonth - 1]} ${defaultYear}`
  );
  const [batchObservaciones, setBatchObservaciones] = useState<string>("");
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Estado de Historial y Anual
  const [selectedHistoryYear, setSelectedHistoryYear] = useState<number>(
    initialWorkspace.availableYears[0] || defaultYear
  );
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);

  // Feedback y cargas
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>(initialError || "");
  const [successMsg, setSuccessMsg] = useState<string>("");

  const handleMonthOrYearChange = (nextMes: number, nextAnio: number) => {
    const prevAutoDesc = `${MONTHS[targetMes - 1]} ${targetAnio}`;
    setTargetMes(nextMes);
    setTargetAnio(nextAnio);
    if (!batchDescripcion.trim() || batchDescripcion.trim() === prevAutoDesc) {
      setBatchDescripcion(`${MONTHS[nextMes - 1]} ${nextAnio}`);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorMsg("");
    try {
      const res = await fetchConsolidationWorkspaceAction();
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.data) {
        setWorkspace(res.data);
        setSelectedIds(res.data.pendingLiquidations.map((l) => l.id));
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Error al actualizar la bandeja de consolidación.");
    } finally {
      setRefreshing(false);
    }
  };

  // Filtrado de bandeja
  const filteredPending = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workspace.pendingLiquidations;
    return workspace.pendingLiquidations.filter((l) => {
      return (
        l.code.toLowerCase().includes(q) ||
        String(l.id).includes(q) ||
        l.clienteSigla.toLowerCase().includes(q) ||
        l.clienteNombre.toLowerCase().includes(q) ||
        l.convenio.toLowerCase().includes(q) ||
        l.ctaCteTgp.includes(q) ||
        l.expediente.toLowerCase().includes(q) ||
        l.normaLegal.toLowerCase().includes(q) ||
        l.mesCarga.toLowerCase().includes(q)
      );
    });
  }, [workspace.pendingLiquidations, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedLiquidations = useMemo(
    () => workspace.pendingLiquidations.filter((l) => selectedSet.has(l.id)),
    [workspace.pendingLiquidations, selectedSet]
  );

  // Construir objeto ConsolidationBatchData en borrador con las seleccionadas
  const draftBatch: ConsolidationBatchData = useMemo(() => {
    const sums = selectedLiquidations.reduce(
      (acc, l) => ({
        totalFacturado: round2(acc.totalFacturado + l.totalFacturado),
        totalBruto: round2(acc.totalBruto + l.brutoAPagar),
        totalGa: round2(acc.totalGa + l.ga),
        totalNeto: round2(acc.totalNeto + l.netoAPagar),
        totalHonorarios: round2(acc.totalHonorarios + l.totalHonorarios),
        totalSobreasignaciones: round2(acc.totalSobreasignaciones + l.totalSobreasignaciones),
        totalSueldos: round2(acc.totalSueldos + l.totalSueldos),
        totalGastosDisponible: round2(acc.totalGastosDisponible + l.totalGastosDisponible),
        cta131441002Sueldos:
          l.ctaCteTgp === "131441002"
            ? round2(acc.cta131441002Sueldos + l.totalSueldos)
            : acc.cta131441002Sueldos,
        cta131441004Sueldos:
          l.ctaCteTgp === "131441004"
            ? round2(acc.cta131441004Sueldos + l.totalSueldos)
            : acc.cta131441004Sueldos,
      }),
      {
        totalFacturado: 0,
        totalBruto: 0,
        totalGa: 0,
        totalNeto: 0,
        totalHonorarios: 0,
        totalSobreasignaciones: 0,
        totalSueldos: 0,
        totalGastosDisponible: 0,
        cta131441002Sueldos: 0,
        cta131441004Sueldos: 0,
      }
    );

    return {
      id: null,
      anio: targetAnio,
      mes: targetMes,
      descripcion: batchDescripcion.trim() || `${MONTHS[targetMes - 1]} ${targetAnio}`,
      observaciones: batchObservaciones.trim() || null,
      cerradaPorNombre: null,
      cerradaAt: null,
      liquidacionesCount: selectedLiquidations.length,
      ...sums,
      liquidaciones: selectedLiquidations,
    };
  }, [selectedLiquidations, targetAnio, targetMes, batchDescripcion, batchObservaciones]);

  const missingExpedienteCount = useMemo(
    () => selectedLiquidations.filter((l) => !l.expediente).length,
    [selectedLiquidations]
  );
  const missingNormaCount = useMemo(
    () => selectedLiquidations.filter((l) => !l.normaLegal).length,
    [selectedLiquidations]
  );

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allVisibleSelected =
    filteredPending.length > 0 && filteredPending.every((l) => selectedSet.has(l.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredPending.map((l) => l.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredPending.map((l) => l.id)]);
      setSelectedIds(Array.from(merged));
    }
  };

  // Descargas seguras con estado de carga
  const runDownload = async (key: string, fn: () => Promise<void>) => {
    setDownloadingKey(key);
    setErrorMsg("");
    try {
      await fn();
    } catch (e: any) {
      console.error("Error exportando consolidado:", e);
      setErrorMsg(e?.message || "No se pudo generar el archivo Excel.");
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleConfirmCloseBatch = async () => {
    if (selectedLiquidations.length === 0) return;
    setClosing(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await closeConsolidationBatchAction({
        anio: targetAnio,
        mes: targetMes,
        descripcion: batchDescripcion.trim() || `${MONTHS[targetMes - 1]} ${targetAnio}`,
        observaciones: batchObservaciones.trim() || undefined,
        liquidationIds: selectedLiquidations.map((l) => l.id),
      });
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setIsCloseModalOpen(false);
        setBatchObservaciones("");
        setSuccessMsg(
          `Lote "${batchDescripcion.trim() || `${MONTHS[targetMes - 1]} ${targetAnio}`}" cerrado con éxito (${res.closedCount} liquidación/es pasadas a estado CERRADA).`
        );
        const refreshed = await fetchConsolidationWorkspaceAction();
        if (refreshed.data) {
          setWorkspace(refreshed.data);
          setSelectedIds(refreshed.data.pendingLiquidations.map((l) => l.id));
          setSelectedHistoryYear(targetAnio);
          setActiveTab("HISTORIAL");
          if (res.consolidacionId) setExpandedBatchId(res.consolidacionId);
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Error al cerrar el lote de consolidación.");
    } finally {
      setClosing(false);
    }
  };

  // Historial filtrado por año
  const historyBatchesForYear = useMemo(
    () => workspace.closedBatches.filter((b) => b.anio === selectedHistoryYear),
    [workspace.closedBatches, selectedHistoryYear]
  );

  const annualTotals = useMemo(() => {
    return historyBatchesForYear.reduce(
      (acc, b) => ({
        liqs: acc.liqs + b.liquidacionesCount,
        sueldos: round2(acc.sueldos + b.totalSueldos),
        gastos: round2(acc.gastos + b.totalGastosDisponible),
        ga: round2(acc.ga + b.totalGa),
        neto: round2(acc.neto + b.totalNeto),
      }),
      { liqs: 0, sueldos: 0, gastos: 0, ga: 0, neto: 0 }
    );
  }, [historyBatchesForYear]);

  return (
    <div className="space-y-5">
      {/* Alerts */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/25 p-3.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="break-words">{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="font-medium break-words">{successMsg}</p>
        </div>
      )}

      {/* Top Navigation Tabs + Pipeline Status Pill */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab("BANDEJA")}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer",
              activeTab === "BANDEJA"
                ? "bg-card text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Inbox className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Bandeja en Curso</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-3xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {workspace.pendingLiquidations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("HISTORIAL")}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer",
              activeTab === "HISTORIAL"
                ? "bg-card text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Archive className="h-4 w-4 text-blue-500 shrink-0" />
            <span>Historial y Anual</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/15 px-1.5 text-3xs font-extrabold text-blue-600 dark:text-blue-400">
              {workspace.closedBatches.length}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {workspace.inProgressCounts.total > 0 && (
            <div
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-3xs text-muted-foreground"
              title="Liquidaciones aún no distribuidas por los hospitales: aparecerán automáticamente en la bandeja cuando pasen a estado DISTRIBUIDA"
            >
              <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>
                En curso (próximo lote):{" "}
                <strong className="text-foreground">{workspace.inProgressCounts.total}</strong>{" "}
                <span className="hidden sm:inline">
                  ({workspace.inProgressCounts.pendiente} pend. · {workspace.inProgressCounts.notificado} notif. · {workspace.inProgressCounts.enProceso} en proc.)
                </span>
              </span>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8.5 text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PESTAÑA 1: BANDEJA EN CURSO (DISTRIBUIDAS SIN CONSOLIDAR)              */}
      {/* ===================================================================== */}
      {activeTab === "BANDEJA" && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider block">
                  Seleccionadas en Lote
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">
                    {selectedLiquidations.length}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    de {workspace.pendingLiquidations.length} distribuida(s)
                  </span>
                </div>
                <p className="text-3xs text-muted-foreground">
                  Neto a Distribuir: <strong className="text-foreground">{formatCurrency(draftBatch.totalNeto)}</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="text-3xs uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider block">
                  Total Sueldos (SISPER)
                </span>
                <div className="text-2xl font-extrabold font-mono text-blue-600 dark:text-blue-400 truncate">
                  {formatCurrency(draftBatch.totalSueldos)}
                </div>
                <p className="text-3xs text-muted-foreground truncate">
                  Hon: {formatCurrency(draftBatch.totalHonorarios)} · Sob: {formatCurrency(draftBatch.totalSobreasignaciones)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="text-3xs uppercase font-bold text-teal-600 dark:text-teal-400 tracking-wider block">
                  Gastos Disponible (Tesorería)
                </span>
                <div className="text-2xl font-extrabold font-mono text-teal-600 dark:text-teal-400 truncate">
                  {formatCurrency(draftBatch.totalGastosDisponible)}
                </div>
                <p className="text-3xs text-muted-foreground truncate">
                  Gasto Admin. (G.A.): <strong className="text-foreground">{formatCurrency(draftBatch.totalGa)}</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1.5">
                <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1">
                  <Landmark className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  Sueldos por Cta. Cte. TGP
                </span>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Cta. 131441002:</span>
                    <strong className="text-foreground">{formatCurrency(draftBatch.cta131441002Sueldos)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400">Cta. 131441004 (RGA):</span>
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(draftBatch.cta131441004Sueldos)}
                    </strong>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Grid: Bandeja Table (2/3) + Export & Close Panel (1/3) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {/* Bandeja Table */}
            <Card className="xl:col-span-2 border-border bg-card overflow-hidden">
              <CardHeader className="p-4 pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-500" />
                    Liquidaciones Distribuidas Pendientes de Consolidar
                  </CardTitle>
                  <CardDescription className="text-2xs text-muted-foreground mt-0.5">
                    Incluye automáticamente liquidaciones del mes y rezagadas que completaron su distribución. Destilde cualquiera que desee dejar para el próximo cierre.
                  </CardDescription>
                </div>

                {workspace.pendingLiquidations.length > 0 && (
                  <SearchBar
                    placeholder="Buscar OS, Liq. N°, Expte o Cta..."
                    value={searchQuery}
                    onChange={setSearchQuery}
                    size="sm"
                    className="w-full sm:w-60 shrink-0"
                  />
                )}
              </CardHeader>

              <CardContent className="p-0">
                {workspace.pendingLiquidations.length === 0 ? (
                  <div className="p-8 sm:p-10 text-center space-y-2.5 max-w-md mx-auto">
                    <div className="mx-auto h-11 w-11 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      No hay liquidaciones pendientes de consolidar
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Cuando los hospitales finalicen la distribución de sus liquidaciones y pasen a estado{" "}
                      <strong>DISTRIBUIDA</strong>, aparecerán automáticamente en esta bandeja listas para consolidar y enviar a TGP / SISPER.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent border-border">
                          <TableHead className="w-10 text-center py-2.5">
                            <button
                              type="button"
                              onClick={toggleSelectAllVisible}
                              title={allVisibleSelected ? "Deseleccionar visibles" : "Seleccionar visibles"}
                              className={cn(
                                "inline-flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors cursor-pointer",
                                allVisibleSelected
                                  ? "bg-emerald-600 border-emerald-600 text-zinc-950"
                                  : "border-muted-foreground/40 bg-background"
                              )}
                            >
                              {allVisibleSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </button>
                          </TableHead>
                          <TableHead className="text-3xs font-bold uppercase">Liquidación / O.S.</TableHead>
                          <TableHead className="text-3xs font-bold uppercase">Convenio / Cta.</TableHead>
                          <TableHead className="text-3xs font-bold uppercase">Expte / Norma</TableHead>
                          <TableHead className="text-3xs font-bold uppercase text-right">Sueldos</TableHead>
                          <TableHead className="text-3xs font-bold uppercase text-right">Gastos Disp.</TableHead>
                          <TableHead className="text-3xs font-bold uppercase text-right">Neto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPending.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                              No se encontraron liquidaciones que coincidan con &ldquo;{searchQuery}&rdquo;.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredPending.map((liq) => {
                            const isChecked = selectedSet.has(liq.id);
                            return (
                              <TableRow
                                key={liq.id}
                                className={cn(
                                  "border-border text-xs transition-colors",
                                  isChecked ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "opacity-60 hover:bg-muted/30"
                                )}
                              >
                                <TableCell className="text-center py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleSelectOne(liq.id)}
                                    className={cn(
                                      "inline-flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors cursor-pointer",
                                      isChecked
                                        ? "bg-emerald-600 border-emerald-600 text-zinc-950"
                                        : "border-muted-foreground/40 bg-background"
                                    )}
                                  >
                                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                  </button>
                                </TableCell>

                                <TableCell className="py-2.5 max-w-[230px]">
                                  <div className="flex items-center gap-1.5">
                                    <Link
                                      href={`/dashboard/liquidations/${liq.id}`}
                                      className="font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                                    >
                                      {liq.code}
                                      <ExternalLink className="h-3 w-3 shrink-0" />
                                    </Link>
                                    <span className="text-3xs text-muted-foreground font-mono">
                                      ({liq.mesCarga})
                                    </span>
                                  </div>
                                  <p className="font-semibold text-foreground truncate" title={liq.clienteNombre}>
                                    {liq.clienteSigla}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {liq.hospitals.length} efector(es) · {liq.agentRows.length} reg. SISPER
                                  </p>
                                </TableCell>

                                <TableCell className="py-2.5 whitespace-nowrap">
                                  <span
                                    className={cn(
                                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold border",
                                      getConvenioBadgeClass(liq.convenio)
                                    )}
                                  >
                                    {liq.convenio}
                                  </span>
                                  <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                                    Cta. {liq.ctaCteTgp}
                                  </span>
                                </TableCell>

                                <TableCell className="py-2.5 whitespace-nowrap">
                                  <div className="space-y-0.5">
                                    {liq.expediente ? (
                                      <span className="font-mono text-3xs font-semibold text-foreground block">
                                        {liq.expediente}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        Sin Expte.
                                      </span>
                                    )}
                                    {liq.normaLegal ? (
                                      <span className="font-mono text-[10px] text-muted-foreground block">
                                        {liq.normaLegal}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                                        Sin Norma Legal
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell className="text-right font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap py-2.5">
                                  {formatCurrency(liq.totalSueldos)}
                                </TableCell>

                                <TableCell className="text-right font-mono font-semibold text-teal-600 dark:text-teal-400 whitespace-nowrap py-2.5">
                                  {formatCurrency(liq.totalGastosDisponible)}
                                </TableCell>

                                <TableCell className="text-right font-mono font-bold text-foreground whitespace-nowrap py-2.5">
                                  {formatCurrency(liq.netoAPagar)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right Panel: Batch Config, Exports & Atomic Close */}
            <Card className="border-border bg-card">
              <CardHeader className="p-4 pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-foreground">
                  Lote de Consolidación y Reportes
                </CardTitle>
                <CardDescription className="text-2xs text-muted-foreground mt-0.5">
                  Configure el mes de imputación SISPER/TGP, descargue reportes en borrador y confirme el cierre.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Target Month / Year / Description */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-3xs uppercase font-bold text-muted-foreground">
                      Mes Sueldo SISPER
                    </Label>
                    <select
                      value={targetMes}
                      onChange={(e) => handleMonthOrYearChange(Number(e.target.value), targetAnio)}
                      className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground cursor-pointer"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-3xs uppercase font-bold text-muted-foreground">
                      Año
                    </Label>
                    <Input
                      type="number"
                      min={2020}
                      max={2100}
                      value={targetAnio}
                      onChange={(e) =>
                        handleMonthOrYearChange(targetMes, parseInt(e.target.value, 10) || defaultYear)
                      }
                      className="h-9 text-xs font-mono font-bold bg-background"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-3xs uppercase font-bold text-muted-foreground">
                      Nombre del Lote
                    </Label>
                    <Input
                      type="text"
                      value={batchDescripcion}
                      onChange={(e) => setBatchDescripcion(e.target.value)}
                      placeholder="Ej. Noviembre 2026 (o Complementaria)"
                      className="h-9 text-xs font-semibold bg-background"
                    />
                  </div>
                </div>

                {/* Warnings if missing expediente / norma */}
                {(missingExpedienteCount > 0 || missingNormaCount > 0) && selectedLiquidations.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-3xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <strong>Control previo:</strong>{" "}
                      {missingExpedienteCount > 0 && `${missingExpedienteCount} sin N° Expediente`}
                      {missingExpedienteCount > 0 && missingNormaCount > 0 && " · "}
                      {missingNormaCount > 0 && `${missingNormaCount} sin Norma Legal`}. Puede igualmente descargar borradores o completarlos antes de cerrar.
                    </div>
                  </div>
                )}

                {/* Export Buttons (Available for Admin, Liquidador AND Auditor / Contable) */}
                <div className="space-y-2 pt-1">
                  <Button
                    type="button"
                    disabled={selectedLiquidations.length === 0 || downloadingKey !== null}
                    onClick={() =>
                      runDownload("draft-tgp", () =>
                        downloadConsolidatedTgpWorkbook(draftBatch, workspace.closedBatches)
                      )
                    }
                    className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs gap-2 cursor-pointer shadow-xs"
                  >
                    {downloadingKey === "draft-tgp" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" />
                    )}
                    <span>Descargar Consolidado TGP (6 Hojas)</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectedLiquidations.length === 0 || downloadingKey !== null}
                    onClick={() =>
                      runDownload("draft-sisper", () =>
                        downloadConsolidatedSisperWorkbook(draftBatch)
                      )
                    }
                    className="w-full h-9.5 border-blue-500/35 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 font-bold text-xs gap-2 cursor-pointer"
                  >
                    {downloadingKey === "draft-sisper" ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>Descargar Planilla SISPER Unificada</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectedLiquidations.length === 0 || downloadingKey !== null}
                    onClick={() =>
                      runDownload("draft-tesoreria", () =>
                        downloadConsolidatedTesoreriaWorkbook(draftBatch)
                      )
                    }
                    className="w-full h-9.5 border-teal-500/35 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 font-bold text-xs gap-2 cursor-pointer"
                  >
                    {downloadingKey === "draft-tesoreria" ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Landmark className="h-3.5 w-3.5" />
                    )}
                    <span>Descargar Reporte Tesorería (Gastos)</span>
                  </Button>
                </div>

                {/* Close Batch Section */}
                <div className="border-t border-border pt-3.5">
                  {canClosePeriod ? (
                    <Button
                      type="button"
                      disabled={selectedLiquidations.length === 0 || closing}
                      onClick={() => setIsCloseModalOpen(true)}
                      className="w-full h-10 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs gap-2 cursor-pointer"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      <span>
                        Cerrar Lote ({selectedLiquidations.length} liq.)
                      </span>
                    </Button>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/25 p-3 text-3xs text-blue-700 dark:text-blue-300 leading-relaxed">
                      <Lock className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                      <span>
                        <strong>Perfil Auditor / Contable:</strong> puede generar y descargar los reportes consolidados en todo momento. El cierre definitivo del lote corresponde a Administración / Liquidación.
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 2: HISTORIAL MENSUAL CERRADO + ACUMULADO ANUAL                */}
      {/* ===================================================================== */}
      {activeTab === "HISTORIAL" && (
        <div className="space-y-5">
          {/* Annual Header Bar */}
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-500" />
                  <Label className="text-xs font-bold text-foreground">Año Fiscal:</Label>
                  <select
                    value={selectedHistoryYear}
                    onChange={(e) => setSelectedHistoryYear(Number(e.target.value))}
                    className="h-9 rounded-md border border-border bg-background px-3 text-xs font-bold font-mono text-foreground cursor-pointer"
                  >
                    {workspace.availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-l border-border pl-3">
                  <span>
                    Lotes: <strong className="text-foreground">{historyBatchesForYear.length}</strong>
                  </span>
                  <span>
                    Liquidaciones: <strong className="text-foreground">{annualTotals.liqs}</strong>
                  </span>
                  <span>
                    Sueldos: <strong className="text-blue-600 dark:text-blue-400 font-mono">{formatCurrency(annualTotals.sueldos)}</strong>
                  </span>
                  <span>
                    Gastos: <strong className="text-teal-600 dark:text-teal-400 font-mono">{formatCurrency(annualTotals.gastos)}</strong>
                  </span>
                  <span>
                    G.A.: <strong className="text-foreground font-mono">{formatCurrency(annualTotals.ga)}</strong>
                  </span>
                </div>
              </div>

              <Button
                type="button"
                disabled={historyBatchesForYear.length === 0 || downloadingKey !== null}
                onClick={() =>
                  runDownload(`annual-${selectedHistoryYear}`, () =>
                    downloadAnnualTgpWorkbook(historyBatchesForYear, selectedHistoryYear)
                  )
                }
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs h-9.5 px-4 gap-2 cursor-pointer shrink-0"
              >
                {downloadingKey === `annual-${selectedHistoryYear}` ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>Descargar Acumulado Anual {selectedHistoryYear}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Closed Batches List */}
          {historyBatchesForYear.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="p-10 text-center space-y-2 max-w-md mx-auto">
                <Archive className="h-8 w-8 text-muted-foreground mx-auto opacity-60" />
                <h3 className="text-sm font-bold text-foreground">
                  Sin consolidados cerrados en {selectedHistoryYear}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Al cerrar un lote desde la pestaña <strong>Bandeja en Curso</strong>, quedará archivado aquí de forma inmutable para auditoría y re-descarga histórica.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyBatchesForYear.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                return (
                  <Card key={batch.id} className="border-border bg-card overflow-hidden">
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-3xs font-extrabold text-emerald-700 dark:text-emerald-400">
                            <Lock className="h-3 w-3" />
                            LOTE #{batch.id}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-foreground">
                            {batch.descripcion}
                          </h3>
                          <span className="rounded bg-muted px-2 py-0.5 text-3xs font-mono font-semibold text-muted-foreground border border-border">
                            {MONTHS[batch.mes - 1]} {batch.anio}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Cerrado: <strong className="text-foreground">{formatDateTime(batch.cerradaAt)}</strong>
                          </span>
                          {batch.cerradaPorNombre && (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Por: <strong className="text-foreground">{batch.cerradaPorNombre}</strong>
                            </span>
                          )}
                          <span>
                            <strong>{batch.liquidacionesCount}</strong> liquidación(es)
                          </span>
                        </div>

                        {batch.observaciones && (
                          <p className="text-xs text-muted-foreground italic break-words">
                            &ldquo;{batch.observaciones}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-3 text-right shrink-0 border-y lg:border-y-0 lg:border-x border-border py-2 lg:py-0 lg:px-4">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Sueldos
                          </span>
                          <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                            {formatCurrency(batch.totalSueldos)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            Gastos Disp.
                          </span>
                          <span className="text-xs font-mono font-bold text-teal-600 dark:text-teal-400">
                            {formatCurrency(batch.totalGastosDisponible)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                            G.A.
                          </span>
                          <span className="text-xs font-mono font-bold text-foreground">
                            {formatCurrency(batch.totalGa)}
                          </span>
                        </div>
                      </div>

                      {/* Download & Expand actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          disabled={downloadingKey !== null}
                          onClick={() =>
                            runDownload(`tgp-${batch.id}`, () =>
                              downloadConsolidatedTgpWorkbook(batch, workspace.closedBatches)
                            )
                          }
                          className="h-8 px-2.5 text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 gap-1 cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          <span>TGP (6 Hojas)</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={downloadingKey !== null}
                          onClick={() =>
                            runDownload(`sisper-${batch.id}`, () =>
                              downloadConsolidatedSisperWorkbook(batch)
                            )
                          }
                          className="h-8 px-2.5 text-3xs font-bold border-blue-500/35 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 gap-1 cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          <span>SISPER</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={downloadingKey !== null}
                          onClick={() =>
                            runDownload(`tes-${batch.id}`, () =>
                              downloadConsolidatedTesoreriaWorkbook(batch)
                            )
                          }
                          className="h-8 px-2.5 text-3xs font-bold border-teal-500/35 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 gap-1 cursor-pointer"
                        >
                          <Landmark className="h-3 w-3" />
                          <span>Tesorería</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpandedBatchId(isExpanded ? null : batch.id)
                          }
                          className="h-8 px-2 text-3xs font-semibold text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                        >
                          <span>Detalle</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border bg-muted/15 overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-muted/40">
                            <TableRow className="hover:bg-transparent border-border">
                              <TableHead className="text-3xs font-bold uppercase py-2">Liquidación</TableHead>
                              <TableHead className="text-3xs font-bold uppercase">Obra Social</TableHead>
                              <TableHead className="text-3xs font-bold uppercase">Convenio / Cta.</TableHead>
                              <TableHead className="text-3xs font-bold uppercase">Expte / Norma</TableHead>
                              <TableHead className="text-3xs font-bold uppercase text-right">Sueldos</TableHead>
                              <TableHead className="text-3xs font-bold uppercase text-right">Gastos Disp.</TableHead>
                              <TableHead className="text-3xs font-bold uppercase text-right">G.A.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {batch.liquidaciones.map((liq) => (
                              <TableRow key={liq.id} className="border-border/70 text-xs">
                                <TableCell className="py-2 font-mono font-bold">
                                  <Link
                                    href={`/dashboard/liquidations/${liq.id}`}
                                    className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    {liq.code}
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </TableCell>
                                <TableCell className="py-2 font-semibold">{liq.clienteSigla}</TableCell>
                                <TableCell className="py-2 whitespace-nowrap">
                                  <span className="font-semibold">{liq.convenio}</span>{" "}
                                  <span className="font-mono text-3xs text-muted-foreground">({liq.ctaCteTgp})</span>
                                </TableCell>
                                <TableCell className="py-2 font-mono text-3xs whitespace-nowrap">
                                  {liq.expediente || "-"} {liq.normaLegal ? `· ${liq.normaLegal}` : ""}
                                </TableCell>
                                <TableCell className="py-2 text-right font-mono text-blue-600 dark:text-blue-400">
                                  {formatCurrency(liq.totalSueldos)}
                                </TableCell>
                                <TableCell className="py-2 text-right font-mono text-teal-600 dark:text-teal-400">
                                  {formatCurrency(liq.totalGastosDisponible)}
                                </TableCell>
                                <TableCell className="py-2 text-right font-mono">
                                  {formatCurrency(liq.ga)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Closing Batch */}
      <Dialog open={isCloseModalOpen} onOpenChange={setIsCloseModalOpen}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-lg bg-card border-border text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              Confirmar Cierre de Lote de Consolidación
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Esta acción creará el lote inmutable{" "}
              <strong className="text-foreground">
                &ldquo;{batchDescripcion.trim() || `${MONTHS[targetMes - 1]} ${targetAnio}`}&rdquo;
              </strong>{" "}
              y pasará las <strong className="text-foreground">{selectedLiquidations.length}</strong>{" "}
              liquidación(es) seleccionadas a estado <strong>CERRADA</strong> para garantizar que no vuelvan a incluirse en meses posteriores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Período Sueldo SISPER:</span>
                <strong className="text-foreground">
                  {MONTHS[targetMes - 1]} {targetAnio}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Sueldos (Hon. + Sob.):</span>
                <strong className="font-mono text-blue-600 dark:text-blue-400">
                  {formatCurrency(draftBatch.totalSueldos)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Gastos Disponible (Tesorería):</span>
                <strong className="font-mono text-teal-600 dark:text-teal-400">
                  {formatCurrency(draftBatch.totalGastosDisponible)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Gasto Administrativo (G.A.):</span>
                <strong className="font-mono text-foreground">{formatCurrency(draftBatch.totalGa)}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                Observaciones del cierre (opcional)
              </Label>
              <textarea
                value={batchObservaciones}
                onChange={(e) => setBatchObservaciones(e.target.value)}
                rows={2}
                placeholder="Ej. Envío a TGP y SISPER correspondiente al corte mensual..."
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={closing}
              onClick={() => setIsCloseModalOpen(false)}
              className="text-xs cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={closing}
              onClick={handleConfirmCloseBatch}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs gap-1.5 cursor-pointer"
            >
              {closing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Cerrando Lote...
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Confirmar y Cerrar Lote
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
