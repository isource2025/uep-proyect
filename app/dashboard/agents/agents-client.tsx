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
  AlertTriangle,
  Stethoscope,
  Filter,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SisperImportModal } from "@/components/sisper-import-modal";
import { fetchAgentsData } from "./actions";

interface AgentItem {
  periodo: string;
  idEmpresa: number;
  legajo: string;
  idAgente: string | number | null;
  cuil?: string | number | null;
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
    empresaId?: number | null;
  };
  targetHospitalId?: number;
}

export default function AgentsClient({
  initialData,
  currentUser,
  targetHospitalId,
}: AgentsClientProps) {
  const router = useRouter();
  const isHospitalUser = currentUser?.role !== "1" && targetHospitalId !== undefined;
  const isAdmin = !isHospitalUser;

  // Local state
  const [data, setData] = useState(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState(initialData.activePeriod || "");
  const [selectedHospital, setSelectedHospital] = useState<number | undefined>(targetHospitalId);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isLoading, setIsLoading] = useState(false);

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

  const totalPages = Math.ceil(data.totalCount / itemsPerPage) || 1;

  // Format date display
  const formatPeriodDisplay = (pStr: string) => {
    if (!pStr) return "-";
    const parts = pStr.split("-");
    if (parts.length >= 2) {
      const [year, month] = parts;
      const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
      ];
      const mIdx = parseInt(month, 10) - 1;
      return `${months[mIdx] || month} ${year} (${month}/${year})`;
    }
    return pStr;
  };

  const formatMonthYearShort = (pStr: string) => {
    if (!pStr) return "-";
    const parts = pStr.split("-");
    if (parts.length >= 2) {
      const [year, month] = parts;
      return `${month}/${year}`;
    }
    return pStr;
  };

  const formatCuil = (val: string | number | null | undefined) => {
    if (!val) return "-";
    const clean = String(val).replace(/[^\d]/g, "");
    if (clean.length === 11) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
    }
    return clean || "-";
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

        {/* Upload Button for Admin using reusable SisperImportModal */}
        {isAdmin && (
          <SisperImportModal
            defaultPeriod={selectedPeriod}
            onSuccess={async (period) => {
              setSelectedPeriod(period);
              setCurrentPage(1);
              await loadData(period, selectedHospital, "", 1, itemsPerPage);
            }}
            trigger={
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-2 text-xs h-9 cursor-pointer shadow-sm">
                <FileSpreadsheet className="h-4 w-4" />
                Subir Planilla Excel SISPER
              </Button>
            }
          />
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
            <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1 text-xs max-w-xs">
              <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-3xs font-bold uppercase text-muted-foreground shrink-0">Período:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="bg-transparent border-none text-foreground font-semibold text-xs focus:outline-none cursor-pointer truncate min-w-0 w-auto"
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
              <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2.5 py-1 text-xs max-w-xs sm:max-w-md">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-3xs font-bold uppercase text-muted-foreground shrink-0">Establecimiento:</span>
                <select
                  value={selectedHospital || ""}
                  onChange={(e) => handleHospitalChange(e.target.value)}
                  className="bg-transparent border-none text-foreground font-semibold text-xs focus:outline-none cursor-pointer truncate min-w-0 w-full"
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
            placeholder="Buscar por CUIL, apellido, nombre o legajo..."
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
                  <TableHead className="font-semibold text-3xs uppercase py-2.5">CUIL</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">LEGAJO</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">APELLIDO Y NOMBRE</TableHead>
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
                          <SisperImportModal
                            defaultPeriod={selectedPeriod}
                            onSuccess={async (period) => {
                              setSelectedPeriod(period);
                              setCurrentPage(1);
                              await loadData(period, selectedHospital, "", 1, itemsPerPage);
                            }}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs border-border cursor-pointer gap-1.5"
                              >
                                <UploadCloud className="h-3.5 w-3.5" />
                                Importar archivo Excel
                              </Button>
                            }
                          />
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
                      <TableCell className="font-mono text-3xs font-bold text-teal-600 dark:text-teal-400 py-2.5 whitespace-nowrap">
                        {formatCuil(ag.cuil || ag.idAgente)}
                      </TableCell>
                      <TableCell className="font-mono text-3xs font-bold text-foreground">
                        {ag.legajo}
                      </TableCell>
                      <TableCell className="font-semibold text-3xs max-w-[240px] whitespace-normal break-words">
                        {ag.apellidoyNombre}
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
                      <TableCell className="text-right font-mono text-3xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMonthYearShort(ag.periodo)}
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
