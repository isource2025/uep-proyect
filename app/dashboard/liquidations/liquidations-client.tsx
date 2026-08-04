"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchLiquidationData, calculateLiquidation, notifyHospital } from "./actions";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calculator, Receipt, Eye, CheckCircle2, RefreshCw, AlertCircle, UploadCloud, FileText, Download, Building2, Save } from "lucide-react";

interface LiquidationsClientPageProps {
  initialData: {
    liquidations: any[];
    totalLiquidationsCount: number;
    pendingRcs: any[];
    totalPendingRcsCount: number;
  };
}

export default function LiquidationsClientPage({ initialData }: LiquidationsClientPageProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [totalCount, setTotalCount] = useState(initialData.totalLiquidationsCount);
  const [totalPendingCount, setTotalPendingCount] = useState(initialData.totalPendingRcsCount);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");

  const [calculatingRcId, setCalculatingRcId] = useState<number | null>(null);
  const [enteringDetailsId, setEnteringDetailsId] = useState<number | null>(null);
  const [notifyingIds, setNotifyingIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleNotifyHospital = async (id: number) => {
    setNotifyingIds((prev) => [...prev, id]);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await notifyHospital(id);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Hospitales notificados y correo simulado enviado con éxito.");
      setData((prev) => ({
        ...prev,
        liquidations: prev.liquidations.map((l) =>
          l.id === id ? { ...l, status: "NOTIFICADO" } : l
        ),
      }));
    } catch (e: any) {
      setErrorMsg("Error al notificar a los establecimientos.");
    } finally {
      setNotifyingIds((prev) => prev.filter((x) => x !== id));
    }
  };


  // Pagination states for generated liquidations list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Pagination states for pending RCs list
  const [currentPendingPage, setCurrentPendingPage] = useState(1);
  const [pendingItemsPerPage, setPendingItemsPerPage] = useState(5);

  // Fetch paginated lists from database on page/limits/search state changes
  useEffect(() => {
    const fetchPageData = async () => {
      setIsLoading(true);
      try {
        const res = await fetchLiquidationData(currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage, searchQuery, pendingSearchQuery);
        setData(res);
        setTotalCount(res.totalLiquidationsCount);
        setTotalPendingCount(res.totalPendingRcsCount);
      } catch (e) {
        // silent catch
      } finally {
        setIsLoading(false);
      }
    };

    const hasSearch = searchQuery || pendingSearchQuery;
    const timer = setTimeout(fetchPageData, hasSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage, searchQuery, pendingSearchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchLiquidationData(currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage, searchQuery, pendingSearchQuery);
      setData(res);
      setTotalCount(res.totalLiquidationsCount);
      setTotalPendingCount(res.totalPendingRcsCount);
    } catch (e: any) {
      setErrorMsg("Error al actualizar la lista de liquidaciones.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    setIsLoading(true);
    try {
      const res = await fetchLiquidationData(1, itemsPerPage, currentPendingPage, pendingItemsPerPage, searchQuery, pendingSearchQuery);
      setData(res);
      setTotalCount(res.totalLiquidationsCount);
      setTotalPendingCount(res.totalPendingRcsCount);
      setCurrentPage(1);
    } catch (e) {
      setErrorMsg("Error al realizar la búsqueda.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePendingSearchSubmit = async (e: React.FormEvent) => {
    setIsLoading(true);
    try {
      const res = await fetchLiquidationData(currentPage, itemsPerPage, 1, pendingItemsPerPage, searchQuery, pendingSearchQuery);
      setData(res);
      setTotalCount(res.totalLiquidationsCount);
      setTotalPendingCount(res.totalPendingRcsCount);
      setCurrentPendingPage(1);
    } catch (e) {
      setErrorMsg("Error al realizar la búsqueda en recibos pendientes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunCalculate = async (rcId: number) => {
    setCalculatingRcId(rcId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await calculateLiquidation(rcId);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      await loadData();
      setCurrentPage(1);

      setTimeout(() => {
        const mainContainer = document.querySelector("main");
        if (mainContainer) {
          mainContainer.scrollTo({
            top: mainContainer.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 300);
    } catch (e: any) {
      setErrorMsg("Error de red al calcular la liquidación.");
    } finally {
      setCalculatingRcId(null);
    }
  };



  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  const pendingRcs = data.pendingRcs;
  const liquidations = data.liquidations;

  // Pagination Generated Liquidations Logic
  const totalItems = totalCount;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedLiquidations = liquidations; // Paginated from DB

  const handleItemsPerPageChange = (val: number) => {
    setItemsPerPage(val);
    setCurrentPage(1);
  };

  // Pagination Pending RCs Logic
  const totalPendingItems = totalPendingCount;
  const totalPendingPages = Math.max(1, Math.ceil(totalPendingItems / pendingItemsPerPage));
  const safePendingPage = Math.min(currentPendingPage, totalPendingPages);
  const pendingStartIndex = (safePendingPage - 1) * pendingItemsPerPage;
  const pendingEndIndex = Math.min(pendingStartIndex + pendingItemsPerPage, totalPendingItems);
  const paginatedPendingRcs = pendingRcs; // Paginated from DB
  const handlePendingItemsPerPageChange = (val: number) => {
    setPendingItemsPerPage(val);
    setCurrentPendingPage(1);
  };

  const getPaginationItems = (current: number, total: number) => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);

      if (start > 2) {
        pages.push("...");
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < total - 1) {
        pages.push("...");
      }

      pages.push(total);
    }
    return pages;
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Calculator className="h-8 w-8 text-emerald-500" />
          Generación y Ajuste de Liquidaciones
        </h1>
        <p className="text-sm text-muted-foreground">
          Calcule y administre las liquidaciones transaccionales por Obra Social y modifique débitos, créditos y gastos por hospital.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p>{successMsg}</p>
        </div>
      )}

      {/* Pending Calculations Card */}
      {(initialData.totalPendingRcsCount > 0 || pendingSearchQuery) ? (
        <Card className="border-emerald-500/25 bg-emerald-500/5 text-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Calculator className="h-5 w-5" />
              <CardTitle className="text-base font-bold text-foreground">Recibos de Cobro Pendientes de Liquidar</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground text-xs mt-1">
              Se detectaron recibos de cobro de obras sociales que aún no han sido procesados en este período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn("space-y-4", isLoading && "opacity-50 pointer-events-none transition-opacity duration-200")}>
              <SearchBar
                placeholder="Buscar por Obra Social o número de recibo..."
                value={pendingSearchQuery}
                onChange={setPendingSearchQuery}
                onSubmit={handlePendingSearchSubmit}
                isLoading={isLoading}
                className="mb-2"
              />
              {paginatedPendingRcs.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No se encontraron recibos de cobro pendientes que coincidan con la búsqueda.
                </div>
              ) : (
                paginatedPendingRcs.map((rc) => {
                  const isThisCalculating = calculatingRcId === rc.id;
                  return (
                    <div key={rc.id} className="flex flex-col gap-4 rounded-xl border border-emerald-500/20 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-3xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                            {rc.type}
                          </span>
                          <code className="text-xs font-mono font-bold text-foreground">{rc.puntoVenta}-{rc.numero}</code>
                          <span className="text-xs text-muted-foreground">| Obra Social: <strong className="text-foreground">{rc.cliente.nombre}</strong></span>
                        </div>
                        <p className="text-2xs text-muted-foreground">
                          Fecha: {new Date(rc.fecha).toLocaleDateString("es-AR")} &bull; Importe Cobrado: <strong className="text-foreground">{formatCurrency(rc.importe)}</strong>
                        </p>
                        <div className="text-[10px] text-muted-foreground">
                          Cancela Facturas: {rc.appliedAsRc.map((app: any) => `${app.fc.puntoVenta}-${app.fc.numero} (${formatCurrency(app.importe)})`).join(", ")}
                        </div>
                      </div>
                      
                      <Button
                        onClick={() => handleRunCalculate(rc.id)}
                        disabled={calculatingRcId !== null}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1 h-9 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isThisCalculating ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Calculator className="h-4 w-4" />
                            Calcular Liquidación
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pending Pagination Controls */}
            {totalPendingItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-emerald-500/10 mt-4 pt-4 gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Mostrar</span>
                  <select
                    value={pendingItemsPerPage}
                    onChange={(e) => handlePendingItemsPerPageChange(Number(e.target.value))}
                    className="bg-muted/40 border border-emerald-500/20 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value={3} className="bg-card text-foreground">3</option>
                    <option value={5} className="bg-card text-foreground">5</option>
                    <option value={10} className="bg-card text-foreground">10</option>
                    <option value={25} className="bg-card text-foreground">25</option>
                  </select>
                  <span>por página</span>
                </div>

                <div>
                  Mostrando <span className="font-semibold text-foreground">{totalPendingItems > 0 ? pendingStartIndex + 1 : 0}</span>-
                  <span className="font-semibold text-foreground">{pendingEndIndex}</span> de{" "}
                  <span className="font-semibold text-foreground">{totalPendingItems}</span> recibos pendientes
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPendingPage((prev) => Math.max(prev - 1, 1))}
                    disabled={safePendingPage === 1}
                    className="h-8 px-2 border border-emerald-500/20 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
                  >
                    Anterior
                  </Button>
                  
                  {getPaginationItems(safePendingPage, totalPendingPages).map((item, index) => {
                    if (item === "...") {
                      return (
                        <span key={`pending-ellipsis-${index}`} className="px-2 text-emerald-600/60 dark:text-emerald-400/60 font-semibold">
                          ...
                        </span>
                      );
                    }
                    const pageNum = item as number;
                    const isCurrent = pageNum === safePendingPage;
                    return (
                      <Button
                        key={`pending-page-${pageNum}`}
                        variant={isCurrent ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setCurrentPendingPage(pageNum)}
                        className={`h-8 w-8 cursor-pointer ${
                          isCurrent
                            ? "bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold"
                            : "border border-emerald-500/20 hover:bg-emerald-500/10"
                        }`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPendingPage((prev) => Math.min(prev + 1, totalPendingPages))}
                    disabled={safePendingPage === totalPendingPages}
                    className="h-8 px-2 border border-emerald-500/20 hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 border border-border p-4 text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <span className="text-xs">Todos los recibos de cobro importados han sido liquidados.</span>
        </div>
      )}

      {/* Generated Liquidations Table */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-foreground">Historial de Liquidaciones Generadas</CardTitle>
          <CardDescription className="text-muted-foreground text-xs mt-1">
            Consulte la planilla interactiva de liquidación por cada recibo UEP y modifique débitos, créditos o adjunte los comprobantes escaneados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchBar
            placeholder="Buscar por Obra Social, Recibo o Mes..."
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={handleSearchSubmit}
            isLoading={isLoading}
            className="mb-2"
          />
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">LIQ. N°</TableHead>
                  <TableHead className="font-semibold text-xs">Obra Social (Cliente)</TableHead>
                  <TableHead className="font-semibold text-xs">Mes Carga</TableHead>
                  <TableHead className="font-semibold text-xs">Recibo UEP</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto a Pagar</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Débitos PDF</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isLoading && "opacity-50 pointer-events-none transition-opacity duration-200")}>
                {liquidations.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-muted-foreground" />
                        <p>No se han generado liquidaciones en este período.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLiquidations.map((liq) => {
                    return (
                      <TableRow key={liq.id} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell className="font-mono text-xs font-bold text-foreground py-3.5">
                          LIQ-{String(liq.id).padStart(4, "0")}
                        </TableCell>
                        <TableCell className="text-xs font-semibold max-w-[200px] whitespace-normal break-words">
                          {liq.rc.cliente?.nombre || "Obra Social"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {liq.mesCarga || `${liq.periodMes}/${liq.periodAnio}`}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {liq.rc.puntoVenta}-{liq.rc.numero}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatCurrency(liq.totalFacturado)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(liq.netoAPagar)}
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
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold border ${
                            liq.status === "PENDIENTE"
                              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                              : liq.status === "NOTIFICADO"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          }`}>
                            {liq.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {liq.status !== "NOTIFICADO" && liq.status !== "CERRADA" && (
                              <Button
                                size="sm"
                                onClick={() => handleNotifyHospital(liq.id)}
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
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border mt-4 pt-4 gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Mostrar</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  className="bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value={5} className="bg-card text-foreground">5</option>
                  <option value={10} className="bg-card text-foreground">10</option>
                  <option value={20} className="bg-card text-foreground">20</option>
                  <option value={50} className="bg-card text-foreground">50</option>
                </select>
                <span>por página</span>
              </div>

              <div>
                Mostrando <span className="font-semibold text-foreground">{totalItems > 0 ? startIndex + 1 : 0}</span>-
                <span className="font-semibold text-foreground">{endIndex}</span> de{" "}
                <span className="font-semibold text-foreground">{totalItems}</span> liquidaciones
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                >
                  Anterior
                </Button>
                
                {getPaginationItems(currentPage, totalPages).map((item, index) => {
                  if (item === "...") {
                    return (
                      <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground font-semibold">
                        ...
                      </span>
                    );
                  }
                  const pageNum = item as number;
                  const isCurrent = pageNum === currentPage;
                  return (
                    <Button
                      key={`page-${pageNum}`}
                      variant={isCurrent ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-8 w-8 cursor-pointer ${
                        isCurrent
                          ? "bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold"
                          : "border border-border hover:bg-muted"
                      }`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
