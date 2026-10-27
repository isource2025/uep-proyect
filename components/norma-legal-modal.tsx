"use client";

import { useState, useEffect } from "react";
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
import { FileSpreadsheet, RefreshCw, Scale, AlertCircle } from "lucide-react";

interface NormaLegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (normaLegal: string) => Promise<void>;
  initialNormaLegal?: string | null;
  liquidationId?: number;
  liquidationCode?: string;
}

export function NormaLegalModal({
  isOpen,
  onClose,
  onConfirm,
  initialNormaLegal,
  liquidationId,
  liquidationCode,
}: NormaLegalModalProps) {
  const [dispNumber, setDispNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialNormaLegal && initialNormaLegal.trim()) {
        const cleaned = initialNormaLegal.replace(/^disp\s*n[°º]?\s*/i, "").trim();
        setDispNumber(cleaned);
      } else {
        setDispNumber("");
      }
      setError(null);
      setLoading(false);
    }
  }, [isOpen, initialNormaLegal]);

  const cleanInput = dispNumber.trim();
  const previewFormatted = cleanInput ? `Disp N° ${cleanInput.replace(/^disp\s*n[°º]?\s*/i, "")}` : "Disp N° [Número]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanInput) {
      setError("Por favor, ingrese el número de la disposición.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const formatted = `Disp N° ${cleanInput.replace(/^disp\s*n[°º]?\s*/i, "")}`;
      await onConfirm(formatted);
      onClose();
    } catch (err: any) {
      console.error("Error confirming norma legal:", err);
      setError(err.message || "Error al procesar la norma legal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-foreground">
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Scale className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold">
                Número de Norma Legal (Disposición)
              </DialogTitle>
              <DialogDescription className="text-3xs sm:text-2xs text-muted-foreground mt-0.5">
                {liquidationCode ? `Liquidación ${liquidationCode} en estado Distribuido.` : "Liquidación en estado Distribuido."} Ingrese el número de disposición para generar el reporte oficial.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="disposicionNumber" className="text-xs font-semibold text-foreground">
              Número de Disposición
            </Label>
            <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-500 overflow-hidden shadow-xs">
              <span className="px-3 py-2 text-xs font-bold font-mono bg-muted text-muted-foreground border-r border-border select-none">
                Disp N°
              </span>
              <Input
                id="disposicionNumber"
                type="text"
                autoFocus
                placeholder="Ej. 123 ó 456/2026"
                value={dispNumber}
                onChange={(e) => {
                  setDispNumber(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                className="border-0 focus-visible:ring-0 shadow-none font-mono font-semibold text-xs h-9 px-3"
              />
            </div>
            <p className="text-3xs text-muted-foreground">
              Se incluirá en el encabezado del Excel como:{" "}
              <strong className="text-foreground font-mono">{previewFormatted}</strong>
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-3xs font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-xs font-semibold h-8.5"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !cleanInput}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-8.5 gap-1.5 shadow-xs"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Generando Reporte...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Generar y Descargar Reporte</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
