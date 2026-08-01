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
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLiquidationDetails, uploadDebitsFile, deleteDebitsFile, notifyHospital } from "../actions";

interface LiquidationDetailClientProps {
  liquidation: any;
}

export default function LiquidationDetailClient({ liquidation }: LiquidationDetailClientProps) {
  const router = useRouter();
  
  // Loading and feedback states
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Store current liquidation state locally to dynamically display updates
  const [liq, setLiq] = useState(liquidation);

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

  const handleDetailInputChange = (id: string, field: string, value: number) => {
    // Prevent negative numbers (0 is the minimum)
    const clampedValue = Math.max(0, value);
    setEditableDetails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: clampedValue } : item))
    );
  };

  const handleSaveDetails = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await updateLiquidationDetails(liq.id, editableDetails);
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 text-foreground">
      {/* HEADER ACTIONS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/liquidations")}
            className="border-border cursor-pointer text-xs h-9 flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a Liquidaciones
          </Button>
          <div>
            <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <Calculator className="h-5 w-5 text-emerald-500" />
              Planilla de Liquidación y Débitos (LIQ-{String(liq.id).padStart(4, "0")})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Administración de débitos, créditos, GA y ajustes por recupero para la Obra Social.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className={`text-2xs font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
            liq.status === "PENDIENTE" 
              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
              : liq.status === "NOTIFICADO"
              ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
              : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
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
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Mes Carga</span>
            <p className="font-bold text-foreground text-sm">{liq.mesCarga || `${liq.periodMes}/${liq.periodAnio}`}</p>
          </div>

          {/* PDF DEBITS UPLOAD MODULE */}
          <div className="space-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
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
          <div className="w-full max-h-[500px] overflow-y-auto overflow-x-auto">
            <Table className="w-full min-w-[1300px] text-xs">
              <TableHeader className="bg-muted/60 text-muted-foreground sticky top-0 z-10 shadow-xs">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-bold text-2xs py-3">PERIODO</TableHead>
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
                  <TableHead className="font-bold text-2xs text-right text-emerald-400 font-extrabold">NETO A PAGAR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liq.details.map((detail: any) => {
                  const editState = editableDetails.find((e) => e.id === detail.id) || {
                    totalFacturado: Number(detail.totalFacturado),
                    creditos: Number(detail.creditos),
                    debitos: Number(detail.debitos),
                    ajustesOs: Number(detail.ajustesOs),
                    pendientesCobro: Number(detail.pendientesCobro),
                    ga: Number(detail.ga),
                    ajusteRecupero: Number(detail.ajusteRecupero),
                  };

                  // Real-time calculation ensuring non-negative values
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
                    <TableRow key={detail.id} className="hover:bg-muted/20 border-border text-foreground">
                      <TableCell className="text-2xs font-mono">{detail.periodo || liq.mesCarga}</TableCell>
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
                          min="0"
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
                          min="0"
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
                          min="0"
                          value={editState.ajustesOs}
                          onChange={(e) => handleDetailInputChange(detail.id, "ajustesOs", Number(e.target.value))}
                          className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-amber-600 focus-visible:ring-emerald-500"
                        />
                      </TableCell>

                      {/* PENDIENTES COBRO */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editState.pendientesCobro}
                          onChange={(e) => handleDetailInputChange(detail.id, "pendientesCobro", Number(e.target.value))}
                          className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-orange-600 focus-visible:ring-emerald-500"
                        />
                      </TableCell>

                      {/* BRUTO A PAGAR */}
                      <TableCell className="text-right font-extrabold text-xs text-foreground">
                        {formatCurrency(bruto)}
                      </TableCell>

                      {/* GA */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editState.ga}
                          onChange={(e) => handleDetailInputChange(detail.id, "ga", Number(e.target.value))}
                          className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-blue-600 focus-visible:ring-emerald-500"
                        />
                      </TableCell>

                      {/* AJUSTE RECUPERO */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editState.ajusteRecupero}
                          onChange={(e) => handleDetailInputChange(detail.id, "ajusteRecupero", Number(e.target.value))}
                          className="w-24 text-right h-8 text-2xs bg-muted/40 border-border font-semibold text-purple-600 focus-visible:ring-emerald-500"
                        />
                      </TableCell>

                      {/* NETO A PAGAR */}
                      <TableCell className="text-right font-extrabold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
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
          onClick={() => router.push("/dashboard/liquidations")}
          className="border-border cursor-pointer text-xs h-9"
        >
          Volver a la Lista
        </Button>

        <div className="flex gap-2">
          {liq.status !== "NOTIFICADO" && liq.status !== "CERRADA" && (
            <Button
              onClick={handleNotifyHospital}
              disabled={notifying || saving}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 px-4 h-9 cursor-pointer text-xs"
            >
              {notifying ? (
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
            onClick={handleSaveDetails}
            disabled={saving || notifying}
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
      </div>
    </div>
  );
}
