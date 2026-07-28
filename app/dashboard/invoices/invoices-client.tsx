"use client";

import { useState, useEffect } from "react";
import { fetchPendingUnifications, fetchUnifiedInvoices, fetchInvoiceDetails, fetchPendingInvoiceDetails, unifyInvoicesForClient } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Layers, Search, Eye, CheckCircle2, RefreshCw, AlertCircle, Calendar, ShieldCheck } from "lucide-react";

interface InvoicesClientPageProps {
  initialPending: any[];
  initialUnified: any[];
  initialUnifiedCount: number;
}

export default function InvoicesClientPage({ initialPending, initialUnified, initialUnifiedCount }: InvoicesClientPageProps) {
  // Lists data
  const [pendingList, setPendingList] = useState(initialPending);
  const [unifiedList, setUnifiedList] = useState(initialUnified);
  const [totalUnifiedCount, setTotalUnifiedCount] = useState(initialUnifiedCount);

  // Loaders & Interaction States
  const [unifyingClientId, setUnifyingClientId] = useState<number | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<number | null>(null);
  const [loadingPendingDetailsId, setLoadingPendingDetailsId] = useState<number | null>(null);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState<any | null>(null);
  const [selectedPendingDetails, setSelectedPendingDetails] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [pendingModalSearchQuery, setPendingModalSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Pagination states
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingItemsPerPage, setPendingItemsPerPage] = useState(5);

  const [unifiedPage, setUnifiedPage] = useState(1);
  const [unifiedItemsPerPage, setUnifiedItemsPerPage] = useState(10);

  // Live debounced search / pagination for unified invoices history
  useEffect(() => {
    const fetchPageData = async () => {
      setIsSearching(true);
      try {
        const result = await fetchUnifiedInvoices(searchQuery, unifiedPage, unifiedItemsPerPage);
        setUnifiedList(result.invoices);
        setTotalUnifiedCount(result.totalCount);
      } catch (e) {
        // silent catch on background live search
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchPageData, searchQuery ? 250 : 0);
    return () => clearTimeout(timer);
  }, [searchQuery, unifiedPage, unifiedItemsPerPage]);

  // Refresh data from server
  const refreshData = async () => {
    try {
      const [pending, unifiedResult] = await Promise.all([
        fetchPendingUnifications(),
        fetchUnifiedInvoices(searchQuery, unifiedPage, unifiedItemsPerPage)
      ]);
      setPendingList(pending);
      setUnifiedList(unifiedResult.invoices);
      setTotalUnifiedCount(unifiedResult.totalCount);
    } catch (e) {
      setErrorMsg("Error al sincronizar datos.");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setErrorMsg("");
    try {
      const result = await fetchUnifiedInvoices(searchQuery, 1, unifiedItemsPerPage);
      setUnifiedList(result.invoices);
      setTotalUnifiedCount(result.totalCount);
      setUnifiedPage(1);
    } catch (e) {
      setErrorMsg("Error al realizar la búsqueda.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUnify = async (clienteId: number, cliName: string) => {
    setUnifyingClientId(clienteId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await unifyInvoicesForClient(clienteId);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg(`Facturas del cliente "${cliName}" consolidadas correctamente.`);
      await refreshData();
      setPendingPage(1);
      setUnifiedPage(1);
    } catch (e) {
      setErrorMsg("Error al unificar comprobantes.");
    } finally {
      setUnifyingClientId(null);
    }
  };

  const handleViewDetails = async (cbteId: number) => {
    setLoadingDetailsId(cbteId);
    setErrorMsg("");
    try {
      const res = await fetchInvoiceDetails(cbteId);
      if (!res) {
        setErrorMsg("No se pudieron cargar los detalles.");
        return;
      }
      setSelectedInvoiceDetails(res);
      setModalSearchQuery("");
      setDialogOpen(true);
    } catch (e) {
      setErrorMsg("Error de red al consultar el desglose.");
    } finally {
      setLoadingDetailsId(null);
    }
  };

  const handleViewPendingDetails = async (clienteId: number) => {
    setLoadingPendingDetailsId(clienteId);
    setErrorMsg("");
    try {
      const res = await fetchPendingInvoiceDetails(clienteId);
      if (!res) {
        setErrorMsg("No se pudieron cargar los detalles pendientes.");
        return;
      }
      setSelectedPendingDetails(res);
      setPendingModalSearchQuery("");
      setPendingDialogOpen(true);
    } catch (e) {
      setErrorMsg("Error de red al consultar el desglose pendiente.");
    } finally {
      setLoadingPendingDetailsId(null);
    }
  };

  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  // Filtered pending list as user types
  const filteredPendingList = pendingList.filter((item) => {
    if (!pendingSearchQuery.trim()) return true;
    const q = pendingSearchQuery.toLowerCase();
    return (
      (item.cliente?.nombre && item.cliente.nombre.toLowerCase().includes(q)) ||
      (item.cliente?.cuit && item.cliente.cuit.includes(q))
    );
  });

  // Pagination pending RCs logic
  const totalPendingItems = filteredPendingList.length;
  const totalPendingPages = Math.ceil(totalPendingItems / pendingItemsPerPage);
  const safePendingPage = Math.min(pendingPage, Math.max(1, totalPendingPages));
  const pendingStartIndex = (safePendingPage - 1) * pendingItemsPerPage;
  const pendingEndIndex = Math.min(pendingStartIndex + pendingItemsPerPage, totalPendingItems);
  const paginatedPending = filteredPendingList.slice(pendingStartIndex, pendingStartIndex + pendingItemsPerPage);

  // Pagination unified invoices logic
  const totalUnifiedItems = totalUnifiedCount;
  const totalUnifiedPages = Math.max(1, Math.ceil(totalUnifiedItems / unifiedItemsPerPage));
  const safeUnifiedPage = Math.min(unifiedPage, totalUnifiedPages);
  const unifiedStartIndex = (safeUnifiedPage - 1) * unifiedItemsPerPage;
  const unifiedEndIndex = Math.min(unifiedStartIndex + unifiedItemsPerPage, totalUnifiedItems);
  const paginatedUnified = unifiedList; // Already paginated from DB

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Layers className="h-8 w-8 text-emerald-500" />
          Intermediación Contable
        </h1>
        <p className="text-sm text-muted-foreground">
          Unificación y consolidación transaccional de facturas emitidas por Hospitales a Obras Sociales en el período.
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

      <Tabs defaultValue="unify" className="w-full">
        <TabsList className="bg-muted/40 border border-border p-1 rounded-xl">
          <TabsTrigger value="unify" className="text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-zinc-950 px-4 py-2 cursor-pointer rounded-lg">
            Unificación Contable
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-zinc-950 px-4 py-2 cursor-pointer rounded-lg">
            Historial de Facturas Unificadas
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Unification Area */}
        <TabsContent value="unify" className="space-y-4 mt-4">
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-foreground">Comprobantes Pendientes de Agrupar</CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                A continuación se listan las Obras Sociales que registran facturaciones individuales de hospitales (`Compras`) pendientes de consolidar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search input for pending unifications */}
              <div className="mb-4 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filtrar Obra Social pendiente por nombre o CUIT..."
                  value={pendingSearchQuery}
                  onChange={(e) => {
                    setPendingSearchQuery(e.target.value);
                    setPendingPage(1);
                  }}
                  className="pl-9 bg-muted/20 border-border text-foreground text-xs h-9 focus-visible:ring-emerald-500"
                />
              </div>

              {filteredPendingList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
                  <ShieldCheck className="h-10 w-10 text-emerald-500" />
                  <p className="text-sm">
                    {pendingSearchQuery.trim()
                      ? "No se encontraron obras sociales pendientes con esa búsqueda."
                      : "Todos los comprobantes de hospitales se encuentran consolidados y enlazados."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedPending.map((item) => {
                    const isUnifying = unifyingClientId === item.clienteId;
                    return (
                      <div
                        key={item.clienteId}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 rounded-xl border border-border bg-muted/10 hover:bg-muted/20 transition-all gap-4"
                      >
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-foreground">{item.cliente.nombre}</h4>
                          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                            <span>CUIT: <strong className="text-foreground">{item.cliente.cuit}</strong></span>
                            <span>&bull;</span>
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              {item.count} Facturas de Hospitales
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 justify-between sm:justify-end">
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Total a Consolidar</span>
                            <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(item.total)}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleViewPendingDetails(item.clienteId)}
                              disabled={loadingPendingDetailsId !== null}
                              size="sm"
                              variant="ghost"
                              className="text-xs gap-1 h-9 border border-border hover:bg-muted cursor-pointer"
                            >
                              {loadingPendingDetailsId === item.clienteId ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              Ver Desglose
                            </Button>

                            <Button
                              onClick={() => handleUnify(item.clienteId, item.cliente.nombre)}
                              disabled={unifyingClientId !== null}
                              className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1 px-4 h-9 cursor-pointer transition-all disabled:opacity-50"
                            >
                              {isUnifying ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Agrupando...
                                </>
                              ) : (
                                <>
                                  <Layers className="h-4 w-4" />
                                  Consolidar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pending Pagination controls */}
                  {totalPendingItems > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border mt-4 pt-4 gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Mostrar</span>
                        <select
                          value={pendingItemsPerPage}
                          onChange={(e) => {
                            setPendingItemsPerPage(Number(e.target.value));
                            setPendingPage(1);
                          }}
                          className="bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                        >
                          <option value={3} className="bg-card text-foreground">3</option>
                          <option value={5} className="bg-card text-foreground">5</option>
                          <option value={10} className="bg-card text-foreground">10</option>
                          <option value={20} className="bg-card text-foreground">20</option>
                        </select>
                        <span>por página</span>
                      </div>

                      <div>
                        Mostrando <span className="font-semibold text-foreground">{pendingStartIndex + 1}</span>-
                        <span className="font-semibold text-foreground">{pendingEndIndex}</span> de{" "}
                        <span className="font-semibold text-foreground">{totalPendingItems}</span> obras sociales
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingPage((prev) => Math.max(prev - 1, 1))}
                          disabled={safePendingPage === 1}
                          className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                        >
                          Anterior
                        </Button>
                        
                        {[...Array(totalPendingPages)].map((_, index) => {
                          const pageNum = index + 1;
                          const isCurrent = pageNum === safePendingPage;
                          return (
                            <Button
                              key={pageNum}
                              variant={isCurrent ? "default" : "ghost"}
                              size="sm"
                              onClick={() => setPendingPage(pageNum)}
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
                          onClick={() => setPendingPage((prev) => Math.min(prev + 1, totalPendingPages))}
                          disabled={safePendingPage === totalPendingPages}
                          className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Consolidated Invoices History */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-foreground">Búsqueda y Administración</CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                Filtre las facturas consolidadas de venta enviadas a las obras sociales. Abra el desglose de cada factura para consultar sus transacciones de origen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search Bar */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar por Obra Social o número de comprobante..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-muted/20 border-border text-foreground text-xs h-9 focus-visible:ring-emerald-500"
                  />
                </div>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-9 px-4 cursor-pointer gap-1">
                  {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </form>

              {/* Invoices Table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50 text-muted-foreground">
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="font-semibold text-xs py-3">Nro. Factura</TableHead>
                      <TableHead className="font-semibold text-xs">Obra Social (Cliente)</TableHead>
                      <TableHead className="font-semibold text-xs">Fecha Emisión</TableHead>
                      <TableHead className="font-semibold text-xs text-center">Facturas Consolidadas</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Importe Total</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unifiedList.length === 0 ? (
                      <TableRow className="border-border">
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-12">
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <p>No se encontraron facturas unificadas que coincidan con la búsqueda.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedUnified.map((inv) => {
                        const isThisLoading = loadingDetailsId === inv.id;
                        return (
                          <TableRow key={inv.id} className="hover:bg-muted/40 border-border text-foreground">
                            <TableCell className="font-mono text-xs text-foreground py-3.5">
                              {inv.puntoVenta}-{String(inv.numero).padStart(8, "0")}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{inv.cliente.nombre}</TableCell>
                            <TableCell className="text-xs">{new Date(inv.fecha).toLocaleDateString("es-AR")}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-3xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {inv.compCount} Compras
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(inv.importe)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                onClick={() => handleViewDetails(inv.id)}
                                disabled={loadingDetailsId !== null}
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1 h-8 border border-border hover:bg-muted cursor-pointer"
                              >
                                {isThisLoading ? (
                                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                                Ver Desglose
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* History Pagination controls */}
              {totalUnifiedItems > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border mt-4 pt-4 gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Mostrar</span>
                    <select
                      value={unifiedItemsPerPage}
                      onChange={(e) => {
                        setUnifiedItemsPerPage(Number(e.target.value));
                        setUnifiedPage(1);
                      }}
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
                    Mostrando <span className="font-semibold text-foreground">{unifiedStartIndex + 1}</span>-
                    <span className="font-semibold text-foreground">{unifiedEndIndex}</span> de{" "}
                    <span className="font-semibold text-foreground">{totalUnifiedItems}</span> facturas
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnifiedPage((prev) => Math.max(prev - 1, 1))}
                      disabled={safeUnifiedPage === 1}
                      className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                    >
                      Anterior
                    </Button>
                    
                    {[...Array(totalUnifiedPages)].map((_, index) => {
                      const pageNum = index + 1;
                      const isCurrent = pageNum === safeUnifiedPage;
                      return (
                        <Button
                          key={pageNum}
                          variant={isCurrent ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setUnifiedPage(pageNum)}
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
                      onClick={() => setUnifiedPage((prev) => Math.min(prev + 1, totalUnifiedPages))}
                      disabled={safeUnifiedPage === totalUnifiedPages}
                      className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Breakdown dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-5xl w-[92vw] max-h-[88vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-2 border-b border-border">
            <DialogTitle className="text-foreground font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-500" />
              Desglose de Factura Unificada
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Consulte la nómina de facturas individuales emitidas por los Hospitales que integran esta consolidación.
            </DialogDescription>
          </DialogHeader>

          {selectedInvoiceDetails && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
              {/* Header Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Obra Social (Cliente)</span>
                  <p className="font-bold text-foreground">{selectedInvoiceDetails.cbte.cliente.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">CUIT: {selectedInvoiceDetails.cbte.cliente.cuit}</p>
                </div>
                <div className="space-y-1 sm:text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Nro. de Factura Consolidada</span>
                  <p className="font-mono font-bold text-foreground text-sm">
                    {selectedInvoiceDetails.cbte.puntoVenta}-{String(selectedInvoiceDetails.cbte.numero).padStart(8, "0")}
                  </p>
                  <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                    Total: {formatCurrency(selectedInvoiceDetails.cbte.importe)}
                  </p>
                </div>
              </div>

              {/* Breakdown List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-foreground">
                    Facturas de Hospitales ({selectedInvoiceDetails.purchases.length}):
                  </h4>
                  <Input
                    type="text"
                    placeholder="Filtrar por hospital o número de factura..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="text-2xs h-7 w-64 bg-muted/20 border-border focus-visible:ring-emerald-500"
                  />
                </div>

                <div className="w-full max-h-[380px] overflow-y-auto border border-border rounded-lg">
                  <Table className="w-full">
                    <TableHeader className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-border">
                        <TableHead className="font-semibold text-2xs py-2">Hospital (Proveedor)</TableHead>
                        <TableHead className="font-semibold text-2xs">Factura Nro.</TableHead>
                        <TableHead className="font-semibold text-2xs">Fecha Emisión</TableHead>
                        <TableHead className="font-semibold text-2xs text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoiceDetails.purchases.filter((comp: any) => {
                        if (!modalSearchQuery.trim()) return true;
                        const q = modalSearchQuery.toLowerCase();
                        return (
                          (comp.hospital?.nombre && comp.hospital.nombre.toLowerCase().includes(q)) ||
                          (comp.numero && String(comp.numero).includes(q))
                        );
                      }).length === 0 ? (
                        <TableRow className="border-border">
                          <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-8">
                            No se encontraron comprobantes relacionados con la búsqueda.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedInvoiceDetails.purchases
                          .filter((comp: any) => {
                            if (!modalSearchQuery.trim()) return true;
                            const q = modalSearchQuery.toLowerCase();
                            return (
                              (comp.hospital?.nombre && comp.hospital.nombre.toLowerCase().includes(q)) ||
                              (comp.numero && String(comp.numero).includes(q))
                            );
                          })
                          .map((comp: any) => (
                            <TableRow key={comp.id} className="hover:bg-muted/20 border-border text-foreground">
                              <TableCell className="text-xs font-semibold py-2.5">
                                {comp.hospital?.nombre || "Hospital Desconocido"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {String(comp.numero).padStart(8, "0")}
                              </TableCell>
                              <TableCell className="text-xs">
                                {new Date(comp.fecha).toLocaleDateString("es-AR")}
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-foreground">
                                {formatCurrency(comp.importe)}
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <Button onClick={() => setDialogOpen(false)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-9 cursor-pointer">
              Cerrar Vista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Pre-consolidation Breakdown dialog */}
      <Dialog open={pendingDialogOpen} onOpenChange={setPendingDialogOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-5xl w-[92vw] max-h-[88vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-2 border-b border-border">
            <DialogTitle className="text-foreground font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-500" />
              Vista Previa de Comprobantes a Consolidar
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Examine los comprobantes individuales de hospitales pendientes de unificación para esta Obra Social antes de generar la factura.
            </DialogDescription>
          </DialogHeader>

          {selectedPendingDetails && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
              {/* Header Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Obra Social (Cliente)</span>
                  <p className="font-bold text-foreground">{selectedPendingDetails.cliente.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">CUIT: {selectedPendingDetails.cliente.cuit}</p>
                </div>
                <div className="space-y-1 sm:text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Pendiente a Consolidar</span>
                  <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(selectedPendingDetails.total)}
                  </p>
                </div>
              </div>

              {/* Breakdown List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-foreground">
                    Facturas de Hospitales Pendientes ({selectedPendingDetails.purchases.length}):
                  </h4>
                  <Input
                    type="text"
                    placeholder="Filtrar por hospital o número de factura..."
                    value={pendingModalSearchQuery}
                    onChange={(e) => setPendingModalSearchQuery(e.target.value)}
                    className="text-2xs h-7 w-64 bg-muted/20 border-border focus-visible:ring-emerald-500"
                  />
                </div>

                <div className="w-full max-h-[380px] overflow-y-auto border border-border rounded-lg">
                  <Table className="w-full">
                    <TableHeader className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-border">
                        <TableHead className="font-semibold text-2xs py-2">Hospital (Proveedor)</TableHead>
                        <TableHead className="font-semibold text-2xs">Factura Nro.</TableHead>
                        <TableHead className="font-semibold text-2xs">Fecha Emisión</TableHead>
                        <TableHead className="font-semibold text-2xs text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPendingDetails.purchases.filter((comp: any) => {
                        if (!pendingModalSearchQuery.trim()) return true;
                        const q = pendingModalSearchQuery.toLowerCase();
                        return (
                          (comp.hospital?.nombre && comp.hospital.nombre.toLowerCase().includes(q)) ||
                          (comp.numero && String(comp.numero).includes(q))
                        );
                      }).length === 0 ? (
                        <TableRow className="border-border">
                          <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-8">
                            No se encontraron comprobantes pendientes con la búsqueda.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedPendingDetails.purchases
                          .filter((comp: any) => {
                            if (!pendingModalSearchQuery.trim()) return true;
                            const q = pendingModalSearchQuery.toLowerCase();
                            return (
                              (comp.hospital?.nombre && comp.hospital.nombre.toLowerCase().includes(q)) ||
                              (comp.numero && String(comp.numero).includes(q))
                            );
                          })
                          .map((comp: any) => (
                            <TableRow key={comp.id} className="hover:bg-muted/20 border-border text-foreground">
                              <TableCell className="text-xs font-semibold py-2.5">
                                {comp.hospital?.nombre || "Hospital Desconocido"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {String(comp.numero).padStart(8, "0")}
                              </TableCell>
                              <TableCell className="text-xs">
                                {new Date(comp.fecha).toLocaleDateString("es-AR")}
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold text-foreground">
                                {formatCurrency(comp.importe)}
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-2 border-t border-border flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setPendingDialogOpen(false)} className="border border-border cursor-pointer text-xs h-9">
              Cerrar Vista
            </Button>
            {selectedPendingDetails && (
              <Button
                onClick={async () => {
                  setPendingDialogOpen(false);
                  await handleUnify(selectedPendingDetails.cliente.id, selectedPendingDetails.cliente.nombre);
                }}
                disabled={unifyingClientId !== null}
                className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1 text-xs h-9 cursor-pointer"
              >
                <Layers className="h-4 w-4" />
                Consolidar Ahora
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
