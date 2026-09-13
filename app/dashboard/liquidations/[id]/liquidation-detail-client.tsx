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
  UserPlus,
  Trash2,
  Plus,
  Check,
  X,
  FileSpreadsheet,
  ClipboardPaste,
  AlertTriangle,
  Percent,
  User,
  MessageSquare,
} from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { updateLiquidationDetails, uploadDebitsFile, deleteDebitsFile, notifyHospital, saveLiquidacionPersonalDistributions } from "../actions";

interface LiquidationDetailClientProps {
  liquidation: any;
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
    hospitalId?: number | null;
  };
  agents?: any[];
  extraSavedAgents?: any[];
  agentsPeriodOrigin?: "current" | "previous" | "none";
  hospitalId?: number | null;
}

export default function LiquidationDetailClient({
  liquidation,
  currentUser,
  agents = [],
  extraSavedAgents = [],
  agentsPeriodOrigin = "none",
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

  // Modal state for adding agents (Single vs Batch from Excel)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<"single" | "batch">("single");
  const [modalSearchInput, setModalSearchInput] = useState("");
  const [modalBatchInput, setModalBatchInput] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [submittedBatchTerms, setSubmittedBatchTerms] = useState<string[]>([]);
  const [unmatchedBatchTerms, setUnmatchedBatchTerms] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAgentIdsInModal, setSelectedAgentIdsInModal] = useState<number[]>([]);

  const getInputDisplayValue = (val: any) => {
    if (val === 0 || val === "0" || val === "") return "";
    return val;
  };

  // Store current liquidation state locally to dynamically display updates
  const [liq, setLiq] = useState(liquidation);
  const [mesCarga, setMesCarga] = useState(liq.mesCarga || "");
  const [observaciones, setObservaciones] = useState(liq.observaciones || "");
  const [globalGaPercent, setGlobalGaPercent] = useState("6");
  const [customGlobalGaPercent, setCustomGlobalGaPercent] = useState("");

  // Initialise editable detail rows ensuring no negative values (minimum is 0)
  const [editableDetails, setEditableDetails] = useState<any[]>(
    liq.details.map((d: any) => {
      const totalFact = Math.max(0, Number(d.totalFacturado));
      const gaVal = Math.max(0, Number(d.ga));
      let initPct: number | string = 6;
      if (totalFact > 0) {
        initPct = Math.round(((gaVal / totalFact) * 100) * 10) / 10;
      } else if (gaVal === 0) {
        initPct = 0;
      }
      return {
        id: d.id,
        totalFacturado: totalFact,
        creditos: Math.max(0, Number(d.creditos)),
        debitos: Math.max(0, Number(d.debitos)),
        ajustesOs: Math.max(0, Number(d.ajustesOs)),
        pendientesCobro: Math.max(0, Number(d.pendientesCobro)),
        ga: gaVal,
        gaPercent: initPct,
        ajusteRecupero: Math.max(0, Number(d.ajusteRecupero)),
      };
    })
  );

  // Initialise agents state starting ONLY with previously saved distributions for this liquidation (or empty)
  const initialDistRows = (liq.personalDistributions || []).map((p: any) => {
    const agMeta =
      (agents || []).find((a: any) => (a.idAgente || a.id) === p.idAgente) ||
      (extraSavedAgents || []).find((a: any) => (a.idAgente || a.id) === p.idAgente);

    let hospName = agMeta?.hospitalNombre || "";
    if (!hospName && agMeta?.hospitalId && liq.details) {
      const matchDet = liq.details.find(
        (d: any) =>
          d.hospitalId === agMeta.hospitalId ||
          d.compra?.hospitalId === agMeta.hospitalId
      );
      if (matchDet) {
        hospName = matchDet.prestadorNombre || matchDet.hospital?.nombre || "";
      }
    }
    if (!hospName && isHospitalUser && currentUser?.name) {
      hospName = currentUser.name;
    }
    if (!hospName && liq.details && liq.details.length === 1) {
      hospName = liq.details[0].prestadorNombre || liq.details[0].hospital?.nombre || "";
    }

    return {
      agentId: p.idAgente,
      legajo: agMeta?.legajo || "",
      nombre: agMeta?.nombre || `Agente #${p.idAgente}`,
      cuil: agMeta?.cuil || "",
      cargo: agMeta?.cargo || "PROFESIONAL",
      hospitalNombre: hospName,
      honorarios: Math.max(0, Number(p.honorarios || 0)),
      sobreasignaciones: Math.max(0, Number(p.sobreasignacion || 0)),
    };
  });

  const [agentDistRows, setAgentDistRows] = useState<any[]>(initialDistRows);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");

  // Modal handlers
  const handleToggleAgentInModal = (agentId: number) => {
    setSelectedAgentIdsInModal((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleSelectAllVisibleInModal = (visibleAgentIds: number[]) => {
    setSelectedAgentIdsInModal((prev) => {
      const allSelected = visibleAgentIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !visibleAgentIds.includes(id));
      } else {
        const newSet = new Set([...prev, ...visibleAgentIds]);
        return Array.from(newSet);
      }
    });
  };

  const handleExecuteBatchSearch = () => {
    const rawTerms = modalBatchInput
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (rawTerms.length === 0) return;

    const availableInModal = agents.filter(
      (ag: any) => !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))
    );

    const matchedTerms = new Set<string>();
    const foundAgentIds: number[] = [];

    for (const ag of availableInModal) {
      const agId = ag.idAgente || ag.id;
      const agName = (ag.nombre || "").toLowerCase();
      const agCuilDigits = (ag.cuil || "").replace(/[^\d]/g, "");
      const agLegajo = (ag.legajo || "").toLowerCase().trim();
      const agLegajoDigits = (ag.legajo || "").replace(/[^\d]/g, "");
      const agIdStr = String(ag.idAgente || ag.id || "");

      let isMatched = false;
      for (const term of rawTerms) {
        const cleanText = term.toLowerCase().trim();
        const cleanDigits = term.replace(/[^\d]/g, "");

        const matchDigits =
          cleanDigits.length >= 6 &&
          ((agCuilDigits && (agCuilDigits === cleanDigits || agCuilDigits.includes(cleanDigits))) ||
            (agLegajoDigits && agLegajoDigits === cleanDigits) ||
            (agIdStr && agIdStr === cleanDigits));

        const matchText =
          cleanText.length >= 3 &&
          (agName.includes(cleanText) ||
            cleanText.includes(agName) ||
            agLegajo.includes(cleanText) ||
            (cleanText.includes(" ") &&
              cleanText
                .split(" ")
                .filter((w) => w.length > 2)
                .every((w) => agName.includes(w))));

        if (matchDigits || matchText) {
          isMatched = true;
          matchedTerms.add(term);
        }
      }

      if (isMatched) {
        foundAgentIds.push(agId);
      }
    }

    const unmatched = rawTerms.filter((t) => !matchedTerms.has(t));
    setSubmittedBatchTerms(rawTerms);
    setUnmatchedBatchTerms(unmatched);
    setHasSearched(true);

    // Auto-select all matched agents from the batch
    if (foundAgentIds.length > 0) {
      setSelectedAgentIdsInModal((prev) => Array.from(new Set([...prev, ...foundAgentIds])));
    }
  };

  const handleConfirmAddAgentsFromModal = () => {
    if (selectedAgentIdsInModal.length === 0) {
      setIsAddModalOpen(false);
      return;
    }

    const agentsToAdd = agents.filter((ag: any) =>
      selectedAgentIdsInModal.includes(ag.idAgente || ag.id) &&
      !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))
    );

    const newRows = agentsToAdd.map((ag: any) => {
      let hospName = ag.hospitalNombre || "";
      if (!hospName && ag.hospitalId && liq.details) {
        const matchDet = liq.details.find(
          (d: any) =>
            d.hospitalId === ag.hospitalId ||
            d.compra?.hospitalId === ag.hospitalId
        );
        if (matchDet) {
          hospName = matchDet.prestadorNombre || matchDet.hospital?.nombre || "";
        }
      }
      if (!hospName && isHospitalUser && currentUser?.name) {
        hospName = currentUser.name;
      }
      if (!hospName && liq.details && liq.details.length === 1) {
        hospName = liq.details[0].prestadorNombre || liq.details[0].hospital?.nombre || "";
      }

      return {
        agentId: ag.idAgente || ag.id,
        legajo: ag.legajo || "",
        nombre: ag.nombre,
        cuil: ag.cuil || "",
        cargo: ag.cargo || "PROFESIONAL",
        hospitalNombre: hospName,
        honorarios: 0,
        sobreasignaciones: 0,
      };
    });

    setAgentDistRows((prev) => [...prev, ...newRows]);
    setSelectedAgentIdsInModal([]);
    setModalSearchInput("");
    setModalBatchInput("");
    setSubmittedSearchQuery("");
    setSubmittedBatchTerms([]);
    setUnmatchedBatchTerms([]);
    setHasSearched(false);
    setIsAddModalOpen(false);
    setSuccessMsg(`Se añadieron ${newRows.length} profesional(es) a la grilla de distribución.`);
  };

  const handleRemoveAgent = (agentId: number) => {
    setAgentDistRows((prev) => prev.filter((r) => r.agentId !== agentId));
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleGaPercentChange = (id: string, pctVal: string) => {
    const pctNum = parseFloat(pctVal);
    if (isNaN(pctNum) || pctNum < 0) return;

    setEditableDetails((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const totalFact = Number(item.totalFacturado || 0);
        const cred = Number(item.creditos || 0);
        const deb = Number(item.debitos || 0);
        const ajOs = Number(item.ajustesOs || 0);
        const pend = Number(item.pendientesCobro || 0);
        const bruto = totalFact + cred - deb + ajOs - pend;
        const base = totalFact > 0 ? totalFact : Math.max(0, bruto);
        const calculatedGa = Math.max(0, Number(((base * pctNum) / 100).toFixed(2)));
        return {
          ...item,
          gaPercent: pctNum,
          ga: calculatedGa,
        };
      })
    );
  };

  const handleApplyGlobalGaPercent = () => {
    let pctNum = parseFloat(globalGaPercent);
    if (globalGaPercent === "custom") {
      pctNum = parseFloat(customGlobalGaPercent);
    }
    if (isNaN(pctNum) || pctNum < 0) {
      setErrorMsg("Ingrese un porcentaje válido para aplicar.");
      return;
    }
    setEditableDetails((prev) =>
      prev.map((item) => {
        const totalFact = Number(item.totalFacturado || 0);
        const cred = Number(item.creditos || 0);
        const deb = Number(item.debitos || 0);
        const ajOs = Number(item.ajustesOs || 0);
        const pend = Number(item.pendientesCobro || 0);
        const bruto = totalFact + cred - deb + ajOs - pend;
        const base = totalFact > 0 ? totalFact : Math.max(0, bruto);
        const calculatedGa = Math.max(0, Number(((base * pctNum) / 100).toFixed(2)));
        return {
          ...item,
          gaPercent: pctNum,
          ga: calculatedGa,
        };
      })
    );
    setSuccessMsg(`Gastos Administrativos del ${pctNum}% aplicados a todos los renglones.`);
  };

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
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === "totalFacturado") {
          const pctNum = typeof item.gaPercent === "number" ? item.gaPercent : parseFloat(item.gaPercent);
          if (!isNaN(pctNum) && pctNum >= 0 && item.gaPercent !== "custom") {
            const newTotal = Number(value || 0);
            const newGa = Math.max(0, Number(((newTotal * pctNum) / 100).toFixed(2)));
            return { ...item, totalFacturado: value, ga: newGa };
          }
        }

        if (field === "ga") {
          const newGa = Number(value || 0);
          const totalFact = Number(item.totalFacturado || 0);
          let newPct = 0;
          if (totalFact > 0) {
            newPct = Number(((newGa / totalFact) * 100).toFixed(2));
          }
          return { ...item, ga: value, gaPercent: newPct };
        }

        return { ...item, [field]: value };
      })
    );
  };

  const handleAgentInputChange = (agentId: number, field: string, value: string) => {
    const num = Math.max(0, parseFloat(value) || 0);
    setAgentDistRows((prev) =>
      prev.map((row) => {
        if (row.agentId === agentId) {
          // Mutually exclusive: if setting honorarios > 0, reset sobreasignaciones to 0
          if (field === "honorarios" && num > 0) {
            return { ...row, honorarios: num, sobreasignaciones: 0 };
          }
          // Mutually exclusive: if setting sobreasignaciones > 0, reset honorarios to 0
          if (field === "sobreasignaciones" && num > 0) {
            return { ...row, sobreasignaciones: num, honorarios: 0 };
          }
          return { ...row, [field]: num };
        }
        return row;
      })
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

      const res = await updateLiquidationDetails(liq.id, parsedDetails, undefined, mesCarga, observaciones);
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
    setSavingAgents(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Front-end exclusivity check
    const invalidExclusivity = agentDistRows.find(
      (r) => Number(r.honorarios || 0) > 0 && Number(r.sobreasignaciones || 0) > 0
    );

    if (invalidExclusivity) {
      setErrorMsg(
        `Regla de exclusividad: El profesional ${invalidExclusivity.nombre} no puede percibir Honorarios y Sobreasignación simultáneamente. Debe asignar solo uno de los dos conceptos.`
      );
      setSavingAgents(false);
      return;
    }

    try {
      const distPayload = agentDistRows.map((r) => ({
        idAgente: r.agentId,
        honorarios: Number(r.honorarios || 0),
        sobreasignacion: Number(r.sobreasignaciones || 0),
      }));

      const res = await saveLiquidacionPersonalDistributions(
        liq.id,
        distPayload,
        isHospitalUser && targetHospitalId ? Number(targetHospitalId) : undefined
      );
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }

      setSuccessMsg("Distribución de personal guardada en LiquidacionPersonal exitosamente.");
      router.refresh();
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
      (agent.hospitalNombre && agent.hospitalNombre.toLowerCase().includes(q)) ||
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

  const currentHospitalNeto = detailSums.netoAPagar;
  const liveTotalGastos = Math.max(0, currentHospitalNeto - (liveTotalHonorarios + liveTotalSobreasignaciones));
  const liveTotalDistribuido = liveTotalHonorarios + liveTotalSobreasignaciones + liveTotalGastos;
  const balanceRestante = currentHospitalNeto - (liveTotalHonorarios + liveTotalSobreasignaciones);

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
            {!isHospitalUser && liq.createdByName && liq.createdByName.trim() !== "" && (
              <div className="flex items-center gap-1.5 text-3xs text-muted-foreground pt-1">
                <User className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>Liquidado por: <strong className="text-foreground font-semibold">{liq.createdByName}</strong></span>
              </div>
            )}
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

          {/* OBSERVACIONES DEL LIQUIDADOR (Solo visible para Administradores / Liquidadores) */}
          {!isHospitalUser && (
            <div className="sm:col-span-4 mt-1 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                  Observaciones de la Liquidación (Uso Interno)
                </Label>
                <span className="text-3xs text-muted-foreground">
                  Visible únicamente para operadores y administradores
                </span>
              </div>
              <textarea
                disabled={saving}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Escriba notas u observaciones sobre esta liquidación (ej. débitos acordados, acuerdos con la O.S., etc.)..."
                rows={2}
                className="w-full text-xs bg-background border border-border rounded-lg p-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 resize-y font-normal"
              />
            </div>
          )}
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
        <CardHeader className="p-4 pb-3 border-b border-border/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-emerald-500" />
              Renglones de Liquidación por Hospital / Prestador
            </CardTitle>
            <CardDescription className="text-3xs text-muted-foreground mt-0.5">
              {isHospitalUser
                ? "Valores calculados para su establecimiento de salud."
                : "Complete las celdas numéricas o seleccione el porcentaje de gastos para cada Obra Social."}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isHospitalUser && (
              <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-lg p-1 px-2 text-3xs">
                <Percent className="h-3.5 w-3.5 text-blue-500" />
                <span className="font-semibold text-muted-foreground whitespace-nowrap">GA Global:</span>
                <select
                  value={globalGaPercent}
                  onChange={(e) => setGlobalGaPercent(e.target.value)}
                  className="h-7 text-3xs bg-background border border-border rounded px-1 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="0">0%</option>
                  <option value="3">3%</option>
                  <option value="4">4%</option>
                  <option value="5">5%</option>
                  <option value="6">6% (Default)</option>
                  <option value="7">7%</option>
                  <option value="8">8%</option>
                  <option value="10">10%</option>
                  <option value="12">12%</option>
                  <option value="15">15%</option>
                  <option value="20">20%</option>
                  <option value="custom">Otro %</option>
                </select>
                {globalGaPercent === "custom" && (
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="%"
                    value={customGlobalGaPercent}
                    onChange={(e) => setCustomGlobalGaPercent(e.target.value)}
                    className="w-14 h-7 text-3xs px-1 text-right bg-background border-border font-semibold"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyGlobalGaPercent}
                  disabled={saving}
                  className="h-7 text-3xs px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 font-bold"
                >
                  Aplicar a Todos
                </Button>
              </div>
            )}

            <SearchBar
              placeholder="Buscar por hospital, CUIT, período o FC..."
              value={searchQuery}
              onChange={setSearchQuery}
              size="sm"
              className="w-full sm:w-64"
            />
          </div>
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
                  <TableHead className="font-semibold text-3xs uppercase text-right">GA (% / $)</TableHead>
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
                          {(() => {
                            const rowGaPercent =
                              editState.gaPercent !== undefined &&
                              editState.gaPercent !== "" &&
                              !isNaN(Number(editState.gaPercent))
                                ? Number(editState.gaPercent)
                                : totalFact > 0
                                ? Number(((gaVal / totalFact) * 100).toFixed(2))
                                : 0;

                            const standardPcts = [0, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];
                            const isCustomPct = !standardPcts.includes(rowGaPercent);

                            return (
                              <div className="flex flex-col gap-1 min-w-[90px]">
                                <div className="flex items-center justify-end gap-1">
                                  <select
                                    disabled={isHospitalUser || saving}
                                    value={String(rowGaPercent)}
                                    onChange={(e) => handleGaPercentChange(detail.id, e.target.value)}
                                    className="h-5 text-[10px] bg-muted/70 hover:bg-muted border border-border/80 rounded px-1 text-muted-foreground font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:opacity-60"
                                    title="Porcentaje de Gastos (GA)"
                                  >
                                    {isCustomPct && (
                                      <option value={String(rowGaPercent)}>
                                        {rowGaPercent}%
                                      </option>
                                    )}
                                    <option value="0">0%</option>
                                    <option value="3">3%</option>
                                    <option value="4">4%</option>
                                    <option value="5">5%</option>
                                    <option value="6">6%</option>
                                    <option value="7">7%</option>
                                    <option value="8">8%</option>
                                    <option value="10">10%</option>
                                    <option value="12">12%</option>
                                    <option value="15">15%</option>
                                    <option value="20">20%</option>
                                  </select>
                                </div>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isHospitalUser || saving}
                                  value={getInputDisplayValue(editState.ga)}
                                  onChange={(e) => handleDetailInputChange(detail.id, "ga", e.target.value)}
                                  className="w-full text-right h-7 text-2xs bg-background border-border font-semibold text-blue-600 focus-visible:ring-emerald-500 disabled:opacity-75 px-1 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            );
                          })()}
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

      {/* SECTION 3 - DISTRIBUCIÓN INDIVIDUAL DE MÉDICOS Y PERSONAL (SISPER) */}
      {(isHospitalUser || agentDistRows.length > 0) && (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-4 pb-3 border-b border-border/80 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-teal-500" />
                  Distribución Individual por Médico / Personal de Salud (SISPER)
                </CardTitle>
                <CardDescription className="text-3xs text-muted-foreground mt-0.5">
                  {isHospitalUser
                    ? `Añada los profesionales del período (${liq.periodMes || ""}/${liq.periodAnio || ""}) y asigne sus honorarios o sobreasignaciones individuales.`
                    : "Distribuciones de honorarios y sobreasignaciones consolidadas cargadas por los establecimientos de salud."}
                </CardDescription>
              </div>

              <div className="flex items-center gap-3">
                {agentDistRows.length > 0 && (
                  <SearchBar
                    placeholder="Buscar en asignados..."
                    value={agentSearchQuery}
                    onChange={setAgentSearchQuery}
                    size="sm"
                    className="w-full sm:w-56"
                  />
                )}
                {isHospitalUser && (
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
                )}
              </div>
            </div>

            {/* SELECCIÓN Y AGREGADO DE AGENTES MEDIANTE MODAL (SOLO HOSPITAL) */}
            {isHospitalUser && (
              <>
                {agents.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold">Sin profesionales disponibles para este período:</span> No se encontraron registros de personal cargados en el padrón SISPER para el <strong>mes en curso</strong> ni para el <strong>mes anterior</strong> en este establecimiento.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border">
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-teal-500" />
                      <span>
                        Profesionales disponibles:{" "}
                        <strong className="text-foreground">
                          {agents.filter((ag: any) => !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))).length}
                        </strong>{" "}
                        (de {agents.length} en el padrón)
                      </span>
                      {agentsPeriodOrigin === "current" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Padrón: Mes en curso
                        </span>
                      )}
                      {agentsPeriodOrigin === "previous" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          Padrón: Mes anterior (suplente)
                        </span>
                      )}
                    </div>

                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedAgentIdsInModal([]);
                        setModalSearchInput("");
                        setSubmittedSearchQuery("");
                        setHasSearched(false);
                        setIsAddModalOpen(true);
                      }}
                      disabled={
                        savingAgents ||
                        agents.filter((ag: any) => !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))).length === 0
                      }
                      className="bg-teal-600 hover:bg-teal-500 text-zinc-950 font-bold gap-1.5 h-8 text-xs shrink-0 cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Añadir Profesionales (Buscar en Modal)
                    </Button>
                  </div>
                )}

                {/* MODAL DE BÚSQUEDA Y SELECCIÓN DE AGENTES */}
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                  <DialogContent className="border-border bg-card text-card-foreground sm:max-w-3xl md:max-w-4xl w-[94vw] max-h-[88vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-2xl">
                    <DialogHeader className="p-5 pb-4 border-b border-border bg-muted/15 flex flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                          <UserPlus className="h-5 w-5" />
                        </div>
                        <div>
                          <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                            Seleccionar Profesionales para la Liquidación
                          </DialogTitle>
                          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                            Escriba el nombre, CUIL, legajo o efector y presione <strong>Buscar</strong> para desplegar y seleccionar agentes.
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    {/* Search Form & Toolbar */}
                    <div className="p-4 sm:p-5 border-b border-border bg-muted/20 space-y-3.5">
                      {/* Mode Selector Tabs */}
                      <div className="flex items-center gap-1.5 p-1 bg-muted/70 rounded-xl w-fit border border-border/70">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTab("single");
                            setHasSearched(false);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
                            searchTab === "single"
                              ? "bg-card text-foreground shadow-xs border border-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Search className="h-3.5 w-3.5" />
                          Búsqueda Individual
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTab("batch");
                            setHasSearched(false);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none",
                            searchTab === "batch"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs border border-emerald-500/30"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Pegar Columna de Excel (Lote)
                        </button>
                      </div>

                      {searchTab === "single" ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (modalSearchInput.trim()) {
                              setSubmittedSearchQuery(modalSearchInput.trim());
                              setHasSearched(true);
                            }
                          }}
                          className="flex items-center gap-2.5 w-full"
                        >
                          <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="text"
                              placeholder="Buscar por apellido, nombre, CUIL, legajo o efector..."
                              value={modalSearchInput}
                              onChange={(e) => setModalSearchInput(e.target.value)}
                              className="pl-9 pr-8 bg-card border-border text-foreground text-xs sm:text-sm h-10 w-full rounded-xl focus-visible:ring-1 focus-visible:ring-teal-500 shadow-xs"
                            />
                            {modalSearchInput && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalSearchInput("");
                                  setSubmittedSearchQuery("");
                                  setHasSearched(false);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <Button
                            type="submit"
                            disabled={!modalSearchInput.trim()}
                            className="bg-teal-600 hover:bg-teal-500 text-zinc-950 font-bold gap-1.5 h-10 px-4 text-xs shrink-0 cursor-pointer rounded-xl shadow-xs"
                          >
                            <Search className="h-4 w-4" />
                            Buscar
                          </Button>
                        </form>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="relative">
                            <textarea
                              rows={3}
                              placeholder="Pegue aquí la columna copiada de Excel con los CUILs, legajos o apellidos (uno por fila)..."
                              value={modalBatchInput}
                              onChange={(e) => setModalBatchInput(e.target.value)}
                              className="w-full p-3 pr-8 bg-card border border-border rounded-xl text-xs sm:text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y shadow-xs"
                            />
                            {modalBatchInput && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalBatchInput("");
                                  setSubmittedBatchTerms([]);
                                  setUnmatchedBatchTerms([]);
                                  setHasSearched(false);
                                }}
                                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-muted-foreground">
                              💡 Copie la columna de CUILs o nombres desde su Excel y péguela aquí directamente.
                            </p>
                            <Button
                              type="button"
                              onClick={handleExecuteBatchSearch}
                              disabled={!modalBatchInput.trim()}
                              className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1.5 h-9 px-4 text-xs shrink-0 cursor-pointer rounded-xl shadow-xs"
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                              Buscar Coincidencias en Excel
                            </Button>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const availableInModal = agents.filter(
                          (ag: any) => !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))
                        );

                        let filteredInModal: any[] = [];
                        let hasQuery = false;

                        if (searchTab === "single") {
                          hasQuery = hasSearched && submittedSearchQuery.length > 0;
                          if (hasQuery) {
                            const q = submittedSearchQuery.toLowerCase().trim();
                            filteredInModal = availableInModal.filter((ag: any) => {
                              const nombre = (ag.nombre || "").toLowerCase();
                              const cuil = (ag.cuil || "").toLowerCase();
                              const legajo = (ag.legajo || "").toLowerCase();
                              const cargo = (ag.cargo || "").toLowerCase();
                              const hospital = (ag.hospitalNombre || "").toLowerCase();
                              return (
                                nombre.includes(q) ||
                                cuil.includes(q) ||
                                legajo.includes(q) ||
                                cargo.includes(q) ||
                                hospital.includes(q)
                              );
                            });
                          }
                        } else {
                          hasQuery = hasSearched && submittedBatchTerms.length > 0;
                          if (hasQuery) {
                            filteredInModal = availableInModal.filter((ag: any) => {
                              const agName = (ag.nombre || "").toLowerCase();
                              const agCuilDigits = (ag.cuil || "").replace(/[^\d]/g, "");
                              const agLegajo = (ag.legajo || "").toLowerCase().trim();
                              const agLegajoDigits = (ag.legajo || "").replace(/[^\d]/g, "");
                              const agIdStr = String(ag.idAgente || ag.id || "");

                              return submittedBatchTerms.some((term) => {
                                const cleanText = term.toLowerCase().trim();
                                const cleanDigits = term.replace(/[^\d]/g, "");

                                const matchDigits =
                                  cleanDigits.length >= 6 &&
                                  ((agCuilDigits && (agCuilDigits === cleanDigits || agCuilDigits.includes(cleanDigits))) ||
                                    (agLegajoDigits && agLegajoDigits === cleanDigits) ||
                                    (agIdStr && agIdStr === cleanDigits));

                                const matchText =
                                  cleanText.length >= 3 &&
                                  (agName.includes(cleanText) ||
                                    cleanText.includes(agName) ||
                                    agLegajo.includes(cleanText) ||
                                    (cleanText.includes(" ") &&
                                      cleanText
                                        .split(" ")
                                        .filter((w) => w.length > 2)
                                        .every((w) => agName.includes(w))));

                                return matchDigits || matchText;
                              });
                            });
                          }
                        }

                        const visibleIds = filteredInModal.map((ag: any) => ag.idAgente || ag.id);
                        const allVisibleSelected =
                          visibleIds.length > 0 && visibleIds.every((id: number) => selectedAgentIdsInModal.includes(id));

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
                            <div className="flex items-center gap-2.5">
                              {selectedAgentIdsInModal.length > 0 ? (
                                <span className="font-bold px-2.5 py-1 rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                  {selectedAgentIdsInModal.length} seleccionado(s)
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {hasQuery
                                    ? `${filteredInModal.length} resultado(s) encontrados`
                                    : searchTab === "single"
                                    ? "Ingrese un término y haga clic en Buscar"
                                    : "Pegue los datos y haga clic en Buscar Coincidencias"}
                                </span>
                              )}
                              {hasQuery && selectedAgentIdsInModal.length > 0 && (
                                <span className="text-muted-foreground text-xs">
                                  ({filteredInModal.length} encontrados)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {hasQuery && visibleIds.length > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSelectAllVisibleInModal(visibleIds)}
                                  className="h-8 text-xs px-3 border-border cursor-pointer font-medium"
                                >
                                  {allVisibleSelected ? "Deseleccionar visibles" : "Seleccionar todos los visibles"}
                                </Button>
                              )}

                              {selectedAgentIdsInModal.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedAgentIdsInModal([])}
                                  className="h-8 text-xs px-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  Limpiar Selección
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* List of Agents */}
                    <div className="flex-1 overflow-y-auto max-h-[50vh] p-4 sm:p-5 space-y-2.5">
                      {(() => {
                        const availableInModal = agents.filter(
                          (ag: any) => !agentDistRows.some((r) => r.agentId === (ag.idAgente || ag.id))
                        );

                        const hasQuery =
                          searchTab === "single"
                            ? hasSearched && submittedSearchQuery.length > 0
                            : hasSearched && submittedBatchTerms.length > 0;

                        // If user has not performed a search yet
                        if (!hasQuery) {
                          // If some agents were already selected, show them for quick reference/toggling
                          const selectedAgents = availableInModal.filter((ag: any) =>
                            selectedAgentIdsInModal.includes(ag.idAgente || ag.id)
                          );

                          if (selectedAgents.length > 0) {
                            return (
                              <div className="space-y-3">
                                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2 px-1">
                                  <CheckCircle2 className="h-4 w-4 text-teal-500" />
                                  <span>Profesionales seleccionados ({selectedAgents.length}):</span>
                                </div>
                                {selectedAgents.map((ag: any) => {
                                  const agId = ag.idAgente || ag.id;
                                  return (
                                    <div
                                      key={`selected-${agId}-${ag.legajo}`}
                                      onClick={() => handleToggleAgentInModal(agId)}
                                      className="flex items-center justify-between p-3.5 rounded-xl cursor-pointer border bg-teal-500/10 border-teal-500/50 shadow-xs ring-1 ring-teal-500/20 text-xs sm:text-sm select-none"
                                    >
                                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                        <input
                                          type="checkbox"
                                          checked={true}
                                          onChange={() => {}}
                                          className="h-5 w-5 rounded border-border text-teal-600 focus:ring-teal-500 cursor-pointer shrink-0"
                                        />
                                        <div className="min-w-0">
                                          <p className="font-bold text-foreground text-sm truncate">{ag.nombre}</p>
                                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                            {ag.legajo && (
                                              <span className="px-2 py-0.5 rounded bg-muted/80 font-mono text-xs">
                                                Legajo: <strong className="text-foreground">{ag.legajo}</strong>
                                              </span>
                                            )}
                                            {ag.cuil && (
                                              <span className="px-2 py-0.5 rounded bg-muted/80 font-mono text-xs">
                                                CUIL: <strong className="text-foreground">{ag.cuil}</strong>
                                              </span>
                                            )}
                                            {ag.hospitalNombre && (
                                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                                {ag.hospitalNombre}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="shrink-0 ml-3">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-teal-600 text-white shadow-xs">
                                          <Check className="h-3.5 w-3.5" />
                                          Seleccionado
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }

                          return (
                            <div className="py-14 text-center flex flex-col items-center justify-center gap-3 text-muted-foreground">
                              <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground/80">
                                {searchTab === "single" ? (
                                  <Search className="h-6 w-6" />
                                ) : (
                                  <FileSpreadsheet className="h-6 w-6 text-emerald-500" />
                                )}
                              </div>
                              <div className="max-w-xs space-y-1">
                                <p className="font-semibold text-foreground text-sm">
                                  {searchTab === "single"
                                    ? "Buscador de Profesionales"
                                    : "Pegar Lote de Excel"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {searchTab === "single"
                                    ? "Ingrese un término de búsqueda y haga clic en Buscar para encontrar profesionales."
                                    : "Copie y pegue una lista de CUILs o nombres y haga clic en Buscar Coincidencias en Excel."}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        let filteredInModal: any[] = [];

                        if (searchTab === "single") {
                          const q = submittedSearchQuery.toLowerCase().trim();
                          filteredInModal = availableInModal.filter((ag: any) => {
                            const nombre = (ag.nombre || "").toLowerCase();
                            const cuil = (ag.cuil || "").toLowerCase();
                            const legajo = (ag.legajo || "").toLowerCase();
                            const cargo = (ag.cargo || "").toLowerCase();
                            const hospital = (ag.hospitalNombre || "").toLowerCase();
                            return (
                              nombre.includes(q) ||
                              cuil.includes(q) ||
                              legajo.includes(q) ||
                              cargo.includes(q) ||
                              hospital.includes(q)
                            );
                          });
                        } else {
                          filteredInModal = availableInModal.filter((ag: any) => {
                            const agName = (ag.nombre || "").toLowerCase();
                            const agCuilDigits = (ag.cuil || "").replace(/[^\d]/g, "");
                            const agLegajo = (ag.legajo || "").toLowerCase().trim();
                            const agLegajoDigits = (ag.legajo || "").replace(/[^\d]/g, "");
                            const agIdStr = String(ag.idAgente || ag.id || "");

                            return submittedBatchTerms.some((term) => {
                              const cleanText = term.toLowerCase().trim();
                              const cleanDigits = term.replace(/[^\d]/g, "");

                              const matchDigits =
                                cleanDigits.length >= 6 &&
                                ((agCuilDigits && (agCuilDigits === cleanDigits || agCuilDigits.includes(cleanDigits))) ||
                                  (agLegajoDigits && agLegajoDigits === cleanDigits) ||
                                  (agIdStr && agIdStr === cleanDigits));

                              const matchText =
                                cleanText.length >= 3 &&
                                (agName.includes(cleanText) ||
                                  cleanText.includes(agName) ||
                                  agLegajo.includes(cleanText) ||
                                  (cleanText.includes(" ") &&
                                    cleanText
                                      .split(" ")
                                      .filter((w) => w.length > 2)
                                      .every((w) => agName.includes(w))));

                              return matchDigits || matchText;
                            });
                          });
                        }

                        return (
                          <div className="space-y-3">
                            {/* Batch Unmatched Alert */}
                            {searchTab === "batch" && unmatchedBatchTerms.length > 0 && (
                              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                  <span>
                                    {unmatchedBatchTerms.length} término(s) de su Excel no tuvieron coincidencias en la nómina:
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono bg-background/50 p-2 rounded-lg max-h-20 overflow-y-auto">
                                  {unmatchedBatchTerms.join(", ")}
                                </div>
                              </div>
                            )}

                            {filteredInModal.length === 0 ? (
                              <div className="py-14 text-center text-xs text-muted-foreground">
                                {searchTab === "single" ? (
                                  <>
                                    No se encontraron profesionales que coincidan con &ldquo;
                                    <strong className="text-foreground">{submittedSearchQuery}</strong>
                                    &rdquo;.
                                  </>
                                ) : (
                                  <>
                                    No se encontraron profesionales para ninguno de los términos pegados desde Excel.
                                  </>
                                )}
                              </div>
                            ) : (
                              filteredInModal.map((ag: any) => {
                                const agId = ag.idAgente || ag.id;
                                const isSelected = selectedAgentIdsInModal.includes(agId);

                                return (
                                  <div
                                    key={`${agId}-${ag.legajo}`}
                                    onClick={() => handleToggleAgentInModal(agId)}
                                    className={cn(
                                      "flex items-center justify-between p-3.5 sm:p-4 rounded-xl cursor-pointer transition-all duration-150 border text-xs sm:text-sm select-none",
                                      isSelected
                                        ? "bg-teal-500/10 border-teal-500/50 shadow-xs ring-1 ring-teal-500/20"
                                        : "bg-card border-border/80 hover:bg-muted/40 hover:border-border shadow-2xs"
                                    )}
                                  >
                                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}} // handled by row click
                                        className="h-5 w-5 rounded border-border text-teal-600 focus:ring-teal-500 cursor-pointer shrink-0"
                                      />
                                      <div className="min-w-0">
                                        <p className="font-bold text-foreground text-sm truncate">
                                          {ag.nombre}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                          {ag.legajo && (
                                            <span className="px-2 py-0.5 rounded bg-muted/80 font-mono text-xs">
                                              Legajo: <strong className="text-foreground">{ag.legajo}</strong>
                                            </span>
                                          )}
                                          {ag.cuil && (
                                            <span className="px-2 py-0.5 rounded bg-muted/80 font-mono text-xs">
                                              CUIL: <strong className="text-foreground">{ag.cuil}</strong>
                                            </span>
                                          )}
                                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">
                                            {ag.cargo}
                                          </span>
                                          {ag.hospitalNombre && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                              {ag.hospitalNombre}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="shrink-0 ml-3">
                                      <span
                                        className={cn(
                                          "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-colors",
                                          isSelected
                                            ? "bg-teal-600 text-white shadow-xs"
                                            : "bg-muted text-muted-foreground"
                                        )}
                                      >
                                        {isSelected && <Check className="h-3.5 w-3.5" />}
                                        {isSelected ? "Seleccionado" : "Elegir"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Dialog Footer */}
                    <DialogFooter className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAddModalOpen(false)}
                        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Cancelar
                      </Button>
                      <div className="flex items-center gap-2.5">
                        <Button
                          type="button"
                          onClick={handleConfirmAddAgentsFromModal}
                          disabled={selectedAgentIdsInModal.length === 0}
                          className="bg-teal-600 hover:bg-teal-500 text-zinc-950 font-bold text-xs h-9 px-4 cursor-pointer gap-1.5 shadow-sm"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Añadir {selectedAgentIdsInModal.length > 0 ? `(${selectedAgentIdsInModal.length})` : ""} a la Liquidación
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 text-muted-foreground">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-semibold text-3xs uppercase py-2">PRESTADOR</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase">PUESTO LABORAL</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">HONORARIOS ($)</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">SOBREASIGNACIÓN ($)</TableHead>
                    <TableHead className="font-semibold text-3xs uppercase text-right">TOTAL AGENTE</TableHead>
                    {isHospitalUser && (
                      <TableHead className="font-semibold text-3xs uppercase text-center w-12">QUITAR</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgentRows.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={isHospitalUser ? 6 : 5} className="text-center text-muted-foreground text-xs py-8">
                        {agentSearchQuery.trim()
                          ? "No se encontraron agentes que coincidan con la búsqueda."
                          : isHospitalUser
                          ? "La lista de distribución está vacía. Seleccione arriba los profesionales del período para añadirlos uno por uno."
                          : "Aún no se han registrado distribuciones de profesionales por parte de los establecimientos de salud para esta liquidación."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgentRows.map((agent: any) => {
                      const totalAgente =
                        Number(agent.honorarios || 0) +
                        Number(agent.sobreasignaciones || 0);

                      return (
                        <TableRow
                          key={`${agent.agentId}-${agent.legajo}`}
                          className="hover:bg-muted/40 border-border text-foreground text-xs"
                        >
                          <TableCell className="text-3xs whitespace-normal break-words py-2.5">
                            <div className="font-bold text-foreground text-xs">
                              {agent.hospitalNombre || agent.nombre}
                            </div>
                            {agent.hospitalNombre && agent.nombre && (
                              <div className="text-3xs text-muted-foreground font-medium mt-0.5">
                                {agent.nombre}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-3xs text-muted-foreground whitespace-nowrap">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-muted font-medium text-3xs">
                              {agent.cargo}
                            </span>
                          </TableCell>

                          {/* HONORARIOS INDIVIDUALES */}
                          <TableCell className="text-right px-1 py-1">
                            {isHospitalUser ? (
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
                            ) : (
                              <span className="font-mono text-3xs font-semibold text-teal-600 dark:text-teal-400 px-2">
                                {formatCurrency(agent.honorarios)}
                              </span>
                            )}
                          </TableCell>

                          {/* SOBREASIGNACION INDIVIDUAL */}
                          <TableCell className="text-right px-1 py-1">
                            {isHospitalUser ? (
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
                            ) : (
                              <span className="font-mono text-3xs font-semibold text-indigo-600 dark:text-indigo-400 px-2">
                                {formatCurrency(agent.sobreasignaciones)}
                              </span>
                            )}
                          </TableCell>

                          {/* TOTAL AGENTE */}
                          <TableCell className="text-right font-bold text-3xs px-2 py-1 text-foreground bg-muted/20">
                            {formatCurrency(totalAgente)}
                          </TableCell>

                          {/* QUITAR AGENTE (SOLO HOSPITAL) */}
                          {isHospitalUser && (
                            <TableCell className="text-center px-1 py-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={savingAgents}
                                onClick={() => handleRemoveAgent(agent.agentId)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                                title="Quitar de la lista de distribución"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
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
