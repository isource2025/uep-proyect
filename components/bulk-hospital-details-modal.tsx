"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { cleanCuit } from "@/lib/hospital-mapping";
import {
  downloadHospitalDetailsTemplate,
  parseClipboardToMatrix,
  parseHospitalDetailsMatrix,
  parseSpreadsheetBufferToMatrix,
  type HospitalImportParseResult,
} from "@/lib/bulk-hospital-details-parser";
import type { ErpCircuitInfo, ProviderOption } from "@/lib/erp-circuit";

export interface ImportedHospitalDetailRow {
  hospitalId: number;
  prestadorNombre: string;
  cuit: string;
  localidad: string;
  periodo: string;
  fcHospital: string;
  totalFacturado: number;
  creditos: number;
  debitos: number;
  ajustesOs: number;
  pendientesCobro: number;
  pagosParcialesAnteriores: number;
  brutoAPagar: number;
  ga: number;
  gaPercent: number;
  ajusteRecupero: number;
  netoAPagar: number;
}

export type HospitalImportMergeMode = "APPEND" | "REPLACE";

interface BulkHospitalDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderOption[];
  defaultPeriodo: string;
  rcImporteTotal: number;
  existingDetailsCount: number;
  circuit: ErpCircuitInfo;
  onApply: (rows: ImportedHospitalDetailRow[], mode: HospitalImportMergeMode) => void;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

function formatCuitDisplay(cuit: string): string {
  const c = cleanCuit(cuit);
  if (c.length !== 11) return cuit || "-";
  return `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
}

export function BulkHospitalDetailsModal({
  open,
  onOpenChange,
  providers,
  defaultPeriodo,
  rcImporteTotal,
  existingDetailsCount,
  circuit,
  onApply,
}: BulkHospitalDetailsModalProps) {
  const [step, setStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [inputTab, setInputTab] = useState<"PASTE" | "EXCEL">("PASTE");
  const [pasteText, setPasteText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [defaultGaPct, setDefaultGaPct] = useState<string>("6");
  const [mergeMode, setMergeMode] = useState<HospitalImportMergeMode>(
    existingDetailsCount > 0 ? "APPEND" : "REPLACE"
  );
  const [parseResult, setParseResult] = useState<HospitalImportParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Índices estrictos sobre PROVEEDORES (por CUIT de 11 dígitos y por IDPROVEEDOR / Código iMedic)
  const { byCuit, byId } = useMemo(() => {
    const cuitMap = new Map<string, ProviderOption>();
    const idMap = new Map<number, ProviderOption>();
    for (const p of providers) {
      const c = cleanCuit(p.cuit);
      if (c.length === 11 && !cuitMap.has(c)) {
        cuitMap.set(c, p);
      }
      if (p.id > 0) {
        idMap.set(p.id, p);
      }
    }
    return { byCuit: cuitMap, byId: idMap };
  }, [providers]);

  const parsedGaNumber = useMemo(() => {
    const n = parseFloat(defaultGaPct);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 6;
  }, [defaultGaPct]);

  const resetModal = () => {
    setStep("INPUT");
    setPasteText("");
    setUploadedFileName(null);
    setParseResult(null);
    setErrorMsg(null);
    setMergeMode(existingDetailsCount > 0 ? "APPEND" : "REPLACE");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetModal();
    }
    onOpenChange(next);
  };

  const processMatrix = (matrix: unknown[][]) => {
    setErrorMsg(null);
    const res = parseHospitalDetailsMatrix(matrix, defaultPeriodo);
    if (res.rows.length === 0) {
      setErrorMsg("No se detectaron filas con datos para importar.");
      return;
    }
    setParseResult(res);
    setStep("PREVIEW");
  };

  const handleAnalyzePaste = () => {
    if (!pasteText.trim()) {
      setErrorMsg("Pegue primero las filas copiadas desde Excel o Google Sheets.");
      return;
    }
    const matrix = parseClipboardToMatrix(pasteText);
    processMatrix(matrix);
  };

  const handleFileProcess = async (file: File) => {
    setErrorMsg(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      setErrorMsg("Formato no compatible. Suba un archivo .xlsx, .xls o .csv.");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const matrix = parseSpreadsheetBufferToMatrix(buffer);
      setUploadedFileName(file.name);
      processMatrix(matrix);
    } catch (e: any) {
      setErrorMsg(e?.message || "Error al leer el archivo seleccionado.");
    }
  };

  const validation = useMemo(() => {
    if (!parseResult) {
      return {
        validRows: [] as Array<ImportedHospitalDetailRow & { rowNumber: number; matchedBy: string }>,
        errorRows: [] as Array<{ rowNumber: number; rawIdentifier: string; totalFacturado: number; reason: string }>,
      };
    }

    const validRows: Array<ImportedHospitalDetailRow & { rowNumber: number; matchedBy: string }> = [];
    const errorRows: Array<{ rowNumber: number; rawIdentifier: string; totalFacturado: number; reason: string }> = [];

    for (const row of parseResult.rows) {
      if (row.parseError) {
        errorRows.push({
          rowNumber: row.rowNumber,
          rawIdentifier: row.rawIdentifier || "(vacío)",
          totalFacturado: row.totalFacturado,
          reason: row.parseError,
        });
        continue;
      }

      let matched: ProviderOption | undefined;
      let matchedBy = "";

      if (row.normalizedCuit) {
        matched = byCuit.get(row.normalizedCuit);
        matchedBy = "CUIT";
      } else if (row.parsedCodigoImedic !== null) {
        matched = byId.get(row.parsedCodigoImedic);
        matchedBy = "Cód. iMedic";
      }

      if (!matched) {
        errorRows.push({
          rowNumber: row.rowNumber,
          rawIdentifier: row.rawIdentifier,
          totalFacturado: row.totalFacturado,
          reason: row.normalizedCuit
            ? `CUIT ${formatCuitDisplay(row.normalizedCuit)} no existe en PROVEEDORES (ERP).`
            : `Código iMedic #${row.parsedCodigoImedic} no encontrado en PROVEEDORES (ERP).`,
        });
        continue;
      }

      const matchedCuit = cleanCuit(matched.cuit);
      if (matchedCuit.length !== 11) {
        errorRows.push({
          rowNumber: row.rowNumber,
          rawIdentifier: row.rawIdentifier,
          totalFacturado: row.totalFacturado,
          reason: `El proveedor "${matched.nombre}" (#${matched.id}) no posee CUIT válido cargado en PROVEEDORES.`,
        });
        continue;
      }

      const gaPct = row.gaPercent !== null ? row.gaPercent : parsedGaNumber;
      const bruto = round2(
        row.totalFacturado +
          row.creditos -
          row.debitos +
          row.ajustesOs -
          row.pendientesCobro -
          row.pagosParcialesAnteriores
      );
      const ga = round2(Math.max(0, bruto) * (gaPct / 100));
      const neto = round2(Math.max(0, bruto - ga - row.ajusteRecupero));

      validRows.push({
        rowNumber: row.rowNumber,
        matchedBy,
        hospitalId: matched.id,
        prestadorNombre: matched.nombre || matched.descripcion || `Proveedor #${matched.id}`,
        cuit: matchedCuit,
        localidad: matched.localidad || "CAPITAL",
        periodo: row.periodo || defaultPeriodo,
        fcHospital: row.fcHospital || `${circuit.shortLabel.toUpperCase().replace(/\s+/g, "-")}-${row.rowNumber}`,
        totalFacturado: row.totalFacturado,
        creditos: row.creditos,
        debitos: row.debitos,
        ajustesOs: row.ajustesOs,
        pendientesCobro: row.pendientesCobro,
        pagosParcialesAnteriores: row.pagosParcialesAnteriores,
        brutoAPagar: bruto,
        ga,
        gaPercent: gaPct,
        ajusteRecupero: row.ajusteRecupero,
        netoAPagar: neto,
      });
    }

    return { validRows, errorRows };
  }, [parseResult, byCuit, byId, parsedGaNumber, defaultPeriodo, circuit.shortLabel]);

  const totals = useMemo(() => {
    return validation.validRows.reduce(
      (acc, r) => ({
        facturado: round2(acc.facturado + r.totalFacturado),
        bruto: round2(acc.bruto + r.brutoAPagar),
        ga: round2(acc.ga + r.ga),
        neto: round2(acc.neto + r.netoAPagar),
      }),
      { facturado: 0, bruto: 0, ga: 0, neto: 0 }
    );
  }, [validation.validRows]);

  const diffVsRc = round2(rcImporteTotal - totals.bruto);
  const isExactRcMatch = Math.abs(diffVsRc) < 1;

  const handleConfirmApply = () => {
    if (validation.validRows.length === 0) return;
    const cleanRows: ImportedHospitalDetailRow[] = validation.validRows.map(
      ({ rowNumber: _rn, matchedBy: _mb, ...rest }) => rest
    );
    onApply(cleanRows, mergeMode);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-[96vw] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto bg-card border-border text-card-foreground p-4 sm:p-6">
        <DialogHeader className="space-y-1.5 border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <span>Importar Renglones de Hospitales ({circuit.shortLabel})</span>
            </DialogTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => downloadHospitalDetailsTemplate(defaultPeriodo, circuit.shortLabel)}
              className="h-8 text-xs font-semibold gap-1.5 border-emerald-500/35 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Descargar Plantilla (.xlsx)</span>
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Pegue desde Excel o suba un archivo con el desglose por establecimiento. Cada fila se valida estrictamente contra{" "}
            <strong className="text-foreground">PROVEEDORES (ERP)</strong> mediante{" "}
            <strong className="text-foreground">CUIT</strong> o <strong className="text-foreground">Código iMedic</strong>.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/25 p-3 text-xs text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="break-words">{errorMsg}</p>
          </div>
        )}

        {step === "INPUT" ? (
          <div className="space-y-4">
            {/* Tabs & default GA% */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setInputTab("PASTE")}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    inputTab === "PASTE"
                      ? "bg-card text-foreground shadow-xs border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>Pegar desde Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab("EXCEL")}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    inputTab === "EXCEL"
                      ? "bg-card text-foreground shadow-xs border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Subir Archivo (.xlsx / .csv)</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Label htmlFor="bulk-ga-default" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  GA por defecto (%):
                </Label>
                <Input
                  id="bulk-ga-default"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={defaultGaPct}
                  onChange={(e) => setDefaultGaPct(e.target.value)}
                  className="w-20 h-8 text-xs text-right font-mono font-bold bg-background"
                />
              </div>
            </div>

            {inputTab === "PASTE" ? (
              <div className="space-y-2.5">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-3xs text-muted-foreground space-y-1">
                  <p className="font-bold text-foreground">Columnas aceptadas (con o sin fila de encabezados):</p>
                  <p className="font-mono break-words">
                    CUIT (o Cód. iMedic) | Total Facturado | Débitos | Créditos | Ajustes O.S. | Comprobante/Ref | Período
                  </p>
                  <p>
                    Solo las primeras 2 columnas son obligatorias. Si pega encabezados desde la plantilla oficial, el sistema detecta automáticamente todas las columnas.
                  </p>
                </div>

                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={
                    "33-62757551-9\t1500000,00\t25000,00\t0\t0\tCAPITA-01\n30-68795591-5\t845200,50\t0\t0\t-15000,00\tCAPITA-02"
                  }
                  className="w-full rounded-lg border border-border bg-background p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                />

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleAnalyzePaste}
                    disabled={!pasteText.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs h-9 px-4 gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Validar Hospitales contra ERP</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileProcess(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
                  isDragging
                    ? "border-emerald-500 bg-emerald-500/15"
                    : "border-emerald-500/35 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileProcess(f);
                    e.target.value = "";
                  }}
                />
                <UploadCloud className="h-9 w-9 text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-foreground">
                  Arrastrá tu archivo Excel (.xlsx, .xls, .csv) aquí o hacé clic para examinar
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Compatible con la plantilla oficial descargable y con exportaciones de PAMI / IOSCOR.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top summary & Live RC reconciliation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-3xs uppercase font-bold text-muted-foreground block">
                  Recibo Cobrado (RC)
                </span>
                <span className="text-sm font-extrabold font-mono text-foreground">
                  {formatCurrency(rcImporteTotal)}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-3xs uppercase font-bold text-muted-foreground block">
                  Bruto Válido a Importar
                </span>
                <span className="text-sm font-extrabold font-mono text-blue-600 dark:text-blue-400">
                  {formatCurrency(totals.bruto)}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-3xs uppercase font-bold text-muted-foreground block">
                  Neto a Distribuir (GA {parsedGaNumber}%)
                </span>
                <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totals.neto)}
                </span>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  isExactRcMatch
                    ? "border-emerald-500/35 bg-emerald-500/10"
                    : "border-amber-500/35 bg-amber-500/10"
                )}
              >
                <span className="text-3xs uppercase font-bold text-muted-foreground block">
                  Diferencia vs RC
                </span>
                <span
                  className={cn(
                    "text-sm font-extrabold font-mono",
                    isExactRcMatch
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  )}
                >
                  {isExactRcMatch ? "Cuadra exacto ($ 0,00)" : formatCurrency(diffVsRc)}
                </span>
              </div>
            </div>

            {uploadedFileName && (
              <p className="text-3xs text-muted-foreground">
                Archivo leído: <strong className="text-foreground">{uploadedFileName}</strong>
              </p>
            )}

            {/* Errors table if any */}
            {validation.errorRows.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {validation.errorRows.length} fila(s) rechazadas (no se importarán hasta corregir el CUIT/Código)
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-3xs">
                  {validation.errorRows.map((err, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-background/80 px-2.5 py-1.5 border border-red-500/20"
                    >
                      <span className="font-mono font-bold text-foreground">
                        Fila {err.rowNumber}: {err.rawIdentifier}
                      </span>
                      <span className="text-red-600 dark:text-red-400 break-words flex-1">
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Valid rows preview */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {validation.validRows.length} establecimiento(s) validados por PROVEEDORES (ERP)
                </span>

                {existingDetailsCount > 0 && (
                  <div className="flex items-center gap-2 text-3xs">
                    <span className="text-muted-foreground font-semibold">Modo:</span>
                    <select
                      value={mergeMode}
                      onChange={(e) => setMergeMode(e.target.value as HospitalImportMergeMode)}
                      className="h-7 rounded border border-border bg-background px-2 text-xs font-semibold text-foreground cursor-pointer"
                    >
                      <option value="APPEND">Agregar a los {existingDetailsCount} renglones actuales</option>
                      <option value="REPLACE">Reemplazar renglones actuales</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0 z-10 text-3xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-2 px-2.5">Prestador (PROVEEDORES)</th>
                      <th className="text-left py-2 px-2">CUIT</th>
                      <th className="text-left py-2 px-2">Ref / Comp.</th>
                      <th className="text-right py-2 px-2">Facturado</th>
                      <th className="text-right py-2 px-2">Déb/Créd/Aj.</th>
                      <th className="text-right py-2 px-2">Bruto</th>
                      <th className="text-right py-2 px-2">GA</th>
                      <th className="text-right py-2 px-2.5">Neto a Distribuir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {validation.validRows.map((row, idx) => {
                      const netAdjust = round2(
                        row.creditos - row.debitos + row.ajustesOs - row.pendientesCobro - row.pagosParcialesAnteriores
                      );
                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2 px-2.5 font-semibold text-foreground max-w-[240px] truncate" title={row.prestadorNombre}>
                            {row.prestadorNombre}
                            <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">
                              (#{row.hospitalId} · {row.matchedBy})
                            </span>
                          </td>
                          <td className="py-2 px-2 font-mono text-3xs whitespace-nowrap text-muted-foreground">
                            {formatCuitDisplay(row.cuit)}
                          </td>
                          <td className="py-2 px-2 font-mono text-3xs whitespace-nowrap">
                            {row.fcHospital}
                          </td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                            {formatCurrency(row.totalFacturado)}
                          </td>
                          <td
                            className={cn(
                              "py-2 px-2 text-right font-mono whitespace-nowrap",
                              netAdjust < 0
                                ? "text-red-600 dark:text-red-400"
                                : netAdjust > 0
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatCurrency(netAdjust)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-semibold whitespace-nowrap">
                            {formatCurrency(row.brutoAPagar)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            {formatCurrency(row.ga)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatCurrency(row.netoAPagar)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border pt-3 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {step === "PREVIEW" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("INPUT")}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Volver a editar origen</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-xs cursor-pointer"
            >
              Cancelar
            </Button>
            {step === "PREVIEW" && (
              <Button
                type="button"
                onClick={handleConfirmApply}
                disabled={validation.validRows.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Cargar {validation.validRows.length} renglón(es) en la Planilla</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
