"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Check,
  CheckCheck,
  CheckCircle2,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";
import { cleanCuit } from "@/lib/hospital-mapping";
import {
  parseRgaCbteItemDescription,
  suggestProviderForRgaHint,
  type ErpFcItemRow,
  type ProviderOption,
} from "@/lib/erp-circuit";
import type {
  HospitalImportMergeMode,
  ImportedHospitalDetailRow,
} from "@/components/bulk-hospital-details-modal";

interface RgaAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  erpFcItems: ErpFcItemRow[];
  providers: ProviderOption[];
  defaultPeriodo: string;
  rcImporteTotal: number;
  existingDetailsCount: number;
  onApply: (rows: ImportedHospitalDetailRow[], mode: HospitalImportMergeMode) => void;
}

interface RgaDraftRow {
  key: string;
  fcLabel: string;
  fcRef: string;
  paciente: string | null;
  dni: string | null;
  siniestro: string | null;
  hospitalHint: string;
  rawDescripcion: string;
  importeTotal: number;
  selectedProviderId: number | null;
  suggestedProviderId: number | null;
  suggestionConfidence: "high" | "medium" | "none";
  confirmed: boolean;
  honJuridicos: number;
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

export function RgaAssistantModal({
  open,
  onOpenChange,
  erpFcItems,
  providers,
  defaultPeriodo,
  rcImporteTotal,
  existingDetailsCount,
  onApply,
}: RgaAssistantModalProps) {
  const [rows, setRows] = useState<RgaDraftRow[]>([]);
  const [providerFilter, setProviderFilter] = useState("");
  const [gaPctStr, setGaPctStr] = useState("6");
  const [globalHonJuridicosPct, setGlobalHonJuridicosPct] = useState("0");
  const [mergeMode, setMergeMode] = useState<HospitalImportMergeMode>(
    existingDetailsCount > 0 ? "APPEND" : "REPLACE"
  );

  const validProviders = useMemo(
    () => providers.filter((p) => cleanCuit(p.cuit).length === 11),
    [providers]
  );

  const providerById = useMemo(
    () => new Map(validProviders.map((p) => [p.id, p])),
    [validProviders]
  );

  const filteredProviders = useMemo(() => {
    const q = providerFilter.trim().toLowerCase();
    if (!q) return validProviders;
    return validProviders.filter(
      (p) =>
        (p.nombre || "").toLowerCase().includes(q) ||
        cleanCuit(p.cuit).includes(q.replace(/\D/g, "")) ||
        String(p.id).includes(q)
    );
  }, [validProviders, providerFilter]);

  // Inicializar borrador desde CbtesItems cuando se abre el modal
  useEffect(() => {
    if (!open) return;
    const nonZero = erpFcItems.filter((it) => it.importeTotal > 0);
    const drafts: RgaDraftRow[] = nonZero.map((it, idx) => {
      const parsed = parseRgaCbteItemDescription(
        it.descripcion,
        `RGA-${it.fcId}-${it.nroRenglon}`
      );
      const suggestion = suggestProviderForRgaHint(parsed.hospitalHint, validProviders);
      return {
        key: `${it.fcId}-${it.nroRenglon}-${idx}`,
        fcLabel: it.fcLabel,
        fcRef: parsed.fcRef,
        paciente: parsed.paciente,
        dni: parsed.dni,
        siniestro: parsed.siniestro,
        hospitalHint: parsed.hospitalHint,
        rawDescripcion: parsed.rawDescripcion,
        importeTotal: round2(it.importeTotal),
        selectedProviderId: suggestion.providerId,
        suggestedProviderId: suggestion.providerId,
        suggestionConfidence: suggestion.confidence,
        // NUNCA auto-confirmar sin acción explícita del operador
        confirmed: false,
        honJuridicos: 0,
      };
    });
    setRows(drafts);
    setProviderFilter("");
    setGlobalHonJuridicosPct("0");
    setMergeMode(existingDetailsCount > 0 ? "APPEND" : "REPLACE");
  }, [open, erpFcItems, validProviders, existingDetailsCount]);

  const gaPct = useMemo(() => {
    const n = parseFloat(gaPctStr);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 6;
  }, [gaPctStr]);

  const handleSelectProvider = (rowKey: string, val: string) => {
    const pid = val ? parseInt(val, 10) : null;
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              selectedProviderId: pid && !isNaN(pid) ? pid : null,
              // Si el operador eligió explícitamente un proveedor, queda confirmado
              confirmed: Boolean(pid && !isNaN(pid)),
            }
          : r
      )
    );
  };

  const handleToggleConfirm = (rowKey: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey && r.selectedProviderId
          ? { ...r, confirmed: !r.confirmed }
          : r
      )
    );
  };

  const handleConfirmAllSuggested = () => {
    setRows((prev) =>
      prev.map((r) => (r.selectedProviderId ? { ...r, confirmed: true } : r))
    );
  };

  const handleHonJuridicosChange = (rowKey: string, val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, honJuridicos: round2(num) } : r))
    );
  };

  const handleApplyGlobalHonJuridicosPct = () => {
    const pct = parseFloat(globalHonJuridicosPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        honJuridicos: round2(r.importeTotal * (pct / 100)),
      }))
    );
  };

  const confirmedRows = useMemo(
    () => rows.filter((r) => r.confirmed && r.selectedProviderId && providerById.has(r.selectedProviderId)),
    [rows, providerById]
  );

  const suggestedPendingCount = useMemo(
    () => rows.filter((r) => !r.confirmed && r.selectedProviderId).length,
    [rows]
  );

  const summary = useMemo(() => {
    return confirmedRows.reduce(
      (acc, r) => {
        const bruto = round2(Math.max(0, r.importeTotal - r.honJuridicos));
        const ga = round2(bruto * (gaPct / 100));
        const neto = round2(Math.max(0, bruto - ga));
        return {
          facturado: round2(acc.facturado + r.importeTotal),
          honJuridicos: round2(acc.honJuridicos + r.honJuridicos),
          bruto: round2(acc.bruto + bruto),
          ga: round2(acc.ga + ga),
          neto: round2(acc.neto + neto),
        };
      },
      { facturado: 0, honJuridicos: 0, bruto: 0, ga: 0, neto: 0 }
    );
  }, [confirmedRows, gaPct]);

  const diffVsRc = round2(rcImporteTotal - summary.bruto);
  const isExactRcMatch = Math.abs(diffVsRc) < 1;

  const handleConfirmApply = () => {
    if (confirmedRows.length === 0) return;
    const output: ImportedHospitalDetailRow[] = confirmedRows.map((r) => {
      const prov = providerById.get(r.selectedProviderId!)!;
      const bruto = round2(Math.max(0, r.importeTotal - r.honJuridicos));
      const ga = round2(bruto * (gaPct / 100));
      const neto = round2(Math.max(0, bruto - ga));
      return {
        hospitalId: prov.id,
        prestadorNombre: prov.nombre || prov.descripcion || `Proveedor #${prov.id}`,
        cuit: cleanCuit(prov.cuit),
        localidad: prov.localidad || "CAPITAL",
        periodo: defaultPeriodo,
        fcHospital: r.fcRef,
        totalFacturado: r.importeTotal,
        creditos: 0,
        debitos: 0,
        // Los Honorarios Jurídicos RGA se reflejan como Ajuste O.S. negativo antes del Bruto/GA
        ajustesOs: r.honJuridicos > 0 ? -Math.abs(r.honJuridicos) : 0,
        pendientesCobro: 0,
        pagosParcialesAnteriores: 0,
        brutoAPagar: bruto,
        ga,
        gaPercent: gaPct,
        ajusteRecupero: 0,
        netoAPagar: neto,
      };
    });

    onApply(output, mergeMode);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[96vw] sm:max-w-5xl lg:max-w-6xl max-h-[92vh] overflow-y-auto bg-card border-border text-card-foreground p-4 sm:p-6">
        <DialogHeader className="space-y-1.5 border-b border-border pb-3">
          <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500 shrink-0" />
            <span>Asistente de Vinculación RGA (desde CbtesItems ERP)</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Se precargaron los legajos e importes de las Facturas de Venta (Pto. Vta. 10). Seleccione o confirme explícitamente el{" "}
            <strong className="text-foreground">Proveedor ERP (PROVEEDORES)</strong> de cada renglón para garantizar el{" "}
            <strong className="text-foreground">CUIT</strong> correcto.
          </DialogDescription>
        </DialogHeader>

        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 rounded-xl border border-border bg-muted/25 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-3xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                <Search className="h-3 w-3" />
                Filtrar lista de proveedores
              </Label>
              <Input
                type="text"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                placeholder="Ej. Escuela, Billinghurst, CUIT..."
                className="h-8 w-56 text-xs bg-background"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-3xs uppercase font-bold text-muted-foreground">
                GA (%)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gaPctStr}
                onChange={(e) => setGaPctStr(e.target.value)}
                className="h-8 w-20 text-xs text-right font-mono font-bold bg-background"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-3xs uppercase font-bold text-muted-foreground flex items-center gap-1">
                <Scale className="h-3 w-3 text-indigo-500" />
                Hon. Jurídicos RGA (%)
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={globalHonJuridicosPct}
                  onChange={(e) => setGlobalHonJuridicosPct(e.target.value)}
                  className="h-8 w-20 text-xs text-right font-mono font-bold bg-background"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleApplyGlobalHonJuridicosPct}
                  className="h-8 text-3xs font-bold cursor-pointer"
                >
                  Aplicar %
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {suggestedPendingCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleConfirmAllSuggested}
                className="h-8 text-xs font-bold border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 gap-1.5 cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Confirmar {suggestedPendingCount} sugerido(s)</span>
              </Button>
            )}

            {existingDetailsCount > 0 && (
              <select
                value={mergeMode}
                onChange={(e) => setMergeMode(e.target.value as HospitalImportMergeMode)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground cursor-pointer"
              >
                <option value="APPEND">Agregar a existentes ({existingDetailsCount})</option>
                <option value="REPLACE">Reemplazar actuales</option>
              </select>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Confirmados
            </span>
            <span className="text-sm font-extrabold text-foreground">
              {confirmedRows.length} / {rows.length} renglón(es)
            </span>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Recibo Cobrado (RC)
            </span>
            <span className="text-sm font-extrabold font-mono text-foreground">
              {formatCurrency(rcImporteTotal)}
            </span>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Bruto / Neto a Distribuir
            </span>
            <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.neto)}
            </span>
            {summary.honJuridicos > 0 && (
              <span className="block text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                Hon. Jurídicos: -{formatCurrency(summary.honJuridicos)}
              </span>
            )}
          </div>
          <div
            className={cn(
              "rounded-lg border p-2.5",
              isExactRcMatch
                ? "border-emerald-500/35 bg-emerald-500/10"
                : "border-amber-500/35 bg-amber-500/10"
            )}
          >
            <span className="text-3xs uppercase font-bold text-muted-foreground block">
              Diferencia Bruto vs RC
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

        {/* Rows List */}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-xs text-amber-700 dark:text-amber-300">
            No se encontraron renglones con importe mayor a 0 en CbtesItems para las FC aplicadas por este recibo.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10 text-3xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 px-2 text-center w-12">Conf.</th>
                    <th className="py-2 px-2 text-left whitespace-nowrap">Legajo / Ref</th>
                    <th className="py-2 px-2 text-left">Detalle ERP (Paciente · Hospital en texto)</th>
                    <th className="py-2 px-2 text-left min-w-[260px]">Proveedor ERP (PROVEEDORES · CUIT)</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap">Importe ERP</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap w-32">Hon. Jur. RGA ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((row) => {
                    const selectedProv = row.selectedProviderId
                      ? providerById.get(row.selectedProviderId)
                      : undefined;
                    // Asegurar que el proveedor ya seleccionado siempre aparezca en el select aunque el filtro esté activo
                    const optionsForRow =
                      selectedProv && !filteredProviders.some((p) => p.id === selectedProv.id)
                        ? [selectedProv, ...filteredProviders]
                        : filteredProviders;

                    return (
                      <tr
                        key={row.key}
                        className={cn(
                          "transition-colors",
                          row.confirmed
                            ? "bg-emerald-500/5"
                            : row.selectedProviderId
                            ? "bg-indigo-500/5"
                            : "hover:bg-muted/20"
                        )}
                      >
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            disabled={!row.selectedProviderId}
                            onClick={() => handleToggleConfirm(row.key)}
                            title={
                              !row.selectedProviderId
                                ? "Seleccione primero un Proveedor ERP"
                                : row.confirmed
                                ? "Confirmado (clic para desmarcar)"
                                : "Confirmar proveedor sugerido"
                            }
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                              row.confirmed
                                ? "bg-emerald-600 border-emerald-600 text-zinc-950"
                                : "border-border bg-background text-muted-foreground hover:border-indigo-500"
                            )}
                          >
                            {row.confirmed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                          </button>
                        </td>

                        <td className="py-2 px-2 align-top">
                          <span className="font-mono font-bold text-foreground block whitespace-nowrap">
                            {row.fcRef}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground block whitespace-nowrap">
                            {row.fcLabel}
                          </span>
                        </td>

                        <td className="py-2 px-2 align-top max-w-[300px]">
                          {row.paciente && (
                            <p className="font-semibold text-foreground break-words">
                              {row.paciente}
                              {row.dni && (
                                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                  (DNI {row.dni})
                                </span>
                              )}
                            </p>
                          )}
                          {row.hospitalHint ? (
                            <p className="text-3xs font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5 break-words">
                              Texto ERP: &ldquo;{row.hospitalHint}&rdquo;
                            </p>
                          ) : (
                            <p
                              className="text-3xs text-muted-foreground line-clamp-2 break-words"
                              title={row.rawDescripcion}
                            >
                              {row.rawDescripcion}
                            </p>
                          )}
                        </td>

                        <td className="py-2 px-2 align-top">
                          <select
                            value={row.selectedProviderId ? String(row.selectedProviderId) : ""}
                            onChange={(e) => handleSelectProvider(row.key, e.target.value)}
                            className={cn(
                              "w-full h-8 rounded-md border bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer",
                              row.confirmed
                                ? "border-emerald-500/60"
                                : row.selectedProviderId
                                ? "border-indigo-500/50"
                                : "border-amber-500/60"
                            )}
                          >
                            <option value="">-- Seleccionar Proveedor ERP --</option>
                            {optionsForRow.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.nombre} (CUIT {formatCuitDisplay(p.cuit)})
                              </option>
                            ))}
                          </select>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {selectedProv ? (
                              <>
                                <span className="font-mono text-muted-foreground">
                                  CUIT: <strong className="text-foreground">{formatCuitDisplay(selectedProv.cuit)}</strong> · Cód. #{selectedProv.id}
                                </span>
                                {!row.confirmed && row.suggestedProviderId === selectedProv.id && (
                                  <span className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.2 font-bold text-indigo-700 dark:text-indigo-300">
                                    Sugerido — falta confirmar
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <AlertTriangle className="h-3 w-3" />
                                Sin proveedor seleccionado
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-2 text-right font-mono font-bold text-foreground whitespace-nowrap align-top">
                          {formatCurrency(row.importeTotal)}
                        </td>

                        <td className="py-2 px-2 text-right align-top">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.honJuridicos || ""}
                            placeholder="0.00"
                            onChange={(e) => handleHonJuridicosChange(row.key, e.target.value)}
                            className="h-8 w-28 ml-auto text-right text-xs font-mono bg-background"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-3xs text-muted-foreground leading-relaxed">
          * Si carga <strong>Honorarios Jurídicos RGA</strong>, se aplican como <em>Ajuste O.S.</em> negativo antes del cálculo del Bruto y del GA ({gaPct}%). Podrá editar cualquier importe en la planilla antes de guardar definitivamente.
        </p>

        <DialogFooter className="border-t border-border pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-xs cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmApply}
            disabled={confirmedRows.length === 0}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              Cargar {confirmedRows.length} renglón(es) confirmados a la Planilla
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
