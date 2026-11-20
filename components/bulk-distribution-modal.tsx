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
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardPaste,
  Columns3,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  RefreshCw,
  Table2,
  Trash2,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import {
  combinePastedColumns,
  downloadBulkDistributionTemplate,
  parseBulkDistributionMatrix,
  parseClipboardTextToMatrix,
  parseExcelBufferToMatrix,
  type BulkParseResult,
  type ParsedBulkRow,
} from "@/lib/bulk-distribution-parser";
import {
  resolveBulkAgentsByIdentifiersAction,
  type BulkIdentifierResolution,
  type ResolvedBulkAgent,
} from "@/app/dashboard/liquidations/actions";

export interface BulkAppliedAgentRow {
  agentId: string;
  cuil: string;
  legajo: string;
  nombre: string;
  cargo: string;
  hospitalNombre: string;
  honorarios: number;
  sobreasignaciones: number;
}

export type BulkImportMergeMode = "MERGE" | "REPLACE";

interface BulkDistributionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  netoLimit: number;
  existingTotalAssigned: number;
  existingAgentsCount: number;
  preferredEmpresaId?: number;
  onApply: (rows: BulkAppliedAgentRow[], mode: BulkImportMergeMode) => void;
}

interface PreviewErrorItem {
  key: string;
  rowNumber: number;
  rawDoc: string;
  normalizedDoc: string;
  honorarios: number;
  sobreasignaciones: number;
  reason: string;
}

interface PreviewAmbiguousItem {
  normalizedDoc: string;
  rawDoc: string;
  sourceRowNumbers: number[];
  honorarios: number;
  sobreasignaciones: number;
  candidates: ResolvedBulkAgent[];
}

interface PreviewValidAgentItem {
  agent: ResolvedBulkAgent;
  sourceRowNumbers: number[];
  honorarios: number;
  sobreasignaciones: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

export function BulkDistributionModal({
  open,
  onOpenChange,
  netoLimit,
  existingTotalAssigned,
  existingAgentsCount,
  preferredEmpresaId,
  onApply,
}: BulkDistributionModalProps) {
  const [step, setStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [inputTab, setInputTab] = useState<"PASTE" | "EXCEL">("PASTE");
  const [pasteMode, setPasteMode] = useState<"TABLE" | "COLUMNS">("TABLE");

  // Paste inputs
  const [tablePasteText, setTablePasteText] = useState("");
  const [col1Text, setCol1Text] = useState("");
  const [col2Text, setCol2Text] = useState("");
  const [col3Text, setCol3Text] = useState("");

  // Excel upload state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedSheetName, setUploadedSheetName] = useState<string | null>(null);
  const [uploadedMatrix, setUploadedMatrix] = useState<string[][]>([]);
  const [excelReadError, setExcelReadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Swap option when headerless 2 numeric columns
  const [swapTwoColumns, setSwapTwoColumns] = useState(false);

  // Validation & resolution state
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [resolutionMap, setResolutionMap] = useState<Record<string, BulkIdentifierResolution>>({});
  const [ambiguousChoices, setAmbiguousChoices] = useState<Record<string, string>>({});
  const [mergeMode, setMergeMode] = useState<BulkImportMergeMode>("MERGE");
  const [previewFilter, setPreviewFilter] = useState<"ALL" | "VALID" | "AMBIGUOUS" | "ERROR">("ALL");

  const resetModalState = () => {
    setStep("INPUT");
    setValidationError(null);
    setResolutionMap({});
    setAmbiguousChoices({});
    setPreviewFilter("ALL");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetModalState();
    }
    onOpenChange(nextOpen);
  };

  // Matriz activa según pestaña y sub-modo
  const activeMatrix = useMemo<string[][]>(() => {
    if (inputTab === "EXCEL") {
      return uploadedMatrix;
    }
    if (pasteMode === "COLUMNS") {
      return combinePastedColumns(col1Text, col2Text, col3Text);
    }
    return parseClipboardTextToMatrix(tablePasteText);
  }, [inputTab, pasteMode, tablePasteText, col1Text, col2Text, col3Text, uploadedMatrix]);

  const parsedPreview: BulkParseResult = useMemo(() => {
    return parseBulkDistributionMatrix(activeMatrix, { swapTwoColumns });
  }, [activeMatrix, swapTwoColumns]);

  const handleProcessExcelFile = async (file: File) => {
    setExcelReadError(null);
    setValidationError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      setExcelReadError("Formato no soportado. Subí un archivo .xlsx, .xls o .csv.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const { sheetName, matrix } = parseExcelBufferToMatrix(buf);
      if (matrix.length === 0) {
        setExcelReadError("El archivo está vacío o no contiene filas legibles.");
        setUploadedMatrix([]);
        setUploadedFileName(null);
        setUploadedSheetName(null);
        return;
      }
      setUploadedFileName(file.name);
      setUploadedSheetName(sheetName);
      setUploadedMatrix(matrix);
    } catch (err: any) {
      console.error("Error reading excel file:", err);
      setExcelReadError(err?.message || "No se pudo leer el archivo Excel.");
      setUploadedMatrix([]);
      setUploadedFileName(null);
      setUploadedSheetName(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      await downloadBulkDistributionTemplate();
    } catch (err) {
      console.error("Error downloading template:", err);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleValidateWithServer = async () => {
    setValidationError(null);
    if (parsedPreview.rows.length === 0) {
      setValidationError("No hay filas para validar. Pegá los datos o subí una planilla Excel.");
      return;
    }

    const uniqueDocs = Array.from(
      new Set(
        parsedPreview.rows
          .filter((r) => !r.error && r.normalizedDoc)
          .map((r) => r.normalizedDoc)
      )
    );

    if (uniqueDocs.length === 0) {
      setResolutionMap({});
      setAmbiguousChoices({});
      setStep("PREVIEW");
      setPreviewFilter("ERROR");
      return;
    }

    setIsValidating(true);
    try {
      const res = await resolveBulkAgentsByIdentifiersAction(uniqueDocs, preferredEmpresaId);
      if (res.error || !res.resolved) {
        setValidationError(res.error || "No se pudo validar el padrón SISPER.");
        return;
      }
      setResolutionMap(res.resolved);
      setAmbiguousChoices({});
      setPreviewFilter("ALL");
      setStep("PREVIEW");
    } catch (err: any) {
      console.error("Bulk validation failed:", err);
      setValidationError(err?.message || "Error de conexión al validar el padrón SISPER.");
    } finally {
      setIsValidating(false);
    }
  };

  // Agrupación inteligente de resultados validados (suma honorarios + sobreasignación si un DNI aparece repetido)
  const validationSummary = useMemo(() => {
    const validByCuil = new Map<string, PreviewValidAgentItem>();
    const ambiguousByDoc = new Map<string, PreviewAmbiguousItem>();
    const errors: PreviewErrorItem[] = [];

    const addToValid = (agent: ResolvedBulkAgent, row: ParsedBulkRow) => {
      const key = agent.cuil || agent.id;
      const existing = validByCuil.get(key);
      if (existing) {
        existing.honorarios = round2(existing.honorarios + row.honorarios);
        existing.sobreasignaciones = round2(existing.sobreasignaciones + row.sobreasignaciones);
        existing.sourceRowNumbers.push(row.rowNumber);
      } else {
        validByCuil.set(key, {
          agent,
          sourceRowNumbers: [row.rowNumber],
          honorarios: round2(row.honorarios),
          sobreasignaciones: round2(row.sobreasignaciones),
        });
      }
    };

    for (const row of parsedPreview.rows) {
      if (row.error) {
        errors.push({
          key: `parse-${row.rowNumber}`,
          rowNumber: row.rowNumber,
          rawDoc: row.rawDoc,
          normalizedDoc: row.normalizedDoc,
          honorarios: row.honorarios,
          sobreasignaciones: row.sobreasignaciones,
          reason: row.error,
        });
        continue;
      }

      const resolution = resolutionMap[row.normalizedDoc];
      if (!resolution || resolution.status === "NOT_FOUND") {
        errors.push({
          key: `notfound-${row.rowNumber}`,
          rowNumber: row.rowNumber,
          rawDoc: row.rawDoc,
          normalizedDoc: row.normalizedDoc,
          honorarios: row.honorarios,
          sobreasignaciones: row.sobreasignaciones,
          reason: `DNI / CUIL "${row.rawDoc}" no encontrado en el padrón SISPER`,
        });
        continue;
      }

      if (resolution.status === "FOUND" && resolution.matches[0]) {
        addToValid(resolution.matches[0], row);
        continue;
      }

      if (resolution.status === "AMBIGUOUS") {
        const chosenCuil = ambiguousChoices[row.normalizedDoc];
        const chosenAgent = chosenCuil
          ? resolution.matches.find((m) => m.cuil === chosenCuil)
          : undefined;

        if (chosenAgent) {
          addToValid(chosenAgent, row);
        } else {
          const existingAmb = ambiguousByDoc.get(row.normalizedDoc);
          if (existingAmb) {
            existingAmb.honorarios = round2(existingAmb.honorarios + row.honorarios);
            existingAmb.sobreasignaciones = round2(
              existingAmb.sobreasignaciones + row.sobreasignaciones
            );
            existingAmb.sourceRowNumbers.push(row.rowNumber);
          } else {
            ambiguousByDoc.set(row.normalizedDoc, {
              normalizedDoc: row.normalizedDoc,
              rawDoc: row.rawDoc,
              sourceRowNumbers: [row.rowNumber],
              honorarios: round2(row.honorarios),
              sobreasignaciones: round2(row.sobreasignaciones),
              candidates: resolution.matches,
            });
          }
        }
      }
    }

    const validAgents = Array.from(validByCuil.values());
    const ambiguousItems = Array.from(ambiguousByDoc.values());

    const batchHonorarios = round2(validAgents.reduce((s, v) => s + v.honorarios, 0));
    const batchSobreasignacion = round2(validAgents.reduce((s, v) => s + v.sobreasignaciones, 0));
    const batchTotal = round2(batchHonorarios + batchSobreasignacion);
    const projectedTotal =
      mergeMode === "REPLACE" ? batchTotal : round2(existingTotalAssigned + batchTotal);
    const exceedsNeto = netoLimit > 0 && projectedTotal > round2(netoLimit + 0.01);

    return {
      validAgents,
      ambiguousItems,
      errors,
      batchHonorarios,
      batchSobreasignacion,
      batchTotal,
      projectedTotal,
      exceedsNeto,
    };
  }, [parsedPreview.rows, resolutionMap, ambiguousChoices, mergeMode, existingTotalAssigned, netoLimit]);

  const handleConfirmApply = () => {
    if (validationSummary.validAgents.length === 0) return;
    const rowsToApply: BulkAppliedAgentRow[] = validationSummary.validAgents.map((item) => ({
      agentId: item.agent.cuil || item.agent.idAgente || item.agent.id,
      cuil: item.agent.cuil,
      legajo: item.agent.legajo,
      nombre: item.agent.nombre,
      cargo: item.agent.cargo,
      hospitalNombre: item.agent.hospitalNombre,
      honorarios: item.honorarios,
      sobreasignaciones: item.sobreasignaciones,
    }));

    onApply(rowsToApply, existingAgentsCount > 0 ? mergeMode : "REPLACE");
    resetModalState();
    onOpenChange(false);
  };

  const hasAnyInput = activeMatrix.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-card text-card-foreground w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden shadow-2xl rounded-2xl">
        {/* HEADER */}
        <DialogHeader className="p-4 sm:p-5 pb-3.5 border-b border-border bg-muted/15 pr-10 text-left shrink-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-lg font-bold text-foreground break-words">
                Carga Masiva de Personal (Honorarios y Sobreasignación)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 break-words">
                {step === "INPUT"
                  ? "Pegá directamente desde Excel o subí una planilla .xlsx. Detecta automáticamente DNI/CUIL + Concepto + Importe o Honorarios y Sobreasignación en columnas."
                  : "Revisá el cruce automático con el padrón SISPER antes de volcar los datos a la liquidación."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* BODY */}
        {step === "INPUT" ? (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 min-h-0">
            {/* MAIN MODE TABS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-muted/50 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => {
                  setInputTab("PASTE");
                  setValidationError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  inputTab === "PASTE"
                    ? "bg-card text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ClipboardPaste className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Pegar desde Excel / Planilla</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputTab("EXCEL");
                  setValidationError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  inputTab === "EXCEL"
                    ? "bg-card text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UploadCloud className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Subir Plantilla Excel (.xlsx)</span>
              </button>
            </div>

            {inputTab === "PASTE" ? (
              <div className="space-y-3">
                {/* SUB-MODE SWITCHER */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="inline-flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setPasteMode("TABLE")}
                      className={cn(
                        "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                        pasteMode === "TABLE"
                          ? "bg-teal-600 text-zinc-950 shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Table2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Pegar tabla completa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasteMode("COLUMNS")}
                      className={cn(
                        "flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                        pasteMode === "COLUMNS"
                          ? "bg-teal-600 text-zinc-950 shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Columns3 className="h-3.5 w-3.5 shrink-0" />
                      <span>Pegar columna por columna</span>
                    </button>
                  </div>

                  {hasAnyInput && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTablePasteText("");
                        setCol1Text("");
                        setCol2Text("");
                        setCol3Text("");
                        setValidationError(null);
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-red-500 gap-1 self-end sm:self-auto cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Limpiar pegado
                    </Button>
                  )}
                </div>

                {pasteMode === "TABLE" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-xs font-semibold text-foreground">
                        Pegá las filas desde Excel (Ctrl+C → Ctrl+V)
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        Con o sin encabezados · Acepta <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">DNI | Concepto | Importe</code> o <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">DNI | Honorarios | Sobreasignación</code>
                      </span>
                    </div>
                    <textarea
                      value={tablePasteText}
                      onChange={(e) => {
                        setTablePasteText(e.target.value);
                        setValidationError(null);
                      }}
                      rows={9}
                      placeholder={
                        "Ejemplo Formato 1 (por concepto):\n31102338\tHonorarios\t150000,50\n31102338\tSobreasignación\t45000\n28456123\tSob\t80.000,00\n\nEjemplo Formato 2 (en columnas):\n31102338\t150000,50\t45000\n28456123\t0\t80000"
                      }
                      className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-y"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground break-words">
                      Copiá y pegá cada columna de tu planilla por separado respetando el mismo orden de filas:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1 min-w-0">
                        <label className="text-xs font-bold text-foreground flex items-center justify-between">
                          <span>1. DNI o CUIL</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {col1Text.split(/\r?\n/).filter((l) => l.trim()).length} filas
                          </span>
                        </label>
                        <textarea
                          value={col1Text}
                          onChange={(e) => {
                            setCol1Text(e.target.value);
                            setValidationError(null);
                          }}
                          rows={9}
                          placeholder={"31102338\n28456123\n20-30111222-4"}
                          className="w-full rounded-xl border border-border bg-background p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-y"
                        />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <label className="text-xs font-bold text-foreground flex items-center justify-between">
                          <span>2. Concepto o Honorarios</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {col2Text.split(/\r?\n/).filter((l) => l.trim()).length} filas
                          </span>
                        </label>
                        <textarea
                          value={col2Text}
                          onChange={(e) => {
                            setCol2Text(e.target.value);
                            setValidationError(null);
                          }}
                          rows={9}
                          placeholder={"Honorarios\nSobreasignación\n(o montos Honorarios)"}
                          className="w-full rounded-xl border border-border bg-background p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-y"
                        />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <label className="text-xs font-bold text-foreground flex items-center justify-between">
                          <span>3. Importe o Sobreasignación</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {col3Text.split(/\r?\n/).filter((l) => l.trim()).length} filas
                          </span>
                        </label>
                        <textarea
                          value={col3Text}
                          onChange={(e) => {
                            setCol3Text(e.target.value);
                            setValidationError(null);
                          }}
                          rows={9}
                          placeholder={"150.000,50\n45.000,00\n(o montos Sobreasig.)"}
                          className="w-full rounded-xl border border-border bg-background p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-y"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* EXCEL UPLOAD TAB */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-teal-500/25 bg-teal-500/5">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      Plantilla Oficial UEP (2 formatos incluidos)
                    </p>
                    <p className="text-[11px] text-muted-foreground break-words">
                      Incluye <strong>Hoja 1 (Por Concepto)</strong> con desplegable Honorarios/Sobreasignación y <strong>Hoja 2 (Por Columnas)</strong>. También podés subir tu propio Excel.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    disabled={downloadingTemplate}
                    className="w-full sm:w-auto h-9 px-3.5 text-xs font-bold border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 gap-1.5 shrink-0 cursor-pointer"
                  >
                    {downloadingTemplate ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Descargar Plantilla (.xlsx)
                  </Button>
                </div>

                {/* DROPZONE */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleProcessExcelFile(file);
                    e.target.value = "";
                  }}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessExcelFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-all cursor-pointer",
                    isDraggingFile
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-border hover:border-teal-500/50 hover:bg-muted/30"
                  )}
                >
                  <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                    <div className="h-11 w-11 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    {uploadedFileName ? (
                      <>
                        <p className="text-xs sm:text-sm font-bold text-foreground break-all">
                          {uploadedFileName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Hoja leída: <strong className="text-foreground">{uploadedSheetName}</strong> · Clic o arrastrá otro archivo para reemplazar
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs sm:text-sm font-semibold text-foreground">
                          Arrastrá tu archivo Excel acá o hacé clic para seleccionarlo
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Compatible con <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span> y <span className="font-mono">.csv</span>
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {excelReadError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="break-words">{excelReadError}</span>
                  </div>
                )}
              </div>
            )}

            {/* LIVE AUTO-DETECTION STATUS BAR */}
            {hasAnyInput && (
              <div
                className={cn(
                  "rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5",
                  parsedPreview.detectedFormat === "UNKNOWN"
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-emerald-500/25 bg-emerald-500/5"
                )}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {parsedPreview.detectedFormat === "UNKNOWN" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold text-foreground break-words">
                      {parsedPreview.columnSummary}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {parsedPreview.rows.length} fila(s) leída(s):{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {parsedPreview.validRowCount} listas para validar
                      </strong>
                      {parsedPreview.errorRowCount > 0 && (
                        <>
                          {" · "}
                          <strong className="text-red-600 dark:text-red-400">
                            {parsedPreview.errorRowCount} con observación de formato
                          </strong>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {parsedPreview.canToggleSwap && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSwapTwoColumns((prev) => !prev)}
                    className="h-8 px-2.5 text-[11px] font-semibold gap-1.5 shrink-0 cursor-pointer w-full sm:w-auto"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span>Invertir Honorarios ↔ Sobreasig.</span>
                  </Button>
                )}
              </div>
            )}

            {validationError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-words">{validationError}</span>
              </div>
            )}

            {/* QUICK HELP */}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0 break-words">
                <p>
                  <strong className="text-foreground">Tips:</strong> Podés pegar DNI con puntos (<code className="font-mono">31.102.338</code>) o CUIL con guiones (<code className="font-mono">20-31102338-7</code>), e importes con <code className="font-mono">$</code> o comas decimales. Si un mismo DNI figura en 2 filas (una de Honorarios y otra de Sobreasignación), se agrupan y suman automáticamente.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: VALIDATION PREVIEW */
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 min-h-0">
            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                  Agentes Válidos
                </span>
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  {validationSummary.validAgents.length}
                </p>
              </div>

              <div
                className={cn(
                  "rounded-xl border p-3 min-w-0",
                  validationSummary.ambiguousItems.length > 0
                    ? "border-amber-500/35 bg-amber-500/10"
                    : "border-border bg-muted/20"
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  DNI Ambiguos
                </span>
                <p
                  className={cn(
                    "text-lg font-extrabold font-mono mt-0.5",
                    validationSummary.ambiguousItems.length > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                >
                  {validationSummary.ambiguousItems.length}
                </p>
              </div>

              <div
                className={cn(
                  "rounded-xl border p-3 min-w-0",
                  validationSummary.errors.length > 0
                    ? "border-red-500/35 bg-red-500/10"
                    : "border-border bg-muted/20"
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Con Error / Sin Padrón
                </span>
                <p
                  className={cn(
                    "text-lg font-extrabold font-mono mt-0.5",
                    validationSummary.errors.length > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {validationSummary.errors.length}
                </p>
              </div>

              <div
                className={cn(
                  "rounded-xl border p-3 min-w-0",
                  validationSummary.exceedsNeto
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-teal-500/25 bg-teal-500/5"
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Total del Lote
                </span>
                <p
                  className={cn(
                    "text-sm sm:text-base font-extrabold font-mono mt-0.5 truncate",
                    validationSummary.exceedsNeto
                      ? "text-red-600 dark:text-red-400"
                      : "text-teal-700 dark:text-teal-400"
                  )}
                  title={formatCurrency(validationSummary.batchTotal)}
                >
                  {formatCurrency(validationSummary.batchTotal)}
                </p>
              </div>
            </div>

            {/* MERGE MODE + BUDGET WARNING */}
            <div className="space-y-2.5">
              {existingAgentsCount > 0 && (
                <div className="rounded-xl border border-border bg-muted/25 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs text-foreground min-w-0">
                    <span className="font-semibold">
                      Ya tenés {existingAgentsCount} agente(s) en la planilla:
                    </span>{" "}
                    <span className="text-muted-foreground">¿cómo aplicamos este lote?</span>
                  </div>
                  <div className="inline-flex items-center gap-1 bg-background p-1 rounded-lg border border-border shrink-0">
                    <button
                      type="button"
                      onClick={() => setMergeMode("MERGE")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                        mergeMode === "MERGE"
                          ? "bg-teal-600 text-zinc-950 shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Sumar / Actualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeMode("REPLACE")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                        mergeMode === "REPLACE"
                          ? "bg-amber-500 text-zinc-950 shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Reemplazar todo
                    </button>
                  </div>
                </div>
              )}

              {validationSummary.exceedsNeto && (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                  <div className="min-w-0 break-words">
                    <strong>Atención:</strong> El total proyectado ({formatCurrency(validationSummary.projectedTotal)}) supera el{" "}
                    <strong>Neto a Distribuir</strong> del establecimiento ({formatCurrency(netoLimit)}) por{" "}
                    <strong>{formatCurrency(validationSummary.projectedTotal - netoLimit)}</strong>. Podés aplicarlo igual y ajustar los importes en la planilla antes de guardar.
                  </div>
                </div>
              )}
            </div>

            {/* FILTER PILLS */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  {
                    id: "ALL",
                    label: `Todos (${
                      validationSummary.validAgents.length +
                      validationSummary.ambiguousItems.length +
                      validationSummary.errors.length
                    })`,
                  },
                  { id: "VALID", label: `Válidos (${validationSummary.validAgents.length})` },
                  ...(validationSummary.ambiguousItems.length > 0
                    ? [
                        {
                          id: "AMBIGUOUS" as const,
                          label: `Ambiguos (${validationSummary.ambiguousItems.length})`,
                        },
                      ]
                    : []),
                  ...(validationSummary.errors.length > 0
                    ? [{ id: "ERROR" as const, label: `Errores (${validationSummary.errors.length})` }]
                    : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPreviewFilter(tab.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                    previewFilter === tab.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* AMBIGUOUS RESOLVER SECTION */}
            {(previewFilter === "ALL" || previewFilter === "AMBIGUOUS") &&
              validationSummary.ambiguousItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    DNIs con más de un CUIL en padrón — seleccioná el agente correcto
                  </h4>
                  <div className="space-y-2">
                    {validationSummary.ambiguousItems.map((amb) => (
                      <div
                        key={amb.normalizedDoc}
                        className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-bold text-foreground font-mono">
                            DNI {amb.rawDoc}{" "}
                            <span className="font-sans font-normal text-muted-foreground">
                              (Fila{amb.sourceRowNumbers.length > 1 ? "s" : ""}{" "}
                              {amb.sourceRowNumbers.join(", ")})
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Hon: {formatCurrency(amb.honorarios)} · Sob:{" "}
                            {formatCurrency(amb.sobreasignaciones)}
                          </p>
                        </div>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setAmbiguousChoices((prev) => ({
                                ...prev,
                                [amb.normalizedDoc]: e.target.value,
                              }));
                            }
                          }}
                          className="w-full sm:w-72 h-9 rounded-lg border border-amber-500/40 bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        >
                          <option value="">-- Seleccionar agente --</option>
                          {amb.candidates.map((cand) => (
                            <option key={cand.cuil} value={cand.cuil}>
                              {cand.nombre} (CUIL {cand.cuil})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* ERRORS SECTION */}
            {(previewFilter === "ALL" || previewFilter === "ERROR") &&
              validationSummary.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Filas omitidas por error ({validationSummary.errors.length})
                  </h4>
                  <div className="rounded-xl border border-red-500/25 bg-red-500/5 divide-y divide-red-500/15 max-h-56 overflow-y-auto">
                    {validationSummary.errors.map((err) => (
                      <div
                        key={err.key}
                        className="p-2.5 sm:px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-red-700 dark:text-red-300 mr-2">
                            Fila {err.rowNumber}
                          </span>
                          {err.rawDoc && (
                            <span className="font-mono text-muted-foreground mr-2">
                              [{err.rawDoc}]
                            </span>
                          )}
                          <span className="text-red-600 dark:text-red-400 break-words">
                            {err.reason}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* VALID AGENTS LIST */}
            {(previewFilter === "ALL" || previewFilter === "VALID") && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Agentes listos para aplicar ({validationSummary.validAgents.length})
                </h4>

                {validationSummary.validAgents.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                    No se encontraron agentes válidos para importar. Revisá los errores o volvé atrás para corregir los datos.
                  </div>
                ) : (
                  <>
                    {/* MOBILE CARDS */}
                    <div className="block md:hidden space-y-2 max-h-72 overflow-y-auto pr-0.5">
                      {validationSummary.validAgents.map((item) => (
                        <div
                          key={item.agent.cuil}
                          className="rounded-xl border border-border bg-background p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground break-words">
                                {item.agent.nombre}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground">
                                CUIL: {item.agent.cuil}
                                {item.sourceRowNumbers.length > 1 && (
                                  <span className="ml-1.5 text-teal-600 dark:text-teal-400 font-sans">
                                    ({item.sourceRowNumbers.length} filas agrupadas)
                                  </span>
                                )}
                              </p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/60 text-xs font-mono">
                            <div>
                              <span className="text-[10px] font-sans text-muted-foreground block">
                                Honorarios
                              </span>
                              <span className="font-semibold text-foreground">
                                {formatCurrency(item.honorarios)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-sans text-muted-foreground block">
                                Sobreasignación
                              </span>
                              <span className="font-semibold text-foreground">
                                {formatCurrency(item.sobreasignaciones)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/60 sticky top-0 z-10 border-b border-border">
                            <tr>
                              <th className="text-left font-semibold py-2 px-3 text-muted-foreground uppercase text-[10px]">
                                Agente (Padrón SISPER)
                              </th>
                              <th className="text-left font-semibold py-2 px-3 text-muted-foreground uppercase text-[10px]">
                                CUIL
                              </th>
                              <th className="text-right font-semibold py-2 px-3 text-muted-foreground uppercase text-[10px]">
                                Honorarios
                              </th>
                              <th className="text-right font-semibold py-2 px-3 text-muted-foreground uppercase text-[10px]">
                                Sobreasignación
                              </th>
                              <th className="text-right font-semibold py-2 px-3 text-muted-foreground uppercase text-[10px]">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-background">
                            {validationSummary.validAgents.map((item) => (
                              <tr key={item.agent.cuil} className="hover:bg-muted/25">
                                <td className="py-2 px-3 font-medium text-foreground">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    <span>{item.agent.nombre}</span>
                                    {item.sourceRowNumbers.length > 1 && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                                        {item.sourceRowNumbers.length} filas sumadas
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                                  {item.agent.cuil}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  {formatCurrency(item.honorarios)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  {formatCurrency(item.sobreasignaciones)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                  {formatCurrency(item.honorarios + item.sobreasignaciones)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <DialogFooter className="mx-0 mb-0 p-3.5 sm:p-4 border-t border-border bg-muted/25 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
          {step === "INPUT" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="w-full sm:w-auto h-9 text-xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleValidateWithServer}
                disabled={isValidating || !hasAnyInput || parsedPreview.detectedFormat === "UNKNOWN"}
                className="w-full sm:w-auto h-9 px-4 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-zinc-950 gap-1.5 cursor-pointer"
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Validando contra Padrón SISPER...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Validar contra Padrón SISPER
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("INPUT")}
                className="w-full sm:w-auto h-9 text-xs gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver a editar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmApply}
                disabled={validationSummary.validAgents.length === 0}
                className="w-full sm:w-auto h-9 px-4 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-zinc-950 gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aplicar {validationSummary.validAgents.length} agente(s) a la planilla
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
