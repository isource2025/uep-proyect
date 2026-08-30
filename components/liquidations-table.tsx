"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/search-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Receipt,
  Eye,
  CheckCircle2,
  RefreshCw,
  FileText,
  FileDown,
  Plus,
  Paperclip,
} from "lucide-react";
import DistributionGrid from "@/app/dashboard/hospital-portal/distribution-grid";

export interface LiquidationsTableProps {
  liquidations: any[];
  isHospitalUser?: boolean;
  hospitalId?: number;
  hospitalName?: string;
  agents?: any[];
  onAddAttachment?: (formData: FormData) => Promise<void>;
  onNotifyHospital?: (id: number) => Promise<void>;
  notifyingIds?: number[];
  isLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: (e: React.FormEvent) => void;
  title?: string;
  description?: string;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange?: (items: number) => void;
  };
}

export function LiquidationsTable({
  liquidations,
  isHospitalUser = false,
  hospitalId,
  hospitalName,
  agents = [],
  onAddAttachment,
  onNotifyHospital,
  notifyingIds = [],
  isLoading = false,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  title,
  description,
  pagination,
}: LiquidationsTableProps) {
  const router = useRouter();
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [enteringDetailsId, setEnteringDetailsId] = useState<number | null>(null);

  const activeSearchQuery = searchQuery !== undefined ? searchQuery : internalSearchQuery;
  const handleSearchChange = onSearchChange || setInternalSearchQuery;

  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  const getMonthName = (monthNum: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    return months[monthNum - 1] || `Mes ${monthNum}`;
  };

  // If external pagination is NOT provided, filter client-side if needed
  const displayList = pagination
    ? liquidations
    : liquidations.filter((liq) => {
        if (!activeSearchQuery.trim()) return true;
        const q = activeSearchQuery.toLowerCase().trim();
        const liqNum = `liq-${String(liq.id).padStart(4, "0")}`.toLowerCase();
        const idStr = String(liq.id);
        const mesCarga = (liq.mesCarga || "").toLowerCase();
        const periodName = (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "").toLowerCase();
        const rcNum = `${liq.rc?.puntoVenta || ""}-${liq.rc?.numero || ""}`.toLowerCase();
        const clienteName = (liq.rc?.cliente?.nombre || "").toLowerCase();
        const status = (liq.status || "").toLowerCase();

        return (
          liqNum.includes(q) ||
          idStr.includes(q) ||
          mesCarga.includes(q) ||
          periodName.includes(q) ||
          rcNum.includes(q) ||
          clienteName.includes(q) ||
          status.includes(q)
        );
      });

  const defaultTitle = isHospitalUser
    ? "Liquidaciones de Obras Sociales"
    : "Historial de Liquidaciones Generadas";
  const defaultDescription = isHospitalUser
    ? "Seleccione una liquidación consolidada para cargar la distribución y los adjuntos."
    : "Consulte la planilla interactiva de liquidación por cada recibo UEP y modifique débitos, créditos o adjunte los comprobantes escaneados.";

  return (
    <Card className="border-border bg-card text-card-foreground">
      <CardHeader className="p-5 pb-3 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">
            {title || defaultTitle}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs mt-0.5">
            {description || defaultDescription}
          </CardDescription>
        </div>

        <SearchBar
          placeholder={
            isHospitalUser
              ? "Buscar por liquidación, período, recibo u O.S..."
              : "Buscar por Obra Social, Recibo o Mes..."
          }
          value={activeSearchQuery}
          onChange={handleSearchChange}
          onSubmit={onSearchSubmit}
          isLoading={isLoading}
          size="sm"
          className="w-full sm:w-80"
        />
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 text-muted-foreground">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="font-semibold text-xs py-3">LIQ. N°</TableHead>
                {isHospitalUser ? (
                  <>
                    <TableHead className="font-semibold text-xs">Obra Social (Cliente)</TableHead>
                    <TableHead className="font-semibold text-xs">Período</TableHead>
                    <TableHead className="font-semibold text-xs">Recibo (RC)</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Neto Final</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Distribuido</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="font-semibold text-xs">Obra Social (Cliente)</TableHead>
                    <TableHead className="font-semibold text-xs">Mes Carga</TableHead>
                    <TableHead className="font-semibold text-xs">Recibo UEP</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Neto a Pagar</TableHead>
                    <TableHead className="font-semibold text-xs text-center">Débitos PDF</TableHead>
                  </>
                )}
                <TableHead className="font-semibold text-xs">Estado</TableHead>
                <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className={cn(isLoading && "opacity-50 pointer-events-none transition-opacity duration-200")}>
              {displayList.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell
                    colSpan={isHospitalUser ? 9 : 9}
                    className="text-center text-muted-foreground text-sm py-12"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="h-8 w-8 text-muted-foreground" />
                      <p>
                        {activeSearchQuery.trim()
                          ? "No se encontraron liquidaciones que coincidan con la búsqueda."
                          : "No se encontraron liquidaciones para mostrar."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayList.map((liq) => {
                  // If hospital mode, calculate hospital-scoped amounts
                  let totalFacturado = Number(liq.totalFacturado || 0);
                  let netoFinal = Number(liq.netoAPagar || 0);
                  let totalDistributed = 0;

                  if (isHospitalUser && hospitalId && liq.details) {
                    const hospitalDetails = liq.details.filter(
                      (d: any) =>
                        d.hospitalId === hospitalId ||
                        (d.prestadorNombre &&
                          hospitalName &&
                          d.prestadorNombre.toLowerCase().trim().includes(hospitalName.toLowerCase().trim())) ||
                        (hospitalName &&
                          d.prestadorNombre &&
                          hospitalName.toLowerCase().trim().includes(d.prestadorNombre.toLowerCase().trim()))
                    );
                    const currentDetails = hospitalDetails.length > 0 ? hospitalDetails : liq.details;

                    totalFacturado = currentDetails.reduce((sum: number, d: any) => sum + Number(d.totalFacturado || 0), 0);
                    netoFinal = currentDetails.reduce((sum: number, d: any) => sum + Number(d.netoAPagar || 0), 0);

                    if (liq.distributions) {
                      totalDistributed = liq.distributions.reduce(
                        (sum: number, d: any) =>
                          sum + Number(d.honorarios || 0) + Number(d.sobreasignaciones || 0) + Number(d.gastos || 0),
                        0
                      );
                    }
                  }

                  return (
                    <TableRow key={liq.id} className="hover:bg-muted/40 border-border text-foreground">
                      <TableCell className="font-mono text-xs font-bold text-foreground py-3.5">
                        LIQ-{String(liq.id).padStart(4, "0")}
                      </TableCell>

                      {isHospitalUser ? (
                        <>
                          <TableCell className="text-xs font-semibold max-w-[180px] whitespace-normal break-words">
                            {liq.rc?.cliente?.nombre || "Obra Social"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {liq.mesCarga || (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "-")}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {liq.rc?.puntoVenta}-{liq.rc?.numero}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatCurrency(totalFacturado)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(netoFinal)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-foreground">
                            {formatCurrency(totalDistributed)}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-xs font-semibold max-w-[200px] whitespace-normal break-words">
                            {liq.rc?.cliente?.nombre || "Obra Social"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {liq.mesCarga || (liq.periodMes ? `${liq.periodMes}/${liq.periodAnio}` : "-")}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {liq.rc?.puntoVenta}-{liq.rc?.numero}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatCurrency(totalFacturado)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(netoFinal)}
                          </TableCell>
                          <TableCell className="text-center">
                            {liq.debitsFileUrl ? (
                              <a
                                href={liq.debitsFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-2xs text-emerald-600 hover:underline font-semibold"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Ver PDF
                              </a>
                            ) : (
                              <span className="text-2xs text-muted-foreground">Sin adjunto</span>
                            )}
                          </TableCell>
                        </>
                      )}

                      {/* Estado */}
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold border ${
                            liq.status === "PENDIENTE"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                              : liq.status === "NOTIFICADO" || liq.status === "EN_PROCESO"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          }`}
                        >
                          {liq.status}
                        </span>
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isHospitalUser ? (
                            <>
                              {/* Debits PDF Download */}
                              {liq.debitsFileUrl && (
                                <a href={liq.debitsFileUrl} target="_blank" rel="noopener noreferrer" download>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold gap-1.5 h-8 text-xs cursor-pointer"
                                  >
                                    <FileDown className="h-3.5 w-3.5" />
                                    Débitos PDF
                                  </Button>
                                </a>
                              )}

                              {/* Distribute Funds Dialog */}
                              {hospitalId && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 h-8 text-xs cursor-pointer"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Distribuir Fondos
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="border-border bg-card text-card-foreground max-w-5xl w-[92vw] overflow-y-auto max-h-[85vh]">
                                    <DialogHeader>
                                      <DialogTitle className="text-foreground font-bold">
                                        Distribución y Adjuntos
                                      </DialogTitle>
                                      <DialogDescription className="text-muted-foreground text-xs">
                                        Liquidación LIQ-{String(liq.id).padStart(4, "0")} &bull; Neto Final:{" "}
                                        <strong className="text-foreground">{formatCurrency(netoFinal)}</strong>
                                      </DialogDescription>
                                    </DialogHeader>

                                    {/* Distribution Grid */}
                                    <DistributionGrid
                                      liquidationId={liq.id}
                                      hospitalId={hospitalId}
                                      netoFinalLimit={netoFinal}
                                      agents={agents}
                                      initialDistributions={liq.distributions || []}
                                    />

                                    {/* Upload mock Attachment */}
                                    {liq.status !== "CERRADA" && onAddAttachment && (
                                      <form
                                        action={onAddAttachment}
                                        className="space-y-4 border-t border-b border-border py-4 my-2"
                                      >
                                        <input type="hidden" name="liquidationId" value={liq.id} />
                                        <h4 className="text-xs font-bold text-foreground">
                                          Adjuntar Documento PDF (Comprobante / Acta):
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-1.5">
                                            <Label htmlFor="fileName" className="text-xs">
                                              Nombre del Archivo
                                            </Label>
                                            <Input
                                              id="fileName"
                                              name="fileName"
                                              required
                                              placeholder="Comprobante_Pago.pdf"
                                              className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                            />
                                          </div>
                                          <div className="space-y-1.5">
                                            <Label htmlFor="fileUrl" className="text-xs">
                                              Enlace / URL del PDF
                                            </Label>
                                            <Input
                                              id="fileUrl"
                                              name="fileUrl"
                                              required
                                              placeholder="https://drive.google.com/..."
                                              className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                            />
                                          </div>
                                        </div>
                                        <Button
                                          type="submit"
                                          className="w-full bg-teal-600 hover:bg-teal-500 text-zinc-950 font-semibold h-9 text-xs cursor-pointer"
                                        >
                                          Subir Adjunto
                                        </Button>
                                      </form>
                                    )}

                                    {/* Attachments List */}
                                    <div className="space-y-3 pt-2">
                                      <h4 className="text-xs font-bold text-foreground">Documentos Adjuntos:</h4>
                                      <div className="space-y-2">
                                        {!liq.attachments || liq.attachments.length === 0 ? (
                                          <p className="text-xs text-muted-foreground text-center py-2 border border-dashed border-border rounded-lg">
                                            No hay documentos adjuntos.
                                          </p>
                                        ) : (
                                          liq.attachments.map((at: any) => (
                                            <div
                                              key={at.id}
                                              className="flex items-center justify-between p-2 border border-border rounded-lg bg-muted/20 text-xs"
                                            >
                                              <div className="flex items-center gap-2">
                                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="font-semibold">{at.fileName}</span>
                                              </div>
                                              <a
                                                href={at.fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-emerald-500 hover:underline"
                                              >
                                                Descargar
                                              </a>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}

                              {/* Direct Detail link */}
                              <Link href={`/dashboard/liquidations/${liq.id}`}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs gap-1.5 h-8 border border-border hover:bg-muted cursor-pointer font-bold text-foreground"
                                >
                                  <Eye className="h-3.5 w-3.5 text-emerald-500" />
                                  Ver / Editar
                                </Button>
                              </Link>
                            </>
                          ) : (
                            <>
                              {/* Admin Actions */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEnteringDetailsId(liq.id);
                                  router.push(`/dashboard/liquidations/${liq.id}`);
                                }}
                                disabled={enteringDetailsId !== null || notifyingIds.includes(liq.id)}
                                className="text-xs gap-1 h-8 border border-border hover:bg-muted cursor-pointer font-bold text-foreground"
                              >
                                {enteringDetailsId === liq.id ? (
                                  <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                                    Entrando...
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3.5 w-3.5 text-emerald-500" />
                                    Ver / Editar
                                  </>
                                )}
                              </Button>

                              {liq.status !== "NOTIFICADO" && liq.status !== "CERRADA" && onNotifyHospital && (
                                <Button
                                  size="sm"
                                  onClick={() => onNotifyHospital(liq.id)}
                                  disabled={notifyingIds.includes(liq.id)}
                                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1 text-xs h-8 cursor-pointer"
                                >
                                  {notifyingIds.includes(liq.id) ? (
                                    <>
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                      Notificando...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Notificar Hospital
                                    </>
                                  )}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {pagination && pagination.totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border p-4 gap-4 text-xs text-muted-foreground">
            {pagination.onItemsPerPageChange && (
              <div className="flex items-center gap-2">
                <span>Mostrar</span>
                <select
                  value={pagination.itemsPerPage}
                  onChange={(e) => pagination.onItemsPerPageChange!(Number(e.target.value))}
                  className="bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value={5} className="bg-card text-foreground">5</option>
                  <option value={10} className="bg-card text-foreground">10</option>
                  <option value={20} className="bg-card text-foreground">20</option>
                  <option value={50} className="bg-card text-foreground">50</option>
                </select>
                <span>por página</span>
              </div>
            )}

            <div>
              Mostrando{" "}
              <span className="font-semibold text-foreground">
                {(pagination.currentPage - 1) * pagination.itemsPerPage + 1}
              </span>
              -
              <span className="font-semibold text-foreground">
                {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}
              </span>{" "}
              de <span className="font-semibold text-foreground">{pagination.totalItems}</span> liquidaciones
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => pagination.onPageChange(Math.max(pagination.currentPage - 1, 1))}
                disabled={pagination.currentPage === 1}
                className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
              >
                Anterior
              </Button>

              <span className="px-2 font-bold text-foreground">
                {pagination.currentPage} / {pagination.totalPages}
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => pagination.onPageChange(Math.min(pagination.currentPage + 1, pagination.totalPages))}
                disabled={pagination.currentPage >= pagination.totalPages}
                className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
