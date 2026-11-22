"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Landmark,
  Layers,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { ErpCircuitInfo, ErpFcItemRow } from "@/lib/erp-circuit";

interface ErpFcItemsPanelProps {
  circuit: ErpCircuitInfo;
  erpFcItems: ErpFcItemRow[];
  rcImporteTotal: number;
  detailsCount: number;
  canEdit: boolean;
  onOpenBulkImport: () => void;
  onOpenRgaAssistant: () => void;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

export function ErpFcItemsPanel({
  circuit,
  erpFcItems,
  rcImporteTotal,
  detailsCount,
  canEdit,
  onOpenBulkImport,
  onOpenRgaAssistant,
}: ErpFcItemsPanelProps) {
  // Auto-expandir si es un circuito sin Compras ERP y la liquidación todavía está vacía
  const [isExpanded, setIsExpanded] = useState(
    !circuit.usesComprasTable && detailsCount === 0 && erpFcItems.length > 0
  );

  const nonZeroItems = erpFcItems.filter((it) => it.importeTotal !== 0);
  const totalItemsAmount = erpFcItems.reduce((sum, it) => sum + (Number(it.importeTotal) || 0), 0);
  const uniqueFcCount = new Set(erpFcItems.map((it) => it.fcId)).size;

  return (
    <Card className="border-border bg-card text-card-foreground shadow-xs overflow-hidden">
      <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-muted/20">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-3xs font-extrabold uppercase tracking-wider border",
                circuit.badgeClasses
              )}
            >
              <Layers className="h-3 w-3 shrink-0" />
              Circuito: {circuit.label}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold bg-muted text-muted-foreground border border-border">
              <Landmark className="h-3 w-3 shrink-0" />
              Cta. Cte. TGP {circuit.ctaCteTgp}
            </span>

            {erpFcItems.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-mono font-semibold bg-background text-muted-foreground border border-border">
                <FileText className="h-3 w-3 shrink-0" />
                {uniqueFcCount} FC · {nonZeroItems.length} renglón(es) en ERP
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed break-words">
            {circuit.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && circuit.code === "RGA" && nonZeroItems.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={onOpenRgaAssistant}
              className="h-8.5 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 cursor-pointer shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Asistente RGA ({nonZeroItems.length})</span>
            </Button>
          )}

          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant={circuit.code === "RGA" || circuit.usesComprasTable ? "outline" : "default"}
              onClick={onOpenBulkImport}
              className={cn(
                "h-8.5 px-3 text-xs font-bold gap-1.5 cursor-pointer shadow-xs",
                circuit.code !== "RGA" && !circuit.usesComprasTable
                  ? "bg-emerald-600 hover:bg-emerald-500 text-zinc-950"
                  : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
              )}
            >
              <UploadCloud className="h-3.5 w-3.5 shrink-0" />
              <span>Importar Hospitales (Excel / Pegar)</span>
            </Button>
          )}

          {erpFcItems.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-8.5 px-2.5 text-xs font-semibold border-border text-foreground hover:bg-muted gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>
                {isExpanded ? "Ocultar" : "Ver"} Detalle ERP ({erpFcItems.length})
              </span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
            </Button>
          )}
        </div>
      </div>

      {isExpanded && erpFcItems.length > 0 && (
        <CardContent className="p-0 border-t border-border">
          <div className="px-4 py-2 bg-muted/30 border-b border-border/70 flex flex-wrap items-center justify-between gap-2 text-3xs">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">
              Detalle facturado en ERP (CbtesItems — Solo lectura)
            </span>
            <div className="flex flex-wrap items-center gap-3 font-mono">
              <span className="text-muted-foreground">
                Total Ítems FC:{" "}
                <strong className="text-foreground">{formatCurrency(totalItemsAmount)}</strong>
              </span>
              <span className="text-muted-foreground">
                Recibo Cobrado (RC):{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(rcImporteTotal)}
                </strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-muted/40 sticky top-0 z-10">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-3xs font-bold uppercase py-2 whitespace-nowrap">
                    FC Venta
                  </TableHead>
                  <TableHead className="text-3xs font-bold uppercase py-2 text-center w-14">
                    Reng.
                  </TableHead>
                  <TableHead className="text-3xs font-bold uppercase py-2 text-center w-16">
                    Prod.
                  </TableHead>
                  <TableHead className="text-3xs font-bold uppercase py-2">
                    Descripción / Concepto / Legajo (ERP)
                  </TableHead>
                  <TableHead className="text-3xs font-bold uppercase py-2 text-right whitespace-nowrap">
                    Importe ERP
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {erpFcItems.map((item, idx) => (
                  <TableRow
                    key={`${item.fcId}-${item.nroRenglon}-${idx}`}
                    className={cn(
                      "border-border/70 text-xs",
                      item.importeTotal === 0 && "opacity-60 bg-muted/20"
                    )}
                  >
                    <TableCell className="font-mono text-3xs font-semibold whitespace-nowrap py-2">
                      {item.fcLabel}
                    </TableCell>
                    <TableCell className="text-center font-mono text-3xs text-muted-foreground py-2">
                      {item.nroRenglon}
                    </TableCell>
                    <TableCell className="text-center font-mono text-3xs text-muted-foreground py-2">
                      {item.idProducto ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-foreground py-2 whitespace-normal break-words max-w-2xl">
                      {item.descripcion || <span className="italic text-muted-foreground">(Sin descripción)</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold whitespace-nowrap py-2">
                      {formatCurrency(item.importeTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
