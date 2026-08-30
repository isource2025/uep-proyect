"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calculator,
  FileText,
  UploadCloud,
  RefreshCw,
  CheckCircle2,
  Save,
  ArrowLeft,
  AlertCircle,
  FileDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLiquidationDetails, uploadDebitsFile, deleteDebitsFile, notifyHospital } from "../actions";

interface LiquidationDetailClientProps {
  liquidation: any;
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
    hospitalId?: number | null;
  };
}

export default function LiquidationDetailClient({
  liquidation,
  currentUser,
}: LiquidationDetailClientProps) {
  const router = useRouter();
  const isHospitalUser = currentUser?.role !== "1" && currentUser?.hospitalId !== undefined && currentUser?.hospitalId !== null;

  // Loading and feedback states
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [goingBack, setGoingBack] = useState(false);

  const getInputDisplayValue = (val: any) => {
    if (val === 0 || val === "0" || val === "") return "";
    return val;
  };

  // Store current liquidation state locally to dynamically display updates
  const [liq, setLiq] = useState(liquidation);
  const [mesCarga, setMesCarga] = useState(liq.mesCarga || "");

  // Initialise editable detail rows ensuring no negative values (minimum is 0)
  const [editableDetails, setEditableDetails] = useState<any[]>(
    liq.details.map((d: any) => ({
      id: d.id,
      totalFacturado: Math.max(0, Number(d.totalFacturado)),
      creditos: Math.max(0, Number(d.creditos)),
      debitos: Math.max(0, Number(d.debitos)),
      ajustesOs: Math.max(0, Number(d.ajustesOs)),
      pendientesCobro: Math.max(0, Number(d.pendientesCobro)),
      ga: Math.max(0, Number(d.ga)),
      ajusteRecupero: Math.max(0, Number(d.ajusteRecupero)),
    }))
  );

  const handleDetailInputChange = (id: string, field: string, value: string) => {
    if (value === "") {
      setEditableDetails((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: "" } : item))
      );
      return;
    }

    const num = Number(value);
    if (num < 0) {
      setEditableDetails((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: 0 } : item))
      );
      return;
    }

    setEditableDetails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const parsedDetails = editableDetails.map((item) => ({
        ...item,
        totalFacturado: Number(item.totalFacturado || 0),
        creditos: Number(item.creditos || 0),
        debitos: Number(item.debitos || 0),
        ajustesOs: Number(item.ajustesOs || 0),
        pendientesCobro: Number(item.pendientesCobro || 0),
        ga: Number(item.ga || 0),
        ajusteRecupero: Number(item.ajusteRecupero || 0),
      }));

      const res = await updateLiquidationDetails(liq.id, parsedDetails, undefined, mesCarga);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Liquidación y ajustes guardados correctamente.");
      router.push("/dashboard/liquidations");
      router.refresh();
    } catch (e: any) {
      setErrorMsg("Error al guardar los ajustes de liquidación.");
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyHospital = async () => {
    setNotifying(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await notifyHospital(liq.id);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Hospitales notificados y correo simulado enviado con éxito.");

      // Update local status representation
      setLiq((prev: any) => ({ ...prev, status: "NOTIFICADO" }));
    } catch (e: any) {
      setErrorMsg("Error al notificar a los establecimientos.");
    } finally {
      setNotifying(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setErrorMsg("Solo se permiten archivos en formato PDF para el detalle de débitos.");
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append("liquidationId", String(liq.id));
    formData.append("file", file);

    try {
      const res = await uploadDebitsFile(formData);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Comprobante escaneado de débitos adjuntado correctamente.");

      // Update local state with the uploaded file
      setLiq((prev: any) => ({
        ...prev,
        debitsFileUrl: res.fileUrl,
        debitsFileName: res.fileName,
      }));
    } catch (e: any) {
      setErrorMsg("Error al subir el archivo escaneado.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!confirm("¿Está seguro de que desea eliminar el archivo PDF adjunto?")) return;

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await deleteDebitsFile(liq.id);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Comprobante escaneado de débitos eliminado correctamente.");

      // Update local state
      setLiq((prev: any) => ({
        ...prev,
        debitsFileUrl: null,
        debitsFileName: null,
      }));
    } catch (e: any) {
      setErrorMsg("Error al eliminar el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  const displayedDetails = isHospitalUser
    ? liq.details.filter(
        (d: any) =>
          d.hospitalId === currentUser?.hospitalId ||
          (d.prestadorNombre && currentUser?.name && d.prestadorNombre.toLowerCase().trim().includes(currentUser.name.toLowerCase().trim())) ||
          (currentUser?.name && d.prestadorNombre && currentUser.name.toLowerCase().trim().includes(d.prestadorNombre.toLowerCase().trim()))
      )
    : liq.details;

  const currentDetails = displayedDetails.length > 0 ? displayedDetails : liq.details;

  return (
    <div className="space-y-6 text-foreground">
      {/* HEADER ACTIONS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setGoingBack(true);
              if (isHospitalUser) {
                router.push("/dashboard/hospital-portal");
              } else {
                router.push("/dashboard/liquidations");
              }
            }}
            disabled={goingBack || saving}
            className="border-border cursor-pointer text-xs h-9 flex items-center gap-1.5"
          >
            {goingBack ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
            {isHospitalUser ? "Volver al Portal" : "Volver a Liquidaciones"}
          </Button>
          <div>
            <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <Calculator className="h-5 w-5 text-emerald-500" />
              Planilla de Liquidación y Débitos (LIQ-{String(liq.id).padStart(4, "0")})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isHospitalUser
                ? `Liquidación asignada a ${currentUser?.name || "Hospital"}`
                : "Administración de débitos, créditos, GA y ajustes por recupero para la Obra Social."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          {liq.debitsFileUrl && (
            <a
              href={liq.debitsFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs transition-colors shadow-sm"
            >
              <FileDown className="h-4 w-4" />
              Descargar PDF Débitos
            </a>
          )}
          <span className={`text-2xs font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
            liq.status === "PENDIENTE"
              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
              : liq.status === "NOTIFICADO"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
          }`}>
            {liq.status}
          </span>
        </div>
      </div>

      {/* FEEDBACK MESSAGES */}
      {errorMsg && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* SECTION 1 - CABECERA DE LIQUIDACIÓN */}
      <Card className="border-border bg-card">
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-4 gap-6 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Liquidación N°</span>
            <p className="font-mono font-bold text-foreground text-sm">LIQ-{String(liq.id).padStart(4, "0")}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Recibo UEP</span>
            <p className="font-mono font-bold text-foreground text-sm">{liq.rc.puntoVenta}-{liq.rc.numero}</p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{liq.rc.cliente?.nombre}</p>
            
            {/* FC Ventas unificadas associated with this receipt */}
            {liq.rc?.appliedAsRc && liq.rc.appliedAsRc.length > 0 && (
              <div className="mt-2 bg-muted/40 p-2 rounded-lg border border-border/30 text-[10px] space-y-1 max-h-[100px] overflow-y-auto">
                <span className="text-[9px] text-muted-foreground uppercase font-bold block">FC Ventas Asociadas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {liq.rc.appliedAsRc.map((app: any) => {
                    const fc = app.fc;
                    if (!fc) return null;
                    return (
                      <span key={app.id} className="inline-block px-1.5 py-0.5 bg-background border border-border/40 font-mono font-bold text-foreground rounded text-3xs">
                        {fc.puntoVenta}-{String(fc.numero).padStart(8, "0")}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 flex flex-col justify-start">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">Mes Carga</Label>
            <Input
              type="text"
              value={mesCarga}
              onChange={(e) => setMesCarga(e.target.value)}
              placeholder="e.g. 06/2026"
              className="h-8 text-xs bg-background border-border font-semibold text-foreground max-w-[140px]"
            />
          </div>

          {/* PDF DEBITS UPLOAD MODULE */}
          <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 self-center">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold flex items-center gap-1">
              <UploadCloud className="h-3.5 w-3.5" />
              Detalle Débitos Escaneados (Obra Social)
            </span>

            {liq.debitsFileUrl ? (
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <a
                  href={liq.debitsFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1 truncate"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{liq.debitsFileName || "Ver PDF Escaneado"}</span>
                </a>
                <div className="flex items-center gap-2 shrink-0 text-3xs">
                  <label className="text-muted-foreground hover:text-foreground cursor-pointer underline">
                    Cambiar
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={handleDeleteFile}
                    className="text-red-500 hover:text-red-400 cursor-pointer underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5">
                <label className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-card border border-emerald-500/30 hover:bg-emerald-500/10 rounded-md py-1.5 px-3 cursor-pointer transition-colors">
                  {uploading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Subiendo archivo...
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
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2 - TABLA GRANDE DE LIQUIDACIÓN POR HOSPITAL (PLANILLA EXCEL) */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border/80 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-emerald-500" />
              Renglones de Liquidación por Hospital / Prestador
            </CardTitle>
            <CardDescription className="text-3xs text-muted-foreground mt-0.5">
              Complete las celdas numéricas. Los totales neto y bruto se recalculan de forma segura e instantánea.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* MOBILE & TABLET LAYOUT: Stacked Cards Grid (hidden on desktop) */}
          <div className="block lg:hidden p-4 space-y-4">
            {currentDetails.map((detail: any) => {
              const editState = editableDetails.find((e) => e.id === detail.id) || {
                totalFacturado: Number(detail.totalFacturado),
                creditos: Number(detail.creditos),
                debitos: Number(detail.debitos),
                ajustesOs: Number(detail.ajustesOs),
                pendientesCobro: Number(detail.pendientesCobro),
                ga: Number(detail.ga),
                ajusteRecupero: Number(detail.ajusteRecupero),
              };

              const bruto = Math.max(
                0,
                editState.totalFacturado +
                editState.creditos -
                editState.debitos +
                editState.ajustesOs -
                editState.pendientesCobro
              );

              const neto = Math.max(0, bruto - editState.ga + editState.ajusteRecupero);

              return (
                <div key={detail.id} className="rounded-xl border border-border bg-muted/10 p-4 space-y-4 text-foreground">
                  {/* Header: Hospital Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-2.5 gap-1.5">
                    <div>
                      <h5 className="font-bold text-sm text-foreground flex items-center gap-1.5 whitespace-normal break-words">
                        <Building2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        {detail.prestadorNombre || detail.hospital?.nombre || "Hospital"}
                      </h5>
                      <p className="text-3xs font-semibold text-muted-foreground mt-0.5">
                        Período FC Compra: <span className="text-foreground font-bold">{detail.periodo || liq.mesCarga}</span>
                      </p>
                      <p className="text-3xs text-muted-foreground mt-0.5">
                        CUIT: {detail.cuit || detail.hospital?.cuit || "-"} &bull; Localidad: {detail.localidad || detail.hospital?.code || "CAPITAL"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-3xs font-mono text-muted-foreground self-start sm:self-center">
                      <span>FC Hospital: <strong className="text-foreground">{detail.fcHospital || `FC-${detail.compraId}`}</strong></span>
                    </div>
                  </div>

                  {/* Calculations & Inputs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {/* Total Facturado */}
                    <div className="space-y-1 bg-muted/40 p-2.5 rounded-lg border border-border/30 flex flex-col justify-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Facturado</span>
                      <p className="font-bold text-foreground text-sm">{formatCurrency(editState.totalFacturado)}</p>
                    </div>

                    {/* Créditos */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Créditos (+)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.creditos)}
                        onChange={(e) => handleDetailInputChange(detail.id, "creditos", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-emerald-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Débitos */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Débitos (-)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.debitos)}
                        onChange={(e) => handleDetailInputChange(detail.id, "debitos", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-red-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Ajustes OS */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Ajustes OS (5%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.ajustesOs)}
                        onChange={(e) => handleDetailInputChange(detail.id, "ajustesOs", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-amber-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Pendientes Cobro */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Pendientes Cobro (-)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.pendientesCobro)}
                        onChange={(e) => handleDetailInputChange(detail.id, "pendientesCobro", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-orange-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Bruto a Pagar */}
                    <div className="space-y-1 bg-muted/40 p-2.5 rounded-lg border border-border/30 flex flex-col justify-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">Bruto a Pagar</span>
                      <p className="font-bold text-foreground text-sm">{formatCurrency(bruto)}</p>
                    </div>

                    {/* GA */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">GA (6%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.ga)}
                        onChange={(e) => handleDetailInputChange(detail.id, "ga", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-blue-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Ajuste Recupero */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Ajuste Recupero (+)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isHospitalUser || saving}
                        value={getInputDisplayValue(editState.ajusteRecupero)}
                        onChange={(e) => handleDetailInputChange(detail.id, "ajusteRecupero", e.target.value)}
                        className="w-full h-8 text-xs bg-background border-border font-semibold text-purple-600 focus-visible:ring-emerald-500 disabled:opacity-75 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  {/* Neto a Pagar Row */}
                  <div className="flex justify-end items-center gap-3 pt-3 border-t border-border/50 text-xs">
                    <span className="text-muted-foreground font-semibold">Neto a Pagar:</span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(neto)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP LAYOUT: Highly Compact Excel-like Spreadsheet (hidden on mobile/tablet) */}
          <div className="hidden lg:block w-full max-h-[550px] overflow-y-auto">
            <Table className="w-full text-2xs border-collapse table-fixed">
              <TableHeader className="bg-muted text-muted-foreground sticky top-0 z-10 border-b border-border">
                <TableRow className="bg-muted hover:bg-muted border-border">
                  <TableHead className="font-bold text-2xs px-2 py-2 w-[220px] whitespace-normal break-words leading-tight align-middle text-muted-foreground bg-muted">PRESTADOR / DETALLES</TableHead>
                  <TableHead className="font-bold text-2xs px-2 py-2 text-right w-[110px] whitespace-normal break-words leading-tight align-middle text-muted-foreground bg-muted">TOTAL FACTURADO</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-emerald-500 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">CRÉDITOS</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-red-500 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">DÉBITOS</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-amber-500 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">AJUSTE OS (5%)</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-orange-500 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">PENDIENTES COBRO</TableHead>
                  <TableHead className="font-bold text-2xs px-2 py-2 text-right text-emerald-400 w-[110px] whitespace-normal break-words leading-tight align-middle bg-muted">BRUTO A PAGAR</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-blue-400 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">GA (6%)</TableHead>
                  <TableHead className="font-bold text-2xs px-1.5 py-2 text-right text-purple-400 w-[95px] whitespace-normal break-words leading-tight align-middle bg-muted">AJUSTE RECUPERO</TableHead>
                  <TableHead className="font-bold text-2xs px-2 py-2 text-right text-emerald-400 font-extrabold w-[110px] whitespace-normal break-words leading-tight align-middle bg-muted">NETO A PAGAR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentDetails.map((detail: any) => {
                  const editState = editableDetails.find((e) => e.id === detail.id) || {
                    totalFacturado: Number(detail.totalFacturado),
                    creditos: Number(detail.creditos),
                    debitos: Number(detail.debitos),
                    ajustesOs: Number(detail.ajustesOs),
                    pendientesCobro: Number(detail.pendientesCobro),
                    ga: Number(detail.ga),
                    ajusteRecupero: Number(detail.ajusteRecupero),
                  };

                  const bruto = Math.max(
                    0,
                    editState.totalFacturado +
                    editState.creditos -
                    editState.debitos +
                    editState.ajustesOs -
                    editState.pendientesCobro
                  );

                  const neto = Math.max(0, bruto - editState.ga + editState.ajusteRecupero);

                  return (
                    <TableRow key={detail.id} className="hover:bg-muted/10 border-border text-foreground">
                      {/* PRESTADOR / DETALLES MERGED METADATA */}
                      <TableCell className="px-2 py-1.5">
                        <div className="space-y-0.5">
                          <div className="font-bold text-2xs text-foreground whitespace-normal break-words leading-tight">
                            {detail.prestadorNombre || detail.hospital?.nombre}
                          </div>
                          <div className="text-4xs font-semibold text-muted-foreground font-mono mt-0.5">
                            Período FC Compra: <span className="text-foreground font-bold">{detail.periodo || liq.mesCarga}</span>
                          </div>
                          <div className="text-4xs text-muted-foreground font-mono flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                            <span>CUIT: {detail.cuit || detail.hospital?.cuit || "-"}</span>
                            <span>&bull;</span>
                            <span>{detail.localidad || detail.hospital?.code || "CAPITAL"}</span>
                          </div>
                          <div className="text-4xs font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                            FC Hosp: {detail.fcHospital || `FC-${detail.compraId}`}
                          </div>
                        </div>
                      </TableCell>

                      {/* TOTAL FACTURADO */}
                      <TableCell className="text-right font-semibold text-2xs px-2 py-1.5">
                        {formatCurrency(editState.totalFacturado)}
                      </TableCell>

                      {/* CRÉDITOS */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.creditos)}
                          onChange={(e) => handleDetailInputChange(detail.id, "creditos", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-emerald-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* DÉBITOS */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.debitos)}
                          onChange={(e) => handleDetailInputChange(detail.id, "debitos", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-red-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* AJUSTES OS */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.ajustesOs)}
                          onChange={(e) => handleDetailInputChange(detail.id, "ajustesOs", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-amber-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* PENDIENTES COBRO */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.pendientesCobro)}
                          onChange={(e) => handleDetailInputChange(detail.id, "pendientesCobro", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-orange-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* BRUTO A PAGAR */}
                      <TableCell className="text-right font-extrabold text-2xs px-2 py-1">
                        {formatCurrency(bruto)}
                      </TableCell>

                      {/* GA */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.ga)}
                          onChange={(e) => handleDetailInputChange(detail.id, "ga", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-blue-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* AJUSTE RECUPERO */}
                      <TableCell className="text-right px-1 py-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isHospitalUser || saving}
                          value={getInputDisplayValue(editState.ajusteRecupero)}
                          onChange={(e) => handleDetailInputChange(detail.id, "ajusteRecupero", e.target.value)}
                          className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-purple-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </TableCell>

                      {/* NETO A PAGAR */}
                      <TableCell className="text-right font-extrabold text-2xs px-2 py-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded">
                        {formatCurrency(neto)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* FOOTER ACTIONS BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border border-border rounded-xl bg-muted/20">
        <Button
          variant="outline"
          onClick={() => {
            setGoingBack(true);
            if (isHospitalUser) {
              router.push("/dashboard/hospital-portal");
            } else {
              router.push("/dashboard/liquidations");
            }
          }}
          disabled={goingBack || saving}
          className="border-border cursor-pointer text-xs h-9"
        >
          {goingBack ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Cargando Lista...
            </>
          ) : (
            isHospitalUser ? "Volver a Mis Liquidaciones" : "Volver a la Lista"
          )}
        </Button>

        {!isHospitalUser && (
          <div className="flex gap-2">
            <Button
              onClick={handleSaveDetails}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1.5 px-6 h-9 cursor-pointer text-xs"
            >
              {saving ? (
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
        )}
      </div>
    </div>
  );
}
