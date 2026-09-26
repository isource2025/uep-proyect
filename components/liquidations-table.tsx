"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/search-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Receipt,
  Eye,
  CheckCircle2,
  RefreshCw,
  FileText,
  FileDown,
  User,
  MessageSquare,
  Building2,
} from "lucide-react";

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
  const [selectedObs, setSelectedObs] = useState<{
    id: number;
    title: string;
    clientName: string;
    createdByName?: string;
    text: string;
  } | null>(null);
  const [selectedHospitalProgress, setSelectedHospitalProgress] = useState<{
    id: number;
    title: string;
    clientName: string;
    completed: number;
    total: number;
    list: any[];
    pending: any[];
  } | null>(null);

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
        const cleanDigits = q.replace(/\D/g, "");
        const liqNum = `liq-${String(liq.id).padStart(4, "0")}`.toLowerCase();
        const idStr = String(liq.id);
        const mesCarga = (liq.mesCarga || "").toLowerCase();
        const periodName = (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "").toLowerCase();
        const rcNum = `${liq.rc?.puntoVenta || ""}-${liq.rc?.numero || ""}`.toLowerCase();
        const clienteName = (liq.rc?.cliente?.nombre || "").toLowerCase();
        const status = (liq.status || "").toLowerCase();
        const createdByName = (liq.createdByName || "").toLowerCase();
        const observaciones = (liq.observaciones || "").toLowerCase();

        // Check FC-Ventas asociadas
        const fcMatches = (liq.rc?.appliedAsRc || []).some((app: any) => {
          const fc = app.fc;
          if (!fc) return false;
          const fcPto = String(fc.puntoVenta || "");
          const fcPtoPad = fcPto.padStart(4, "0");
          const fcNro = String(fc.numero || "");
          const fcNroPad = fcNro.padStart(8, "0");
          const fcFull = `fc-${fcPtoPad}-${fcNroPad}`.toLowerCase();
          const fcShort = `fc-${fcPto}-${fcNro}`.toLowerCase();
          const fcDash = `${fcPtoPad}-${fcNroPad}`.toLowerCase();
          const fcDashShort = `${fcPto}-${fcNro}`.toLowerCase();

          return (
            fcNro.includes(q) ||
            fcNroPad.includes(q) ||
            (cleanDigits && (fcNro === cleanDigits || Number(fcNro) === Number(cleanDigits))) ||
            fcFull.includes(q) ||
            fcShort.includes(q) ||
            fcDash.includes(q) ||
            fcDashShort.includes(q) ||
            String(fc.id).includes(q)
          );
        });

        // Check details (FC Hospital, prestador, etc.)
        const detailMatches = (liq.details || []).some((d: any) => {
          const fcHosp = (d.fcHospital || "").toLowerCase();
          const prest = (d.prestadorNombre || "").toLowerCase();
          const cuit = (d.cuit || "").toLowerCase();
          return fcHosp.includes(q) || prest.includes(q) || cuit.includes(q);
        });

        return (
          liqNum.includes(q) ||
          idStr.includes(q) ||
          mesCarga.includes(q) ||
          periodName.includes(q) ||
          rcNum.includes(q) ||
          clienteName.includes(q) ||
          status.includes(q) ||
          createdByName.includes(q) ||
          observaciones.includes(q) ||
          fcMatches ||
          detailMatches
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
      <CardHeader className="p-5 pb-3 border-b border-border/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
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
              ? "Buscar por Obra Social, Liq. N°, FC, período o recibo..."
              : "Buscar por Obra Social, Liq. N°, Factura (FC) o Recibo..."
          }
          value={activeSearchQuery}
          onChange={handleSearchChange}
          onSubmit={onSearchSubmit}
          isLoading={isLoading}
          size="sm"
          className="w-full lg:w-[460px] xl:w-[520px] shrink-0"
        />
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader className="bg-muted/50 text-muted-foreground">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="font-semibold text-xs py-3 w-[100px]">LIQ. N°</TableHead>
                {isHospitalUser ? (
                  <>
                    <TableHead className="font-semibold text-xs min-w-[200px]">Obra Social (Cliente)</TableHead>
                    <TableHead className="font-semibold text-xs w-[130px]">Período</TableHead>
                    <TableHead className="font-semibold text-xs w-[130px]">Recibo (RC)</TableHead>
                    <TableHead className="font-semibold text-xs text-right w-[140px]">Neto Inicial</TableHead>
                    <TableHead className="font-semibold text-xs text-right w-[140px]">Neto Final</TableHead>
                    <TableHead className="font-semibold text-xs text-right w-[140px]">Distribuido</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="font-semibold text-xs min-w-[220px]">Obra Social (Cliente)</TableHead>
                    <TableHead className="font-semibold text-xs min-w-[140px]">Facturas de Venta</TableHead>
                    <TableHead className="font-semibold text-xs w-[130px]">Recibo UEP</TableHead>
                    <TableHead className="font-semibold text-xs text-right w-[140px]">Neto Inicial</TableHead>
                    <TableHead className="font-semibold text-xs text-right w-[140px]">Neto a Pagar</TableHead>
                    <TableHead className="font-semibold text-xs text-center w-[120px]">Débitos PDF</TableHead>
                  </>
                )}
                <TableHead className="font-semibold text-xs text-center w-[120px]">Estado</TableHead>
                <TableHead className="font-semibold text-xs text-right w-[140px]">Acciones</TableHead>
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
                    <TableRow key={liq.id} className="hover:bg-muted/40 border-border text-foreground transition-colors">
                      <TableCell className="font-mono text-xs font-bold text-foreground py-3.5 whitespace-nowrap">
                        LIQ-{String(liq.id).padStart(4, "0")}
                      </TableCell>

                      {isHospitalUser ? (
                        <>
                          <TableCell className="text-xs font-semibold whitespace-normal break-words py-3">
                            <div>{liq.rc?.cliente?.nombre || "Obra Social"}</div>
                            {((liq.createdByName && liq.createdByName.trim() !== "") || (liq.observaciones && liq.observaciones.trim() !== "")) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {liq.createdByName && liq.createdByName.trim() !== "" && (
                                  <span className="text-3xs text-muted-foreground flex items-center gap-1 font-normal">
                                    <User className="h-3 w-3 text-emerald-500 shrink-0" />
                                    {liq.createdByName}
                                  </span>
                                )}
                                {liq.observaciones && liq.observaciones.trim() !== "" && (
                                  <div className="relative group inline-block">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedObs({
                                          id: liq.id,
                                          title: `LIQ-${String(liq.id).padStart(4, "0")}`,
                                          clientName: liq.rc?.cliente?.nombre || "Obra Social",
                                          createdByName: liq.createdByName,
                                          text: liq.observaciones,
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-bold cursor-pointer hover:bg-amber-500/20 active:scale-95 transition-all"
                                      title="Ver observaciones"
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                      Obs
                                    </button>
                                    {/* Hover Tooltip Popup for desktop */}
                                    <div className="absolute left-0 top-full mt-1.5 hidden md:group-hover:flex flex-col z-50 w-72 p-3 bg-popover text-popover-foreground rounded-lg shadow-xl border border-border text-xs pointer-events-none animate-in fade-in-0 zoom-in-95">
                                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-1.5">
                                        <span className="font-bold text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                          <MessageSquare className="h-3.5 w-3.5" />
                                          Observaciones
                                        </span>
                                        {liq.createdByName && (
                                          <span className="text-3xs text-muted-foreground">
                                            {liq.createdByName}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-2xs text-foreground whitespace-pre-wrap leading-relaxed font-normal">
                                        {liq.observaciones}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {liq.mesCarga || (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "-")}
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {liq.rc?.puntoVenta}-{liq.rc?.numero}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono tabular-nums whitespace-nowrap">
                            {formatCurrency(totalFacturado)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatCurrency(netoFinal)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono tabular-nums font-bold text-foreground whitespace-nowrap">
                            {formatCurrency(totalDistributed)}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-xs font-semibold whitespace-normal break-words py-2.5">
                            <div>{liq.rc?.cliente?.nombre || "Obra Social"}</div>
                            {((liq.createdByName && liq.createdByName.trim() !== "") || (liq.observaciones && liq.observaciones.trim() !== "")) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {liq.createdByName && liq.createdByName.trim() !== "" && (
                                  <span className="text-3xs text-muted-foreground flex items-center gap-1 font-normal">
                                    <User className="h-3 w-3 text-emerald-500 shrink-0" />
                                    {liq.createdByName}
                                  </span>
                                )}
                                {liq.observaciones && liq.observaciones.trim() !== "" && (
                                  <div className="relative group inline-block">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedObs({
                                          id: liq.id,
                                          title: `LIQ-${String(liq.id).padStart(4, "0")}`,
                                          clientName: liq.rc?.cliente?.nombre || "Obra Social",
                                          createdByName: liq.createdByName,
                                          text: liq.observaciones,
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-bold cursor-pointer hover:bg-amber-500/20 active:scale-95 transition-all"
                                      title="Ver observaciones"
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                      Obs
                                    </button>
                                    {/* Hover Tooltip Popup for desktop */}
                                    <div className="absolute left-0 top-full mt-1.5 hidden md:group-hover:flex flex-col z-50 w-72 p-3 bg-popover text-popover-foreground rounded-lg shadow-xl border border-border text-xs pointer-events-none animate-in fade-in-0 zoom-in-95">
                                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-1.5">
                                        <span className="font-bold text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                          <MessageSquare className="h-3.5 w-3.5" />
                                          Observaciones
                                        </span>
                                        {liq.createdByName && (
                                          <span className="text-3xs text-muted-foreground">
                                            {liq.createdByName}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-2xs text-foreground whitespace-pre-wrap leading-relaxed font-normal">
                                        {liq.observaciones}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono py-2.5">
                            {liq.rc?.appliedAsRc && liq.rc.appliedAsRc.length > 0 ? (
                              <div className="flex flex-wrap gap-1 items-center">
                                {liq.rc.appliedAsRc.map((app: any, idx: number) => {
                                  const fc = app.fc;
                                  if (!fc) return null;
                                  const pto = String(fc.puntoVenta || "1").padStart(4, "0");
                                  const nro = String(fc.numero || "").padStart(8, "0");
                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-3xs font-semibold whitespace-nowrap font-mono"
                                      title={`FC-${pto}-${nro}`}
                                    >
                                      FC-{pto}-{nro}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs font-mono">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {liq.rc?.puntoVenta}-{liq.rc?.numero}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono tabular-nums whitespace-nowrap">
                            {formatCurrency(totalFacturado)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatCurrency(netoFinal)}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
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
                      <TableCell className="text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-3xs font-semibold border ${
                            liq.status === "PENDIENTE"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                              : liq.status === "NOTIFICADO"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                              : liq.status === "EN_PROCESO"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25"
                              : liq.status === "DISTRIBUIDA" || liq.status === "DISTRIBUIDO"
                              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          }`}
                        >
                          {liq.status}
                        </span>
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="text-right whitespace-nowrap">
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

                              {/* Hospital distribution progress button (e.g. 4/10) */}
                              {(() => {
                                const details = liq.details || [];
                                const distributions = liq.distributions || [];

                                const hospitalMap = new Map<string, {
                                  id?: number;
                                  name: string;
                                  netoAPagar: number;
                                  distributed: number;
                                }>();

                                for (const d of details) {
                                  const hid = d.hospitalId || d.compra?.hospitalId;
                                  const name = d.prestadorNombre || d.hospital?.nombre || `Hospital #${hid || '?'}`;
                                  const key = hid ? `id-${hid}` : `name-${name}`;
                                  
                                  const existing = hospitalMap.get(key) || {
                                    id: hid,
                                    name,
                                    netoAPagar: 0,
                                    distributed: 0,
                                  };
                                  existing.netoAPagar += Number(d.netoAPagar || 0);
                                  hospitalMap.set(key, existing);
                                }

                                for (const dist of distributions) {
                                  const hid = dist.agent?.hospitalId;
                                  if (hid) {
                                    const key = `id-${hid}`;
                                    if (hospitalMap.has(key)) {
                                      const existing = hospitalMap.get(key)!;
                                      existing.distributed += Number(dist.honorarios || 0) + Number(dist.sobreasignaciones || 0) + Number(dist.gastos || 0);
                                    }
                                  }
                                }

                                const list = Array.from(hospitalMap.values()).map((h) => {
                                  const isCompleted = h.netoAPagar > 0 && h.distributed >= (h.netoAPagar - 0.01);
                                  const hasStarted = h.distributed > 0;
                                  const remaining = Math.max(0, h.netoAPagar - h.distributed);
                                  return {
                                    ...h,
                                    isCompleted,
                                    hasStarted,
                                    remaining,
                                  };
                                });

                                const total = list.length;
                                const completed = list.filter((h) => h.isCompleted).length;
                                const pending = list.filter((h) => !h.isCompleted);

                                if (total === 0) return null;

                                return (
                                  <div className="relative group inline-block">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedHospitalProgress({
                                          id: liq.id,
                                          title: `LIQ-${String(liq.id).padStart(4, "0")}`,
                                          clientName: liq.rc?.cliente?.nombre || "Obra Social",
                                          completed,
                                          total,
                                          list,
                                          pending,
                                        });
                                      }}
                                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-bold cursor-pointer transition-all active:scale-95 h-8 ${
                                        completed === total
                                          ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25 hover:bg-teal-500/20"
                                          : completed > 0
                                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25 hover:bg-purple-500/20"
                                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
                                      }`}
                                      title="Ver progreso de distribución por hospital"
                                    >
                                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                                      <span>{completed}/{total}</span>
                                    </button>

                                    {/* Hover Tooltip Popup for desktop */}
                                    <div className="absolute right-0 top-full mt-1.5 hidden md:group-hover:flex flex-col z-50 w-80 p-3 bg-popover text-popover-foreground rounded-lg shadow-xl border border-border text-xs pointer-events-none animate-in fade-in-0 zoom-in-95">
                                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-2">
                                        <span className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                                          <Building2 className="h-3.5 w-3.5 text-purple-500" />
                                          Progreso ({completed}/{total})
                                        </span>
                                        <span className={`text-3xs font-semibold px-1.5 py-0.5 rounded ${
                                          completed === total ? "bg-teal-500/15 text-teal-600 dark:text-teal-400" : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                                        }`}>
                                          {completed === total ? "Completado" : `${pending.length} pendiente(s)`}
                                        </span>
                                      </div>

                                      {pending.length > 0 ? (
                                        <div className="space-y-1.5">
                                          <p className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">Hospitales que faltan:</p>
                                          <div className="max-h-40 overflow-y-auto space-y-1">
                                            {pending.map((h, i) => (
                                              <div key={i} className="flex items-center justify-between text-2xs p-1.5 rounded bg-muted/50 border border-border/40">
                                                <span className="font-medium text-foreground truncate max-w-[170px]" title={h.name}>
                                                  {h.name}
                                                </span>
                                                <span className={`text-3xs font-mono font-semibold ${
                                                  h.hasStarted ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"
                                                }`}>
                                                  {h.hasStarted ? "En carga" : "Sin iniciar"}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-2xs text-teal-600 dark:text-teal-400 font-medium">
                                          ✓ Todos los hospitales cargaron sus honorarios y sobreasignaciones.
                                        </p>
                                      )}
                                      <p className="text-3xs text-muted-foreground mt-2 border-t border-border/40 pt-1.5 text-center font-normal">
                                        Clic para ver el detalle completo
                                      </p>
                                    </div>
                                  </div>
                                );
                              })()}

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

      {/* Modal Dialog for Mobile & Desktop when tapping/clicking 'Obs' */}
      <Dialog open={!!selectedObs} onOpenChange={(open) => !open && setSelectedObs(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Observaciones de la Liquidación
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {selectedObs?.title} &bull; {selectedObs?.clientName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-3">
            {selectedObs?.createdByName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2 border-b border-border/60">
                <User className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Liquidado por: <strong className="text-foreground font-semibold">{selectedObs.createdByName}</strong></span>
              </div>
            )}
            <div className="p-3.5 rounded-lg bg-muted/50 border border-border text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed font-normal max-h-60 overflow-y-auto">
              {selectedObs?.text}
            </div>
          </div>

          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedObs(null)}
              className="w-full sm:w-auto font-medium cursor-pointer"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal Dialog for Hospital Distribution Progress */}
      <Dialog
        open={!!selectedHospitalProgress}
        onOpenChange={(open) => !open && setSelectedHospitalProgress(null)}
      >
        <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[88vh] flex flex-col p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  Estado de Carga por Hospital
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {selectedHospitalProgress?.title} &bull; {selectedHospitalProgress?.clientName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 space-y-4 flex-1 overflow-y-auto">
            {/* Summary progress bar */}
            <div className="p-3.5 sm:p-4 rounded-lg bg-muted/40 border border-border space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-foreground">
                  {selectedHospitalProgress?.completed} de {selectedHospitalProgress?.total} hospitales completados
                </span>
                <span className="font-mono text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400">
                  {Math.round(((selectedHospitalProgress?.completed || 0) / (selectedHospitalProgress?.total || 1)) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border border-border/60">
                <div
                  className="h-full bg-purple-600 dark:bg-purple-500 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.round(((selectedHospitalProgress?.completed || 0) / (selectedHospitalProgress?.total || 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Hospitals table */}
            <div className="border border-border rounded-lg overflow-x-auto">
              <Table className="w-full">
                <TableHeader className="bg-muted/60 text-muted-foreground">
                  <TableRow className="border-border">
                    <TableHead className="text-3xs uppercase font-semibold py-2.5 min-w-[200px]">Hospital / CAPS</TableHead>
                    <TableHead className="text-3xs uppercase font-semibold text-center w-[120px]">Estado</TableHead>
                    <TableHead className="text-3xs uppercase font-semibold text-right w-[150px]">Neto Asignado</TableHead>
                    <TableHead className="text-3xs uppercase font-semibold text-right w-[150px]">Distribuido</TableHead>
                    <TableHead className="text-3xs uppercase font-semibold text-right w-[150px]">Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedHospitalProgress?.list?.map((h: any, idx: number) => (
                    <TableRow key={idx} className="border-border hover:bg-muted/30 text-xs">
                      <TableCell className="font-medium text-foreground py-2.5 whitespace-normal break-words">
                        {h.name}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-semibold border ${
                            h.isCompleted
                              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25"
                              : h.hasStarted
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                          }`}
                        >
                          {h.isCompleted ? "Completo" : h.hasStarted ? "En Carga" : "Pendiente"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                        {formatCurrency(h.netoAPagar)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-purple-600 dark:text-purple-400 whitespace-nowrap">
                        {formatCurrency(h.distributed)}
                      </TableCell>
                      <TableCell className={`text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        h.remaining > 0.01 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {formatCurrency(h.remaining)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="sm:justify-end border-t border-border pt-3 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedHospitalProgress(null)}
              className="w-full sm:w-auto font-medium cursor-pointer"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
