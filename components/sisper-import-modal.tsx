"use client";

import React, { useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { importAgentsFromExcel } from "@/app/dashboard/agents/actions";

export interface SisperImportModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  defaultPeriod?: string;
  onSuccess?: (period: string, count: number) => void;
}

export function SisperImportModal({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
  defaultPeriod,
  onSuccess,
}: SisperImportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = setControlledOpen || setInternalOpen;

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPeriod, setUploadPeriod] = useState(
    defaultPeriod ? defaultPeriod.substring(0, 7) : new Date().toISOString().substring(0, 7)
  );
  const [uploading, setUploading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmReplacePrompt, setConfirmReplacePrompt] = useState<{
    show: boolean;
    message: string;
    existingCount: number;
    period: string;
  } | null>(null);
  const [missingEmpresasPrompt, setMissingEmpresasPrompt] = useState<{
    show: boolean;
    list: { codigoSisper: number; descripcion: string; agentCount: number }[];
    totalMissingAgents: number;
    period: string;
  } | null>(null);
  const [confirmedCreateEmpresas, setConfirmedCreateEmpresas] = useState(false);

  const handleUploadExcel = async (
    e?: React.FormEvent,
    forceReplace: boolean = false,
    confirmCreateNew: boolean = false
  ) => {
    if (e) e.preventDefault();
    if (!uploadFile) {
      setFeedbackMsg({ type: "error", text: "Por favor seleccione un archivo Excel (.xlsx)." });
      return;
    }

    setUploading(true);
    setFeedbackMsg(null);
    if (!forceReplace) {
      setConfirmReplacePrompt(null);
    }
    if (confirmCreateNew) {
      setConfirmedCreateEmpresas(true);
      setMissingEmpresasPrompt(null);
    }

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("period", uploadPeriod);
    if (forceReplace) {
      formData.append("replaceExisting", "true");
    }
    if (confirmCreateNew || confirmedCreateEmpresas) {
      formData.append("createMissingEmpresas", "true");
    }

    try {
      const res = await importAgentsFromExcel(formData);
      if (res.error) {
        setFeedbackMsg({ type: "error", text: res.error });
        setConfirmReplacePrompt(null);
        setMissingEmpresasPrompt(null);
        return;
      }

      if (res.missingEmpresas) {
        setMissingEmpresasPrompt({
          show: true,
          list: res.missingList || [],
          totalMissingAgents: res.totalMissingAgents || 0,
          period: res.period || uploadPeriod,
        });
        return;
      }

      if (res.exists) {
        setConfirmReplacePrompt({
          show: true,
          message: res.message || `Ya existen ${res.existingCount} agentes para este período.`,
          existingCount: res.existingCount || 0,
          period: res.period || uploadPeriod,
        });
        return;
      }

      setConfirmReplacePrompt(null);
      setMissingEmpresasPrompt(null);
      setConfirmedCreateEmpresas(false);
      const countNum = res.count || 0;
      const formattedPeriod = res.period || uploadPeriod;
      setFeedbackMsg({
        type: "success",
        text: res.replaced
          ? `¡Nómina reemplazada con éxito! Se cargaron ${countNum.toLocaleString("es-AR")} agentes para el período ${formattedPeriod}.`
          : `¡Importación exitosa! Se procesaron ${countNum.toLocaleString("es-AR")} agentes para el período ${formattedPeriod}.`,
      });

      if (onSuccess) {
        onSuccess(uploadPeriod, countNum);
      }

      setTimeout(() => {
        setIsOpen(false);
        setUploadFile(null);
        setConfirmReplacePrompt(null);
        setMissingEmpresasPrompt(null);
        setConfirmedCreateEmpresas(false);
        setFeedbackMsg(null);
      }, 2000);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: "Error inesperado al importar el archivo Excel." });
      setConfirmReplacePrompt(null);
      setMissingEmpresasPrompt(null);
    } finally {
      setUploading(false);
    }
  };

  const handleModalClose = (open: boolean) => {
    setIsOpen(open);
    if (!open && !uploading) {
      setFeedbackMsg(null);
      setConfirmReplacePrompt(null);
      setMissingEmpresasPrompt(null);
      setConfirmedCreateEmpresas(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-emerald-500" />
            Importar Nómina de Agentes SISPER
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Suba el archivo Excel oficial exportado de SISPER / Arancelamiento (ej. <em>JUNIO ARAN 2026.xlsx</em>). El sistema matchea automáticamente cada agente con su Centro de Salud según el código del Lugar de Pago y extrae sus CUILs.
          </DialogDescription>
        </DialogHeader>

        {feedbackMsg && (
          <div
            className={cn(
              "p-3 rounded-lg border text-xs flex items-center gap-2",
              feedbackMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
            )}
          >
            {feedbackMsg.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {feedbackMsg.text}
          </div>
        )}

        {missingEmpresasPrompt ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 text-foreground space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400">
                    Centros de Salud no registrados en el sistema
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Se detectaron <strong className="text-foreground">{missingEmpresasPrompt.list.length}</strong> centro(s) de salud en la planilla que aún no están dados de alta en el sistema ({missingEmpresasPrompt.totalMissingAgents.toLocaleString("es-AR")} agentes asociados):
                  </p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 border border-border/70 rounded-lg p-2 bg-background/80">
                {missingEmpresasPrompt.list.map((item) => (
                  <div
                    key={item.codigoSisper}
                    className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/40 border border-border/50 gap-2"
                  >
                    <div className="flex items-center gap-2 overflow-hidden min-w-0">
                      <span className="font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-3xs shrink-0">
                        SISPER {item.codigoSisper}
                      </span>
                      <span className="truncate font-medium text-foreground text-3xs">
                        {item.descripcion}
                      </span>
                    </div>
                    <span className="text-3xs text-muted-foreground shrink-0 font-medium">
                      {item.agentCount} agente{item.agentCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground font-medium pt-1">
                ¿Desea dar de alta estos nuevos centros de salud automáticamente en el sistema y continuar con la importación?
              </p>
            </div>

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMissingEmpresasPrompt(null);
                  setConfirmedCreateEmpresas(false);
                }}
                disabled={uploading}
                className="border-border text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => handleUploadExcel(undefined, false, true)}
                disabled={uploading}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs h-9 cursor-pointer gap-2 shadow-sm"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Cargando Centros e Importando...
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4" />
                    Sí, cargar centros y continuar
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : confirmReplacePrompt ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 text-foreground space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400">
                    Nómina existente detectada
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {confirmReplacePrompt.message}
                  </p>
                </div>
              </div>
              <div className="bg-background/80 rounded-lg p-2.5 border border-border text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground text-3xs">
                  ⚠️ Al reemplazar la nómina:
                </p>
                <ul className="list-disc list-inside text-3xs space-y-0.5">
                  <li>
                    Se sobrescribirán los {confirmReplacePrompt.existingCount.toLocaleString("es-AR")} agentes del período {confirmReplacePrompt.period}.
                  </li>
                  <li>
                    Se insertarán todos los agentes y CUILs extraídos de la nueva planilla de forma atómica.
                  </li>
                </ul>
              </div>
            </div>

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmReplacePrompt(null)}
                disabled={uploading}
                className="border-border text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => handleUploadExcel(undefined, true)}
                disabled={uploading}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-9 cursor-pointer gap-2 shadow-sm"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Reemplazando Nómina...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Sí, reemplazar nómina existente
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => handleUploadExcel(e, false)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sisperUploadPeriod" className="text-xs font-semibold">
                Período (Mes / Año):
              </Label>
              <Input
                id="sisperUploadPeriod"
                type="month"
                value={uploadPeriod}
                onChange={(e) => setUploadPeriod(e.target.value)}
                required
                className="bg-muted/40 border-border text-foreground text-xs h-9 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sisperExcelFile" className="text-xs font-semibold">
                Archivo Excel (.xlsx, .xls, .csv):
              </Label>
              <Input
                id="sisperExcelFile"
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                required
                className="bg-muted/40 border-border text-foreground text-xs h-9 cursor-pointer file:cursor-pointer"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleModalClose(false)}
                disabled={uploading}
                className="border-border text-xs h-9 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={uploading || !uploadFile}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs h-9 cursor-pointer gap-2"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Procesando Excel...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Importar Agentes
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
