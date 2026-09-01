"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  CalendarRange,
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Filter,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchAgentsData, importAgentsFromExcel } from "./actions";

interface AgentItem {
  periodo: string;
  idEmpresa: number;
  legajo: string;
  idAgente: number | null;
  apellidoyNombre: string;
  empresa: {
    id: number;
    descripcion: string;
    localidad: string;
    cuit: number | null;
  } | null;
}

interface EmpresaItem {
  id: number;
  descripcion: string;
  localidad: string;
  cuit: number | null;
}

interface AgentsClientProps {
  initialData: {
    agents: AgentItem[];
    totalCount: number;
    periods: string[];
    activePeriod: string;
    empresas: EmpresaItem[];
  };
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
    hospitalId?: number | null;
  };
}

export default function AgentsClient({ initialData, currentUser }: AgentsClientProps) {
  const router = useRouter();
  const isAdmin = currentUser?.role === "1" || !currentUser?.hospitalId;
  const hospitalId = currentUser?.hospitalId;

  // Local state
  const [data, setData] = useState(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState(initialData.activePeriod || "");
  const [selectedHospital, setSelectedHospital] = useState<number | undefined>(hospitalId || undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isLoading, setIsLoading] = useState(false);

  // Upload dialog state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPeriod, setUploadPeriod] = useState(
    initialData.activePeriod || new Date().toISOString().split("T")[0]
  );
  const [uploading, setUploading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch updated data when filters change
  const loadData = async (
    period: string,
    hospId: number | undefined,
    search: string,
    page: number,
    limit: number
  ) => {
    setIsLoading(true);
    try {
      const res = await fetchAgentsData(period, hospId, search, page, limit);
      if (res.success) {
        setData({
          agents: res.agents || [],
          totalCount: res.totalCount || 0,
          periods: res.periods || [],
          activePeriod: res.activePeriod || "",
          empresas: res.empresas || [],
        });
      }
    } catch (e) {
      console.error("Error loading agents:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    setCurrentPage(1);
    loadData(newPeriod, selectedHospital, searchQuery, 1, itemsPerPage);
  };

  const handleHospitalChange = (hospIdStr: string) => {
    const hospId = hospIdStr ? parseInt(hospIdStr, 10) : undefined;
    setSelectedHospital(hospId);
    setCurrentPage(1);
    loadData(selectedPeriod, hospId, searchQuery, 1, itemsPerPage);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData(selectedPeriod, selectedHospital, searchQuery, 1, itemsPerPage);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    loadData(selectedPeriod, selectedHospital, searchQuery, newPage, itemsPerPage);
  };

  const handleItemsPerPageChange = (newLimit: number) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);
    loadData(selectedPeriod, selectedHospital, searchQuery, 1, newLimit);
  };

  const handleUploadExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setFeedbackMsg({ type: "error", text: "Por favor seleccione un archivo Excel (.xlsx)." });
      return;
    }

    setUploading(true);
    setFeedbackMsg(null);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("period", uploadPeriod);

    try {
      const res = await importAgentsFromExcel(formData);
      if (res.error) {
        setFeedbackMsg({ type: "error", text: res.error });
        return;
      }

      const countNum = res.count || 0;
      setFeedbackMsg({
        type: "success",
        text: `¡Importación exitosa! Se procesaron ${countNum.toLocaleString("es-AR")} agentes para el período ${res.period || uploadPeriod}.`,
      });

      // Refresh list
      setSelectedPeriod(uploadPeriod);
      setCurrentPage(1);
      await loadData(uploadPeriod, selectedHospital, "", 1, itemsPerPage);

      setTimeout(() => {
        setIsUploadOpen(false);
        setUploadFile(null);
      }, 2000);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: "Error inesperado al importar el archivo Excel." });
    } finally {
      setUploading(false);
    }
  };

  const totalPages = Math.ceil(data.totalCount / itemsPerPage) || 1;

  // Format date display
  const formatPeriodDisplay = (pStr: string) => {
    if (!pStr) return "-";
    const [year, month] = pStr.split("-");
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const mIdx = parseInt(month, 10) - 1;
    return `${months[mIdx] || month} ${year}`;
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Users className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Nómina de Agentes Sanitarios (MSP / SISPER)
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "Consulta y gestión global de agentes del Ministerio de Salud Pública distribuidos por establecimiento."
              : `Nómina de profesionales y personal del establecimiento ${currentUser?.name || ""}.`}
          </p>
        </div>

        {/* Upload Button for Admin */}
        {isAdmin && (
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-2 text-xs h-9 cursor-pointer shadow-sm">
                <FileSpreadsheet className="h-4 w-4" />
                Subir Planilla Excel SISPER
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground font-bold flex items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-emerald-500" />
                  Importar Nómina de Agentes Mensual
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  Suba el archivo Excel oficial exportado de SISPER / Arancelamiento (ej. <em>JUNIO ARAN 2026.xlsx</em>). El sistema matchea automáticamente cada agente con su Centro de Salud según la columna del Lugar de Pago.
                </DialogDescription>
              </DialogHeader>

              {feedbackMsg && (
                <div
                  className={cn(
                    "p-3 rounded-lg border text-xs flex items-center gap-2",
                    feedbackMsg.type === "success"
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
                  )}
                >
                  {feedbackMsg.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  {feedbackMsg.text}
                </div>
              )}

              <form onSubmit={handleUploadExcel} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="uploadPeriod" className="text-xs font-semibold">
                    Período / Mes Correspondiente:
                  </Label>
                  <Input
                    id="uploadPeriod"
                    type="date"
                    value={uploadPeriod}
                    onChange={(e) => setUploadPeriod(e.target.value)}
                    required
                    className="bg-muted/40 border-border text-foreground text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="excelFile" className="text-xs font-semibold">
                    Archivo Excel (.xlsx, .xls, .csv):
                  </Label>
                  <Input
                    id="excelFile"
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    required
                    className="bg-muted/40 border-border text-foreground text-xs h-9 cursor-pointer file:cursor-pointer"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsUploadOpen(false)}
                    disabled={uploading}
                    className="border-border text-xs h-9 cursor-pointer"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploading || !uploadFile}
                    className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs h-9 cursor-pointer gap-2"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Procesando Excel...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4" />
                        Importar Agentes
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Total Agentes Registrados
              </span>
              <p className="text-2xl font-black text-foreground font-mono">
                {data.totalCount.toLocaleString("es-AR")}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Centros de Salud Mapeados
              </span>
              <p className="text-2xl font-black text-foreground font-mono">
                {data.empresas.length}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Período Activo
              </span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatPeriodDisplay(selectedPeriod)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <CalendarRange className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border bg-card text-card-foreground shadow-sm">
        <CardHeader className="p-4 pb-3 border-b border-border/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Filter controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period selector */}
            <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1 text-xs">
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-3xs font-bold uppercase text-muted-foreground">Período:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="bg-transparent border-none text-foreground font-semibold text-xs focus:outline-none cursor-pointer"
              >
                {data.periods.length === 0 ? (
                  <option value="" className="bg-card text-foreground">
                    Sin períodos cargados
                  </option>
                ) : (
                  data.periods.map((p) => (
                    <option key={p} value={p} className="bg-card text-foreground">
                      {formatPeriodDisplay(p)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Hospital selector for Admins */}
            {isAdmin && (
              <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1 text-xs max-w-xs">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-3xs font-bold uppercase text-muted-foreground">Establecimiento:</span>
                <select
                  value={selectedHospital || ""}
                  onChange={(e) => handleHospitalChange(e.target.value)}
                  className="bg-transparent border-none text-foreground font-semibold text-xs focus:outline-none cursor-pointer truncate"
                >
                  <option value="" className="bg-card text-foreground">
                    Todos los Establecimientos ({data.empresas.length})
                  </option>
                  {data.empresas.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-card text-foreground">
                      {emp.id} - {emp.descripcion}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* SearchBar */}
          <SearchBar
            placeholder="Buscar por apellido, nombre o legajo..."
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={handleSearchSubmit}
            isLoading={isLoading}
            size="sm"
            className="w-full md:w-80"
          />
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-3xs uppercase py-2.5">LEGAJO</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">APELLIDO Y NOMBRE</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-center">PUESTO / ID AGENTE</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">ESTABLECIMIENTO (EMPRESA)</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">LOCALIDAD</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">PERÍODO</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className={cn(isLoading && "opacity-50 pointer-events-none transition-opacity duration-200")}>
                {data.agents.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <p>
                          {searchQuery.trim()
                            ? "No se encontraron agentes que coincidan con la búsqueda."
                            : "No hay agentes registrados para el período y establecimiento seleccionados."}
                        </p>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsUploadOpen(true)}
                            className="mt-2 text-xs border-border cursor-pointer gap-1.5"
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            Importar archivo Excel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.agents.map((ag, idx) => (
                    <TableRow
                      key={`${ag.idEmpresa}-${ag.legajo}-${ag.periodo}-${idx}`}
                      className="hover:bg-muted/40 border-border text-foreground text-xs"
                    >
                      <TableCell className="font-mono text-3xs font-bold text-foreground py-2.5">
                        {ag.legajo}
                      </TableCell>
                      <TableCell className="font-semibold text-3xs max-w-[240px] whitespace-normal break-words">
                        {ag.apellidoyNombre}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-muted font-mono text-3xs font-semibold">
                          {ag.idAgente !== null ? `Puesto ${ag.idAgente}` : "Personal"}
                        </span>
                      </TableCell>
                      <TableCell className="text-3xs max-w-[280px] whitespace-normal break-words">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-3xs text-muted-foreground font-bold">
                            [{ag.idEmpresa}]
                          </span>
                          <span className="font-medium text-foreground">
                            {ag.empresa?.descripcion || `Centro ${ag.idEmpresa}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-3xs text-muted-foreground">
                        {ag.empresa?.localidad || "CORRIENTES"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-3xs text-muted-foreground">
                        {ag.periodo}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {data.totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border p-4 gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Mostrar</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  className="bg-muted/40 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value={20} className="bg-card text-foreground">20</option>
                  <option value={50} className="bg-card text-foreground">50</option>
                  <option value={100} className="bg-card text-foreground">100</option>
                  <option value={200} className="bg-card text-foreground">200</option>
                </select>
                <span>por página</span>
              </div>

              <div>
                Mostrando{" "}
                <span className="font-semibold text-foreground">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>
                -
                <span className="font-semibold text-foreground">
                  {Math.min(currentPage * itemsPerPage, data.totalCount)}
                </span>{" "}
                de <span className="font-semibold text-foreground">{data.totalCount.toLocaleString("es-AR")}</span> agentes
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2 border border-border cursor-pointer disabled:opacity-50"
                >
                  Anterior
                </Button>

                <span className="px-2 font-bold text-foreground">
                  {currentPage} / {totalPages}
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                  disabled={currentPage >= totalPages}
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
