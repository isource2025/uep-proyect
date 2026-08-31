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
  Users,
  UserCheck,
  Stethoscope,
  DollarSign,
  Search,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateLiquidationDetails, uploadDebitsFile, deleteDebitsFile, notifyHospital } from "../actions";
import { bulkSaveDistributions } from "@/app/dashboard/hospital-portal/actions";

interface LiquidationDetailClientProps {
  liquidation: any;
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
    hospitalId?: number | null;
  };
  agents?: any[];
  hospitalId?: number | null;
}

export default function LiquidationDetailClient({
  liquidation,
  currentUser,
  agents = [],
  hospitalId: initialHospitalId,
}: LiquidationDetailClientProps) {
  const router = useRouter();
  const isHospitalUser =
    currentUser?.role !== "1" &&
    currentUser?.hospitalId !== undefined &&
    currentUser?.hospitalId !== null;

  const targetHospitalId =
    currentUser?.hospitalId ||
    initialHospitalId ||
    (liquidation.details && liquidation.details[0]?.hospitalId);

  // Search query state for filtering details
  const [searchQuery, setSearchQuery] = useState("");

  // Loading and feedback states
  const [saving, setSaving] = useState(false);
  const [savingAgents, setSavingAgents] = useState(false);
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

  // Initialise agents and distributions state
  const initialDistRows = (agents || []).map((agent: any) => {
    const dist = (liq.distributions || []).find((d: any) => d.agentId === agent.id);
    const cargoStr =
      agent.cargo === "1"
        ? "ADMINISTRATIVO"
        : agent.cargo === "2"
        ? "MEDICO"
        : agent.cargo === "3"
        ? "ENFERMERO"
        : agent.cargo || "PROFESIONAL";

    return {
      agentId: agent.id,
      nombre: agent.nombre,
      cuil: agent.cuil || "",
      cargo: cargoStr,
      honorarios: dist ? Math.max(0, Number(dist.honorarios)) : 0,
      sobreasignaciones: dist ? Math.max(0, Number(dist.sobreasignaciones)) : 0,
      gastos: dist ? Math.max(0, Number(dist.gastos)) : 0,
    };
  });

  const [agentDistRows, setAgentDistRows] = useState<any[]>(initialDistRows);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");

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

  const handleAgentInputChange = (agentId: number, field: string, value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setAgentDistRows((prev) =>
      prev.map((row) => (row.agentId === agentId ? { ...row, [field]: num } : row))
    );
    setErrorMsg(null);
    setSuccessMsg(null);
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

  const handleSaveAgentsDistribution = async () => {
    if (!targetHospitalId) {
      setErrorMsg("No se pudo identificar el establecimiento para guardar la distribución.");
      return;
    }

    setSavingAgents(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const distPayload = agentDistRows.map((r) => ({
        agentId: r.agentId,
        honorarios: Number(r.honorarios || 0),
        sobreasignaciones: Number(r.sobreasignaciones || 0),
        gastos: Number(r.gastos || 0),
      }));

      const res = await bulkSaveDistributions(liq.id, targetHospitalId, distPayload);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }

      setSuccessMsg("Distribución de personal guardada exitosamente.");
    } catch (e: any) {
      setErrorMsg("Error al guardar la distribución individual de agentes.");
    } finally {
      setSavingAgents(false);
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
          (d.prestadorNombre &&
            currentUser?.name &&
            d.prestadorNombre.toLowerCase().trim().includes(currentUser.name.toLowerCase().trim())) ||
          (currentUser?.name &&
            d.prestadorNombre &&
            currentUser.name.toLowerCase().trim().includes(d.prestadorNombre.toLowerCase().trim()))
      )
    : liq.details;

  const currentDetails = displayedDetails.length > 0 ? displayedDetails : liq.details;

  // Compute live calculations from editable details
  const detailSums = currentDetails.reduce(
    (acc: any, detail: any) => {
      const edit = editableDetails.find((e) => e.id === detail.id) || {};
      const totalFact = Number(edit.totalFacturado ?? detail.totalFacturado ?? 0);
      const cred = Number(edit.creditos ?? detail.creditos ?? 0);
      const deb = Number(edit.debitos ?? detail.debitos ?? 0);
      const ajOs = Number(edit.ajustesOs ?? detail.ajustesOs ?? 0);
      const pend = Number(edit.pendientesCobro ?? detail.pendientesCobro ?? 0);
      const gaVal = Number(edit.ga ?? detail.ga ?? 0);
      const ajRec = Number(edit.ajusteRecupero ?? detail.ajusteRecupero ?? 0);

      const bruto = totalFact + cred - deb + ajOs - pend;
      const neto = bruto - gaVal + ajRec;

      return {
        totalFacturado: acc.totalFacturado + totalFact,
        creditos: acc.creditos + cred,
        debitos: acc.debitos + deb,
        ajustesOs: acc.ajustesOs + ajOs,
        pendientesCobro: acc.pendientesCobro + pend,
        brutoAPagar: acc.brutoAPagar + bruto,
        ga: acc.ga + gaVal,
        ajusteRecupero: acc.ajusteRecupero + ajRec,
        netoAPagar: acc.netoAPagar + neto,
      };
    },
    {
      totalFacturado: 0,
      creditos: 0,
      debitos: 0,
      ajustesOs: 0,
      pendientesCobro: 0,
      brutoAPagar: 0,
      ga: 0,
      ajusteRecupero: 0,
      netoAPagar: 0,
    }
  );

  const filteredDetails = currentDetails.filter((d: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const prestador = (d.prestadorNombre || d.hospital?.nombre || "").toLowerCase();
    const cuit = (d.cuit || d.hospital?.cuit || "").toLowerCase();
    const periodo = (d.periodo || liq.mesCarga || "").toLowerCase();
    const fcHospital = (d.fcHospital || `fc-${d.compraId || ""}`).toLowerCase();
    const localidad = (d.localidad || d.hospital?.code || "").toLowerCase();

    return (
      prestador.includes(q) ||
      cuit.includes(q) ||
      periodo.includes(q) ||
      fcHospital.includes(q) ||
      localidad.includes(q)
    );
  });

  // Filter agent distribution rows
  const filteredAgentRows = agentDistRows.filter((agent: any) => {
    if (!agentSearchQuery.trim()) return true;
    const q = agentSearchQuery.toLowerCase().trim();
    return (
      agent.nombre.toLowerCase().includes(q) ||
      agent.cuil.toLowerCase().includes(q) ||
      agent.cargo.toLowerCase().includes(q)
    );
  });

  // Dynamic Live Header Metrics calculated from agent distribution
  const liveTotalHonorarios =
    agentDistRows.length > 0
      ? agentDistRows.reduce((sum, r) => sum + (Number(r.honorarios) || 0), 0)
      : Number(liq.totalHonorarios || 0);

  const liveTotalSobreasignaciones =
    agentDistRows.length > 0
      ? agentDistRows.reduce((sum, r) => sum + (Number(r.sobreasignaciones) || 0), 0)
      : Number(liq.totalSobreasignaciones || 0);

  const liveTotalGastos =
    agentDistRows.length > 0
      ? agentDistRows.reduce((sum, r) => sum + (Number(r.gastos) || 0), 0)
      : Number(liq.totalGastos || 0);

  const liveTotalDistribuido = liveTotalHonorarios + liveTotalSobreasignaciones + liveTotalGastos;
  const currentHospitalNeto = detailSums.netoAPagar;
  const balanceRestante = currentHospitalNeto - liveTotalDistribuido;

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
            disabled={goingBack || saving || savingAgents}
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
          <span
            className={`text-2xs font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
              liq.status === "PENDIENTE"
                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
                : liq.status === "NOTIFICADO"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            }`}
          >
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
            <p className="font-mono font-bold text-foreground text-sm">
              LIQ-{String(liq.id).padStart(4, "0")}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Recibo UEP</span>
            <p className="font-mono font-bold text-foreground text-sm">
              {liq.rc.puntoVenta}-{liq.rc.numero}
            </p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
              {liq.rc.cliente?.nombre}
            </p>

            {/* FC Ventas unificadas associated with this receipt */}
            {liq.rc?.appliedAsRc && liq.rc.appliedAsRc.length > 0 && (
              <div className="mt-2 bg-muted/40 p-2 rounded-lg border border-border/30 text-[10px] space-y-1 max-h-[100px] overflow-y-auto">
                <span className="text-[9px] text-muted-foreground uppercase font-bold block">
                  FC Ventas Asociadas:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {liq.rc.appliedAsRc.map((app: any) => {
                    const fc = app.fc;
                    if (!fc) return null;
                    return (
                      <span
                        key={app.id}
                        className="inline-block px-1.5 py-0.5 bg-background border border-border/40 font-mono font-bold text-foreground rounded text-3xs"
                      >
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

      {/* SECTION 1.5 - CABECERA DE TOTALES Y DISTRIBUCIÓN (HONORARIOS, SOBREASIGNACIÓN, GASTOS, NETO) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL HONORARIOS */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Total Honorarios
              </span>
              <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Stethoscope className="h-4 w-4" />
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-teal-600 dark:text-teal-400 font-mono">
                {formatCurrency(liveTotalHonorarios)}
              </p>
              <p className="text-3xs text-muted-foreground mt-0.5">
                Suma individual de médicos / profesionales
              </p>
            </div>
          </CardContent>
        </Card>

        {/* TOTAL SOBREASIGNACIÓN */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Total Sobreasignación
              </span>
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                {formatCurrency(liveTotalSobreasignaciones)}
              </p>
              <p className="text-3xs text-muted-foreground mt-0.5">
                Suma individual de sobreasignación al personal
              </p>
            </div>
          </CardContent>
        </Card>

        {/* TOTAL GASTOS */}
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Total Gastos
              </span>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Building2 className="h-4 w-4" />
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                {formatCurrency(liveTotalGastos)}
              </p>
              <p className="text-3xs text-muted-foreground mt-0.5">
                Gastos de funcionamiento del establecimiento
              </p>
            </div>
          </CardContent>
        </Card>

        {/* BALANCE Y NETO */}
        <Card
          className={cn(
            "border-border bg-card shadow-sm",
            liveTotalDistribuido > currentHospitalNeto && "border-red-500/50 bg-red-500/5"
          )}
        >
          <CardContent className="p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Neto a Pagar / Balance
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full font-bold text-3xs border",
                  liveTotalDistribuido > currentHospitalNeto
                    ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                )}
              >
                {liveTotalDistribuido > currentHospitalNeto ? "Excedido" : "Distribuido"}
              </span>
            </div>
            <div>
              <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(currentHospitalNeto)}
              </p>
              <div className="flex items-center justify-between mt-1 text-3xs">
                <span className="text-muted-foreground">
                  Restante:{" "}
                  <strong
                    className={cn(
                      balanceRestante < 0
                        ? "text-red-500"
                        : "text-foreground font-bold"
                    )}
                  >
                    {formatCurrency(balanceRestante)}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Total Dist.: <strong>{formatCurrency(liveTotalDistribuido)}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2 - TABLA DE LIQUIDACIÓN POR HOSPITAL / PRESTADOR */}
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-3 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-emerald-500" />
              Renglones de Liquidación por Hospital / Prestador
            </CardTitle>
            <CardDescription className="text-3xs text-muted-foreground mt-0.5">
              {isHospitalUser
                ? "Valores calculados para su establecimiento de salud."
                : "Complete las celdas numéricas. Los totales neto y bruto se recalculan de forma segura e instantánea."}
            </CardDescription>
          </div>

          <SearchBar
            placeholder="Buscar por hospital, CUIT, período o FC..."
            value={searchQuery}
            onChange={setSearchQuery}
            size="sm"
            className="w-full sm:w-80"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-3xs uppercase py-2">OBRA SOCIAL</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">PERIODO</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">CUIT N°</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">PRESTADOR</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">LOCALIDAD</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">FC N° HOSP.</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">TOTAL FACT.</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">CRÉDITOS</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">DÉBITOS</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">AJUSTES O.S.</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">PEND. COBRO</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">BRUTO A PAGAR</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">GA</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">AJUSTE REC.</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">NETO A PAGAR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDetails.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={15} className="text-center text-muted-foreground text-xs py-8">
                      {searchQuery.trim()
                        ? "No se encontraron renglones que coincidan con la búsqueda."
                        : "No hay renglones para mostrar."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDetails.map((detail: any) => {
                    const editState = editableDetails.find((item) => item.id === detail.id) || {};
                    const totalFact = Number(editState.totalFacturado ?? detail.totalFacturado ?? 0);
                    const cred = Number(editState.creditos ?? detail.creditos ?? 0);
                    const deb = Number(editState.debitos ?? detail.debitos ?? 0);
                    const ajOs = Number(editState.ajustesOs ?? detail.ajustesOs ?? 0);
                    const pend = Number(editState.pendientesCobro ?? detail.pendientesCobro ?? 0);
                    const gaVal = Number(editState.ga ?? detail.ga ?? 0);
                    const ajRec = Number(editState.ajusteRecupero ?? detail.ajusteRecupero ?? 0);

                    const bruto = totalFact + cred - deb + ajOs - pend;
                    const neto = bruto - gaVal + ajRec;

                    return (
                      <TableRow key={detail.id} className="hover:bg-muted/40 border-border text-foreground text-xs">
                        <TableCell className="font-medium text-3xs whitespace-nowrap">
                          {detail.cliente?.nombre || liq.rc?.cliente?.nombre || "OS"}
                        </TableCell>
                        <TableCell className="font-mono text-3xs text-muted-foreground whitespace-nowrap">
                          {detail.periodo || liq.mesCarga || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-3xs text-muted-foreground whitespace-nowrap">
                          {detail.hospital?.cuit || detail.cuit || "-"}
                        </TableCell>
                        <TableCell className="font-semibold text-3xs max-w-[160px] whitespace-normal break-words">
                          {detail.prestadorNombre || detail.hospital?.nombre || "Hospital"}
                        </TableCell>
                        <TableCell className="text-3xs text-muted-foreground whitespace-nowrap">
                          {detail.localidad || "CAPITAL"}
                        </TableCell>
                        <TableCell className="font-mono text-3xs font-semibold whitespace-nowrap">
                          {detail.fcHospital || `FC-${detail.compraId || ""}`}
                        </TableCell>

                        {/* TOTAL FACTURADO */}
                        <TableCell className="text-right px-1 py-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isHospitalUser || saving}
                            value={getInputDisplayValue(editState.totalFacturado)}
                            onChange={(e) => handleDetailInputChange(detail.id, "totalFacturado", e.target.value)}
                            className="w-full text-right h-8 text-2xs bg-background border-border font-semibold focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>

                        {/* CREDITOS */}
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

                        {/* DEBITOS */}
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
                            className="w-full text-right h-8 text-2xs bg-background border-border font-semibold focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                            className="w-full text-right h-8 text-2xs bg-background border-border font-semibold focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>

                        {/* BRUTO A PAGAR */}
                        <TableCell className="text-right font-bold text-3xs px-2 py-1 text-foreground">
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
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3 - CARGA INDIVIDUAL DE MÉDICOS Y PERSONAL (SISPER) */}
      {(isHospitalUser || agentDistRows.length > 0) && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-3 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-teal-500" />
                Distribución Individual por Médico / Personal de Salud (SISPER)
              </CardTitle>
              <CardDescription className="text-3xs text-muted-foreground mt-0.5">
                Asigne los honorarios y sobreasignaciones individuales por profesional. Los totales impactan en la cabecera.
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <SearchBar
                placeholder="Buscar por médico, CUIL o cargo..."
                value={agentSearchQuery}
                onChange={setAgentSearchQuery}
                size="sm"
                className="w-full sm:w-72"
              />
              <Button
                onClick={handleSaveAgentsDistribution}
                disabled={savingAgents || balanceRestante < 0}
                className="bg-teal-600 hover:bg-teal-500 text-zinc-950 font-bold gap-1.5 h-8 text-xs shrink-0 cursor-pointer"
              >
                {savingAgents ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Guardar Personal
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 text-muted-foreground">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-semibold text-3xs uppercase py-2">DNI / CUIL</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase">APELLIDO Y NOMBRE</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase">PUESTO LABORAL</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">HONORARIOS ($)</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">SOBREASIGNACIÓN ($)</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">GASTOS ($)</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">TOTAL AGENTE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgentRows.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-8">
                        {agentSearchQuery.trim()
                          ? "No se encontraron agentes que coincidan con la búsqueda."
                          : "No hay agentes registrados para este establecimiento."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgentRows.map((agent: any) => {
                      const totalAgente =
                        Number(agent.honorarios || 0) +
                        Number(agent.sobreasignaciones || 0) +
                        Number(agent.gastos || 0);

                      return (
                        <TableRow
                          key={agent.agentId}
                          className="hover:bg-muted/40 border-border text-foreground text-xs"
                        >
                          <TableCell className="font-mono text-3xs text-muted-foreground whitespace-nowrap">
                            {agent.cuil || "-"}
                          </TableCell>
                          <TableCell className="font-semibold text-3xs whitespace-normal break-words">
                            {agent.nombre}
                          </TableCell>
                          <TableCell className="text-3xs text-muted-foreground whitespace-nowrap">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-muted font-medium text-3xs">
                              {agent.cargo}
                            </span>
                          </TableCell>

                          {/* HONORARIOS INDIVIDUALES */}
                          <TableCell className="text-right px-1 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={savingAgents}
                              value={getInputDisplayValue(agent.honorarios)}
                              onChange={(e) =>
                                handleAgentInputChange(agent.agentId, "honorarios", e.target.value)
                              }
                              className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-teal-600 dark:text-teal-400 focus-visible:ring-teal-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </TableCell>

                          {/* SOBREASIGNACION INDIVIDUAL */}
                          <TableCell className="text-right px-1 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={savingAgents}
                              value={getInputDisplayValue(agent.sobreasignaciones)}
                              onChange={(e) =>
                                handleAgentInputChange(agent.agentId, "sobreasignaciones", e.target.value)
                              }
                              className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-indigo-600 dark:text-indigo-400 focus-visible:ring-indigo-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </TableCell>

                          {/* GASTOS INDIVIDUALES */}
                          <TableCell className="text-right px-1 py-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={savingAgents}
                              value={getInputDisplayValue(agent.gastos)}
                              onChange={(e) =>
                                handleAgentInputChange(agent.agentId, "gastos", e.target.value)
                              }
                              className="w-full text-right h-8 text-2xs bg-background border-border font-semibold text-amber-600 dark:text-amber-400 focus-visible:ring-amber-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </TableCell>

                          {/* TOTAL AGENTE */}
                          <TableCell className="text-right font-bold text-3xs px-2 py-1 text-foreground bg-muted/20">
                            {formatCurrency(totalAgente)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

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
          disabled={goingBack || saving || savingAgents}
          className="border-border cursor-pointer text-xs h-9"
        >
          {goingBack ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Cargando Lista...
            </>
          ) : isHospitalUser ? (
            "Volver a Mis Liquidaciones"
          ) : (
            "Volver a la Lista"
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
