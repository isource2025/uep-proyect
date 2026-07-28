"use client";

import { useState, useEffect } from "react";
import { fetchLiquidationData, calculateLiquidation, updateLiquidationDetails, uploadDebitsFile, notifyHospital } from "./actions";
import { cn } from "@/lib/utils";
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
  const [data, setData] = useState(initialData);
  const [totalCount, setTotalCount] = useState(initialData.totalLiquidationsCount);
  const [totalPendingCount, setTotalPendingCount] = useState(initialData.totalPendingRcsCount);
  const [isLoading, setIsLoading] = useState(false);

  const [calculatingRcId, setCalculatingRcId] = useState<number | null>(null);
  const [savingLiqId, setSavingLiqId] = useState<number | null>(null);
  const [notifyingLiqId, setNotifyingLiqId] = useState<number | null>(null);
  const [uploadingLiqId, setUploadingLiqId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedLiqModal, setSelectedLiqModal] = useState<any | null>(null);

  const handleNotifyHospital = async (liqId: number) => {
    setNotifyingLiqId(liqId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await notifyHospital(liqId);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Hospitales notificados y correo simulado enviado con éxito.");
      await loadData();
      setSelectedLiqModal(null);
    } catch (e: any) {
      setErrorMsg("Error al notificar a los establecimientos.");
    } finally {
      setNotifyingLiqId(null);
    }
  };

  // Editable form state for modal
  const [editableDetails, setEditableDetails] = useState<any[]>([]);

  // Pagination states for generated liquidations list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Pagination states for pending RCs list
  const [currentPendingPage, setCurrentPendingPage] = useState(1);
  const [pendingItemsPerPage, setPendingItemsPerPage] = useState(5);

  // Fetch paginated lists from database on page/limits state changes
  useEffect(() => {
    const fetchPageData = async () => {
      setIsLoading(true);
      try {
        const res = await fetchLiquidationData(currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage);
        setData(res);
        setTotalCount(res.totalLiquidationsCount);
        setTotalPendingCount(res.totalPendingRcsCount);
      } catch (e) {
        // silent catch
      } finally {
        setIsLoading(false);
      }
    };
    fetchPageData();
  }, [currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchLiquidationData(currentPage, itemsPerPage, currentPendingPage, pendingItemsPerPage);
      setData(res);
      setTotalCount(res.totalLiquidationsCount);
      setTotalPendingCount(res.totalPendingRcsCount);
    } catch (e: any) {
      setErrorMsg("Error al actualizar la lista de liquidaciones.");
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

  const handleOpenLiquidationModal = (liq: any) => {
    setSelectedLiqModal(liq);
    // Initialize editable rows
    setEditableDetails(
      liq.details.map((d: any) => ({
        id: d.id,
        totalFacturado: Number(d.totalFacturado),
        creditos: Number(d.creditos),
        debitos: Number(d.debitos),
        ajustesOs: Number(d.ajustesOs),
        pendientesCobro: Number(d.pendientesCobro),
        ga: Number(d.ga),
        ajusteRecupero: Number(d.ajusteRecupero),
      }))
    );
  };

  const handleDetailInputChange = (id: string, field: string, value: number) => {
    setEditableDetails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveDetails = async (liqId: number) => {
    setSavingLiqId(liqId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await updateLiquidationDetails(liqId, editableDetails);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Liquidación y ajustes guardados correctamente.");
      await loadData();
      setSelectedLiqModal(null);
    } catch (e: any) {
      setErrorMsg("Error al guardar los ajustes de liquidación.");
    } finally {
      setSavingLiqId(null);
    }
  };

  const handleFileUpload = async (liqId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setErrorMsg("Solo se permiten archivos en formato PDF para el detalle de débitos.");
      return;
    }

    setUploadingLiqId(liqId);
    setErrorMsg("");
    setSuccessMsg("");

    const formData = new FormData();
    formData.append("liquidationId", String(liqId));
    formData.append("file", file);

    try {
      const res = await uploadDebitsFile(formData);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Comprobante escaneado de débitos adjuntado correctamente.");
      await loadData();
      
      // Update local modal if open
      if (selectedLiqModal && selectedLiqModal.id === liqId) {
        setSelectedLiqModal((prev: any) => ({
          ...prev,
          debitsFileUrl: res.fileUrl,
          debitsFileName: res.fileName,
        }));
      }
    } catch (e: any) {
      setErrorMsg("Error al subir el archivo escaneado.");
    } finally {
      setUploadingLiqId(null);
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
      {pendingRcs.length > 0 ? (
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
              {paginatedPendingRcs.map((rc) => {
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
              })}
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
                  
                  {[...Array(totalPendingPages)].map((_, index) => {
                    const pageNum = index + 1;
                    const isCurrent = pageNum === safePendingPage;
                    return (
                      <Button
                        key={pageNum}
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
                        <TableCell className="text-xs font-semibold">
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
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            {liq.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleOpenLiquidationModal(liq)}
                            size="sm"
                            variant="ghost"
                            className="text-xs gap-1 h-8 border border-border hover:bg-muted cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-emerald-500" />
                            Ver / Editar Liquidación
                          </Button>
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
                
                {[...Array(totalPages)].map((_, index) => {
                  const pageNum = index + 1;
                  const isCurrent = pageNum === currentPage;
                  return (
                    <Button
                      key={pageNum}
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

      {/* SECTION 1 - IMAGE 1: Interactive 2-Section Liquidation Detail Modal */}
      {selectedLiqModal && (
        <Dialog open={!!selectedLiqModal} onOpenChange={(open) => !open && setSelectedLiqModal(null)}>
          <DialogContent className="border-border bg-card text-card-foreground sm:max-w-6xl w-[96vw] max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0 pb-3 border-b border-border">
              <DialogTitle className="text-lg font-bold text-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-emerald-500" />
                  Planilla de Liquidación y Débitos (LIQ-{String(selectedLiqModal.id).padStart(4, "0")})
                </div>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Complete los campos de débitos, créditos, GA y ajustes por recupero para cada hospital incluido en este período.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-5 py-3 pr-1">
              {/* SECCIÓN 1 - CABECERA DE LIQUIDACIÓN */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">LIQ. N°</span>
                  <p className="font-mono font-bold text-foreground text-sm">LIQ-{String(selectedLiqModal.id).padStart(4, "0")}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">RECIBO UEP</span>
                  <p className="font-mono font-bold text-foreground text-sm">{selectedLiqModal.rc.puntoVenta}-{selectedLiqModal.rc.numero}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedLiqModal.rc.cliente?.nombre}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">MES CARGA</span>
                  <p className="font-bold text-foreground text-sm">{selectedLiqModal.mesCarga || `${selectedLiqModal.periodMes}/${selectedLiqModal.periodAnio}`}</p>
                </div>

                {/* PDF DEBITS UPLOAD MODULE */}
                <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold flex items-center gap-1">
                    <UploadCloud className="h-3.5 w-3.5" />
                    Detalle Débitos Escaneados (Obra Social)
                  </span>
                  
                  {selectedLiqModal.debitsFileUrl ? (
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <a
                        href={selectedLiqModal.debitsFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1 truncate"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedLiqModal.debitsFileName || "Ver PDF Escaneado"}</span>
                      </a>
                      <label className="text-3xs text-muted-foreground hover:text-foreground cursor-pointer underline shrink-0">
                        Cambiar
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => handleFileUpload(selectedLiqModal.id, e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <label className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-card border border-emerald-500/30 hover:bg-emerald-500/10 rounded-md py-1.5 px-3 cursor-pointer transition-colors">
                        {uploadingLiqId === selectedLiqModal.id ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Subiendo PDF...
                          </>
                        ) : (
                          <>
                            <UploadCloud className="h-3.5 w-3.5" />
                            Adjuntar Escaneado PDF
                          </>
                        )}
                        <input
                          type="file"
                          accept=".pdf"
                          disabled={uploadingLiqId !== null}
                          onChange={(e) => handleFileUpload(selectedLiqModal.id, e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* SECCIÓN 2 - TABLA GRANDE DE LIQUIDACIÓN POR HOSPITAL (EXCEL IMAGE 1) */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-emerald-500" />
                  Renglones de Liquidación por Hospital / Prestador:
                </h4>

                <div className="w-full max-h-[420px] overflow-y-auto overflow-x-auto border border-border rounded-xl">
                  <Table className="w-full min-w-[1300px] text-xs">
                    <TableHeader className="bg-muted/60 text-muted-foreground sticky top-0 z-10 shadow-xs">
                      <TableRow className="hover:bg-transparent border-border">
                        <TableHead className="font-bold text-2xs py-3">OBRA SOCIAL</TableHead>
                        <TableHead className="font-bold text-2xs">PERIODO</TableHead>
                        <TableHead className="font-bold text-2xs">CUIT N°</TableHead>
                        <TableHead className="font-bold text-2xs">PRESTADOR (HOSPITAL)</TableHead>
                        <TableHead className="font-bold text-2xs">LOCALIDAD</TableHead>
                        <TableHead className="font-bold text-2xs">FC N° HOSPITAL</TableHead>
                        <TableHead className="font-bold text-2xs text-right">TOTAL FACTURADO</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-emerald-500">CRÉDITOS (+)</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-red-500">DÉBITOS (-)</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-amber-500">AJUSTES O.S.</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-orange-500">PENDIENTES COBRO (-)</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-emerald-400">BRUTO A PAGAR</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-blue-400">GA (-)</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-purple-400">AJUSTE RECUPERO (+)</TableHead>
                        <TableHead className="font-bold text-2xs text-right text-emerald-400">NETO A PAGAR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLiqModal.details.map((detail: any, idx: number) => {
                        const editState = editableDetails.find((e) => e.id === detail.id) || {
                          totalFacturado: Number(detail.totalFacturado),
                          creditos: Number(detail.creditos),
                          debitos: Number(detail.debitos),
                          ajustesOs: Number(detail.ajustesOs),
                          pendientesCobro: Number(detail.pendientesCobro),
                          ga: Number(detail.ga),
                          ajusteRecupero: Number(detail.ajusteRecupero),
                        };

                        // Real-time calculation
                        const bruto =
                          editState.totalFacturado +
                          editState.creditos -
                          editState.debitos +
                          editState.ajustesOs -
                          editState.pendientesCobro;
                        
                        const neto = bruto - editState.ga + editState.ajusteRecupero;

                        return (
                          <TableRow key={detail.id} className="hover:bg-muted/20 border-border text-foreground">
                            <TableCell className="font-semibold text-2xs py-2">
                              {detail.cliente?.nombre || selectedLiqModal.rc.cliente?.nombre || "OSDE"}
                            </TableCell>
                            <TableCell className="text-2xs font-mono">{detail.periodo || selectedLiqModal.mesCarga}</TableCell>
                            <TableCell className="text-2xs font-mono">{detail.cuit || detail.hospital?.cuit || "-"}</TableCell>
                            <TableCell className="font-bold text-xs">{detail.prestadorNombre || detail.hospital?.nombre}</TableCell>
                            <TableCell className="text-2xs">{detail.localidad || detail.hospital?.code || "CAPITAL"}</TableCell>
                            <TableCell className="text-2xs font-mono">{detail.fcHospital || `FC-${detail.compraId}`}</TableCell>
                            
                            {/* TOTAL FACTURADO */}
                            <TableCell className="text-right font-semibold text-xs">
                              {formatCurrency(editState.totalFacturado)}
                            </TableCell>

                            {/* CRÉDITOS */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.creditos}
                                onChange={(e) => handleDetailInputChange(detail.id, "creditos", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-emerald-600 focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* DÉBITOS */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.debitos}
                                onChange={(e) => handleDetailInputChange(detail.id, "debitos", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-red-600 focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* AJUSTES OS */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.ajustesOs}
                                onChange={(e) => handleDetailInputChange(detail.id, "ajustesOs", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* PENDIENTES COBRO */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.pendientesCobro}
                                onChange={(e) => handleDetailInputChange(detail.id, "pendientesCobro", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-orange-600 focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* BRUTO A PAGAR (CALCULADO) */}
                            <TableCell className="text-right font-extrabold text-xs text-foreground">
                              {formatCurrency(bruto)}
                            </TableCell>

                            {/* GA (GASTOS ADMINISTRATIVOS) */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.ga}
                                onChange={(e) => handleDetailInputChange(detail.id, "ga", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-blue-600 focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* AJUSTE POR RECUPERO */}
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={editState.ajusteRecupero}
                                onChange={(e) => handleDetailInputChange(detail.id, "ajusteRecupero", Number(e.target.value))}
                                className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-purple-600 focus-visible:ring-emerald-500"
                              />
                            </TableCell>

                            {/* NETO A PAGAR (CALCULADO FINAL) */}
                            <TableCell className="text-right font-extrabold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                              {formatCurrency(neto)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 pt-3 border-t border-border flex flex-col sm:flex-row justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setSelectedLiqModal(null)}
                className="border-border cursor-pointer text-xs h-9"
              >
                Cerrar Vista
              </Button>

              <div className="flex gap-2">
                {selectedLiqModal.status !== "NOTIFICADO" && selectedLiqModal.status !== "CERRADA" && (
                  <Button
                    onClick={() => handleNotifyHospital(selectedLiqModal.id)}
                    disabled={notifyingLiqId !== null || savingLiqId !== null}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1 px-4 h-9 cursor-pointer text-xs"
                  >
                    {notifyingLiqId === selectedLiqModal.id ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Notificando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Notificar Hospital
                      </>
                    )}
                  </Button>
                )}

                <Button
                  onClick={() => handleSaveDetails(selectedLiqModal.id)}
                  disabled={savingLiqId !== null || notifyingLiqId !== null}
                  className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1 px-6 h-9 cursor-pointer text-xs"
                >
                  {savingLiqId === selectedLiqModal.id ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Guardando Ajustes...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Guardar Ajustes de Liquidación
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
