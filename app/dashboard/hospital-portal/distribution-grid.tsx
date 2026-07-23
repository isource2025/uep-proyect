"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadCloud, UploadCloud, RefreshCw, AlertCircle, CheckCircle2, Save } from "lucide-react";
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
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Initialize grid rows from agents & initial distributions
    const initialRows = agents.map((agent) => {
      const dist = initialDistributions.find((d) => d.agentId === agent.id);
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
        honorarios: dist ? Number(dist.honorarios) : 0,
        sobreasignaciones: dist ? Number(dist.sobreasignaciones) : 0,
        gastos: dist ? Number(dist.gastos) : 0,
      };
    });
    setRows(initialRows);
  }, [agents, initialDistributions]);

  // Aggregate stats
  const totalHonorarios = rows.reduce((sum, r) => sum + r.honorarios, 0);
  const totalSobreasignaciones = rows.reduce((sum, r) => sum + r.sobreasignaciones, 0);
  const totalGastos = rows.reduce((sum, r) => sum + r.gastos, 0);
  const totalDistributed = totalHonorarios + totalSobreasignaciones + totalGastos;
  const remaining = netoFinalLimit - totalDistributed;

  const handleInputChange = (agentId: number, field: keyof GridRow, value: string) => {
    const numVal = parseFloat(value) || 0;
    setRows((prev) =>
      prev.map((row) => (row.agentId === agentId ? { ...row, [field]: numVal } : row))
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-8">
                    No hay profesionales registrados en la nómina de SISPER para este establecimiento.
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
