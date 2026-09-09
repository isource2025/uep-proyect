"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadCloud, UploadCloud, RefreshCw, AlertCircle, CheckCircle2, Save, UserPlus, Trash2, Plus, Check } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { bulkSaveDistributions } from "./actions";
import * as XLSX from "xlsx";

interface Agent {
  id: number;
  cuil: string | null;
  nombre: string;
  cargo: string | null;
  establecimiento: string | null;
}

interface Distribution {
  id: string;
  agentId: number;
  honorarios: any;
  sobreasignaciones: any;
  gastos: any;
}

interface DistributionGridProps {
  liquidationId: number;
  hospitalId: number;
  netoFinalLimit: number;
  agents: Agent[];
  initialDistributions: Distribution[];
  onSuccess?: () => void;
}

interface GridRow {
  agentId: number;
  nombre: string;
  cuil: string;
  cargo: string;
  honorarios: number;
  sobreasignaciones: number;
  gastos: number;
}

export default function DistributionGrid({
  liquidationId,
  hospitalId,
  netoFinalLimit,
  agents,
  initialDistributions,
  onSuccess,
}: DistributionGridProps) {
  const [rows, setRows] = useState<GridRow[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [selectedAgentIdsInModal, setSelectedAgentIdsInModal] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Initialize grid rows starting ONLY with agents that already have distributions saved
    const initialRows: GridRow[] = (initialDistributions || [])
      .map((dist) => {
        const agent = agents.find((a) => a.id === dist.agentId);
        if (!agent) return null;
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
          honorarios: Number(dist.honorarios || 0),
          sobreasignaciones: Number(dist.sobreasignaciones || 0),
          gastos: Number(dist.gastos || 0),
        };
      })
      .filter(Boolean) as GridRow[];

    setRows(initialRows);
  }, [agents, initialDistributions]);

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

  const handleConfirmAddAgentsFromModal = () => {
    if (selectedAgentIdsInModal.length === 0) {
      setIsAddModalOpen(false);
      return;
    }

    const agentsToAdd = agents.filter(
      (ag) => selectedAgentIdsInModal.includes(ag.id) && !rows.some((r) => r.agentId === ag.id)
    );

    const newRows: GridRow[] = agentsToAdd.map((ag) => {
      const cargoStr =
        ag.cargo === "1"
          ? "ADMINISTRATIVO"
          : ag.cargo === "2"
          ? "MEDICO"
          : ag.cargo === "3"
          ? "ENFERMERO"
          : ag.cargo || "PROFESIONAL";

      return {
        agentId: ag.id,
        nombre: ag.nombre,
        cuil: ag.cuil || "",
        cargo: cargoStr,
        honorarios: 0,
        sobreasignaciones: 0,
        gastos: 0,
      };
    });

    setRows((prev) => [...prev, ...newRows]);
    setSelectedAgentIdsInModal([]);
    setModalSearchQuery("");
    setIsAddModalOpen(false);
    setSuccessMsg(`Se añadieron ${newRows.length} profesional(es) a la grilla.`);
  };

  const handleRemoveAgent = (agentId: number) => {
    setRows((prev) => prev.filter((r) => r.agentId !== agentId));
    setErrorMsg("");
  };

  // Aggregate stats
  const totalHonorarios = rows.reduce((sum, r) => sum + r.honorarios, 0);
  const totalSobreasignaciones = rows.reduce((sum, r) => sum + r.sobreasignaciones, 0);
  const totalGastos = rows.reduce((sum, r) => sum + r.gastos, 0);
  const totalDistributed = totalHonorarios + totalSobreasignaciones + totalGastos;
  const remaining = netoFinalLimit - totalDistributed;

  const handleInputChange = (agentId: number, field: keyof GridRow, value: string) => {
    const numVal = Math.max(0, parseFloat(value) || 0);
    setRows((prev) =>
      prev.map((row) => {
        if (row.agentId === agentId) {
          if (field === "honorarios" && numVal > 0) {
            return { ...row, honorarios: numVal, sobreasignaciones: 0 };
          }
          if (field === "sobreasignaciones" && numVal > 0) {
            return { ...row, sobreasignaciones: numVal, honorarios: 0 };
          }
          return { ...row, [field]: numVal };
        }
        return row;
      })
    );
    setErrorMsg("");
    setSuccessMsg("");
  };

  // Export spreadsheet template
  const handleExportTemplate = () => {
    const dataToExport = rows.map((r) => ({
      CUIL: r.cuil,
      "Apellido y Nombre": r.nombre,
      "Puesto Laboral": r.cargo,
      Honorarios: r.honorarios,
      Sobreasignaciones: r.sobreasignaciones,
      "Gastos de Funcionamiento": r.gastos,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Distribución");

    // Auto-fit column widths
    const maxLens = dataToExport.reduce((acc, row) => {
      Object.keys(row).forEach((key) => {
        const valStr = String(row[key as keyof typeof row] || "");
        acc[key] = Math.max(acc[key] || 0, valStr.length, key.length);
      });
      return acc;
    }, {} as Record<string, number>);

    worksheet["!cols"] = Object.keys(maxLens).map((key) => ({ wch: maxLens[key] + 3 }));

    XLSX.writeFile(workbook, `Plantilla_Distribucion_LIQ_${liquidationId}.xlsx`);
  };

  // Import spreadsheet data
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg("");
    setSuccessMsg("");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rowsParsed = XLSX.utils.sheet_to_json<any>(sheet);

        let matchCount = 0;
        const updatedRows = rows.map((currentRow) => {
          // Try to match agent by CUIL (clean strings)
          const cleanCuil = (val: string) => val.replace(/[^0-9]/g, "");
          const match = rowsParsed.find((excelRow) => {
            const excelCuil = String(excelRow.CUIL || excelRow.cuil || "").trim();
            return cleanCuil(excelCuil) === cleanCuil(currentRow.cuil);
          });

          if (match) {
            matchCount++;
            return {
              ...currentRow,
              honorarios: parseFloat(match.Honorarios || match.honorarios) || 0,
              sobreasignaciones: parseFloat(match.Sobreasignaciones || match.sobreasignaciones) || 0,
              gastos: parseFloat(match["Gastos de Funcionamiento"] || match.gastos || match.Gastos) || 0,
            };
          }
          return currentRow;
        });

        if (matchCount === 0) {
          setErrorMsg("No se encontraron agentes coincidentes en el archivo Excel por CUIL.");
          return;
        }

        setRows(updatedRows);
        setSuccessMsg(`Planilla importada con éxito. Se actualizaron ${matchCount} profesionales.`);
      } catch (err: any) {
        setErrorMsg("Error al analizar la planilla de Excel. Asegúrese de que mantenga el formato original.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ""; // Clear file input
  };

  // Submit bulk save
  const handleSave = async () => {
    if (remaining < 0) {
      setErrorMsg("El importe total distribuido supera el Neto Final permitido.");
      return;
    }

    const hasConflictingAgent = rows.find(
      (r) => Number(r.honorarios) > 0 && Number(r.sobreasignaciones) > 0
    );
    if (hasConflictingAgent) {
      setErrorMsg(
        `Regla de exclusividad: El profesional ${hasConflictingAgent.nombre} no puede percibir Honorarios y Sobreasignación simultáneamente.`
      );
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = rows.map((r) => ({
        agentId: r.agentId,
        honorarios: r.honorarios,
        sobreasignaciones: r.sobreasignaciones,
        gastos: r.gastos,
      }));

      const res = await bulkSaveDistributions(liquidationId, hospitalId, payload);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }

      setSuccessMsg("Planilla de distribución guardada correctamente.");
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1000);
      }
    } catch (e: any) {
      setErrorMsg("Error al guardar la planilla.");
    } finally {
      setSaving(false);
    }
  };

  if (!isClient) return null;

  return (
    <div className="space-y-5">
      {/* Metrics Card */}
      <div className="grid grid-cols-3 gap-4 border border-border p-4 rounded-lg bg-muted/40 text-center">
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground uppercase font-bold">Neto Final a Distribuir</span>
          <p className="text-base font-bold text-foreground">
            {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(netoFinalLimit)}
          </p>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Asignado</span>
          <p className="text-base font-bold text-blue-600 dark:text-blue-400">
            {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(totalDistributed)}
          </p>
        </div>
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground uppercase font-bold">Saldo Remanente</span>
          <p className={`text-base font-black ${remaining < 0 ? "text-red-500" : "text-emerald-500"}`}>
            {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(remaining)}
          </p>
        </div>
      </div>

      {/* Action Buttons: Import / Export Excel */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportTemplate}
            className="border-border text-foreground hover:bg-muted font-bold text-xs h-9 gap-1.5 cursor-pointer"
          >
            <DownloadCloud className="h-4 w-4" />
            Descargar Plantilla Excel
          </Button>

          <div className="relative">
            <input
              type="file"
              id="excel-distribution-file"
              accept=".xlsx, .xls"
              onChange={handleImportExcel}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button
              type="button"
              variant="outline"
              className="border-border text-foreground hover:bg-muted font-bold text-xs h-9 gap-1.5 cursor-pointer"
            >
              <UploadCloud className="h-4 w-4" />
              Importar Planilla Excel
            </Button>
          </div>
        </div>

        {saving ? (
          <Button disabled className="bg-emerald-600 text-zinc-950 font-bold text-xs h-9 gap-1.5">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Guardando Planilla...
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSave}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs h-9 gap-1.5 cursor-pointer px-6"
          >
            <Save className="h-4 w-4" />
            Guardar Distribución
          </Button>
        )}
      </div>

      {/* Selector para añadir profesionales con Modal */}
      {agents.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-amber-600 dark:text-amber-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="font-semibold">
            No se encontraron agentes en el padrón SISPER para este establecimiento en el período correspondiente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>
              Profesionales disponibles:{" "}
              <strong className="text-foreground">
                {agents.filter((ag) => !rows.some((r) => r.agentId === ag.id)).length}
              </strong>{" "}
              (de {agents.length} en el establecimiento)
            </span>
          </div>

          <Button
            type="button"
            onClick={() => {
              setSelectedAgentIdsInModal([]);
              setModalSearchQuery("");
              setIsAddModalOpen(true);
            }}
            disabled={saving || agents.filter((ag) => !rows.some((r) => r.agentId === ag.id)).length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1.5 h-8 text-xs shrink-0 cursor-pointer"
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
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  Seleccionar Profesionales para la Distribución
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Busque por nombre, apellido o CUIL. Puede seleccionar múltiples profesionales a la vez y agregarlos a la grilla.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Search Bar & Toolbar */}
          <div className="p-4 sm:p-5 border-b border-border bg-muted/20 space-y-3.5">
            <SearchBar
              placeholder="Buscar por apellido, nombre o CUIL..."
              value={modalSearchQuery}
              onChange={setModalSearchQuery}
              size="default"
              className="w-full shadow-xs"
            />

            {(() => {
              const availableInModal = agents.filter((ag) => !rows.some((r) => r.agentId === ag.id));
              const filteredInModal = availableInModal.filter((ag) => {
                if (!modalSearchQuery.trim()) return true;
                const q = modalSearchQuery.toLowerCase().trim();
                const nombre = (ag.nombre || "").toLowerCase();
                const cuil = (ag.cuil || "").toLowerCase();
                const cargo = (ag.cargo || "").toLowerCase();
                return nombre.includes(q) || cuil.includes(q) || cargo.includes(q);
              });

              const visibleIds = filteredInModal.map((ag) => ag.id);
              const allVisibleSelected =
                visibleIds.length > 0 && visibleIds.every((id: number) => selectedAgentIdsInModal.includes(id));

              return (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {selectedAgentIdsInModal.length} seleccionado(s)
                    </span>
                    <span className="text-muted-foreground text-xs">
                      ({filteredInModal.length} disponibles)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {visibleIds.length > 0 && (
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
              const availableInModal = agents.filter((ag) => !rows.some((r) => r.agentId === ag.id));
              const filteredInModal = availableInModal.filter((ag) => {
                if (!modalSearchQuery.trim()) return true;
                const q = modalSearchQuery.toLowerCase().trim();
                const nombre = (ag.nombre || "").toLowerCase();
                const cuil = (ag.cuil || "").toLowerCase();
                const cargo = (ag.cargo || "").toLowerCase();
                return nombre.includes(q) || cuil.includes(q) || cargo.includes(q);
              });

              if (filteredInModal.length === 0) {
                return (
                  <div className="py-14 text-center text-xs text-muted-foreground">
                    {modalSearchQuery.trim()
                      ? `No se encontraron profesionales que coincidan con "${modalSearchQuery}".`
                      : "Todos los profesionales disponibles ya han sido añadidos a la distribución."}
                  </div>
                );
              }

              return filteredInModal.map((ag) => {
                const isSelected = selectedAgentIdsInModal.includes(ag.id);

                return (
                  <div
                    key={ag.id}
                    onClick={() => handleToggleAgentInModal(ag.id)}
                    className={cn(
                      "flex items-center justify-between p-3.5 sm:p-4 rounded-xl cursor-pointer transition-all duration-150 border text-xs sm:text-sm select-none",
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/50 shadow-xs ring-1 ring-emerald-500/20"
                        : "bg-card border-border/80 hover:bg-muted/40 hover:border-border shadow-2xs"
                    )}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by row click
                        className="h-5 w-5 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">
                          {ag.nombre}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {ag.cuil && (
                            <span className="px-2 py-0.5 rounded bg-muted/80 font-mono text-xs">
                              CUIL: <strong className="text-foreground">{ag.cuil}</strong>
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">
                            {ag.cargo || "PROFESIONAL"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-colors",
                          isSelected
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                        {isSelected ? "Seleccionado" : "Elegir"}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Dialog Footer */}
          <DialogFooter className="p-4 sm:p-5 border-t border-border bg-muted/10 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              className="border-border text-xs h-9 px-4 cursor-pointer w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmAddAgentsFromModal}
              disabled={selectedAgentIdsInModal.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs h-9 gap-1.5 cursor-pointer px-5 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Añadir Selección ({selectedAgentIdsInModal.length}) a la Grilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Toast messages inside the card */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/25 p-3 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="font-semibold">{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-emerald-600 dark:text-emerald-400 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {/* Spreadsheet Grid Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card text-foreground">
        <div className="max-h-[45vh] overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm border-b border-border">
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground w-[220px]">Profesional (SISPER)</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground w-[120px]">CUIL</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground w-[120px]">Puesto Laboral</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground text-right w-[110px]">Honorarios ($)</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground text-right w-[110px]">Sobreasig. ($)</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground text-right w-[110px]">Gastos ($)</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground text-right w-[110px]">Total ($)</TableHead>
                <TableHead className="py-2 text-[10px] font-bold text-muted-foreground text-center w-[60px]">Quitar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-xs py-8">
                    La lista está vacía. Seleccione arriba los profesionales cargados en el período para añadirlos uno por uno.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const rowTotal = row.honorarios + row.sobreasignaciones + row.gastos;

                  return (
                    <TableRow key={row.agentId} className="hover:bg-muted/20 border-border text-foreground text-xs">
                      <TableCell className="py-2.5 font-bold text-foreground">{row.nombre}</TableCell>
                      <TableCell className="py-2.5 font-mono text-[11px] text-muted-foreground">{row.cuil}</TableCell>
                      <TableCell className="py-2.5 text-muted-foreground text-[10px]">{row.cargo}</TableCell>
                      <TableCell className="py-1 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.honorarios || ""}
                          onChange={(e) => handleInputChange(row.agentId, "honorarios", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-right bg-muted/20 border-border text-xs focus-visible:ring-emerald-500 w-24 ml-auto"
                        />
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.sobreasignaciones || ""}
                          onChange={(e) => handleInputChange(row.agentId, "sobreasignaciones", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-right bg-muted/20 border-border text-xs focus-visible:ring-emerald-500 w-24 ml-auto"
                        />
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.gastos || ""}
                          onChange={(e) => handleInputChange(row.agentId, "gastos", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-right bg-muted/20 border-border text-xs focus-visible:ring-emerald-500 w-24 ml-auto"
                        />
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                        {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(rowTotal)}
                      </TableCell>
                      <TableCell className="py-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAgent(row.agentId)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                          title="Quitar de la lista"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
