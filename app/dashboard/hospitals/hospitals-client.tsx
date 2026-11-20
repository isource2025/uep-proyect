"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/search-bar";
import { EditHospitalModal, type HospitalRecord, type ProveedorSuggestion } from "./hospital-modal";
import { toggleHospitalStatusAction } from "./actions";

interface HospitalsTableClientProps {
  hospitals: HospitalRecord[];
  proveedores: ProveedorSuggestion[];
  isAdmin: boolean;
  initialQuery?: string;
}

type StatusFilter = "active" | "inactive" | "all";

function normalizeSearchText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Listado interactivo de hospitales/CAPS (EMPRESAS) con filtro de estado (Activos/Inactivos/Todos),
 * búsqueda en tiempo real y baja lógica / reactivación segura.
 */
export function HospitalsTableClient({
  hospitals,
  proveedores,
  isAdmin,
  initialQuery = "",
}: HospitalsTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [confirmTarget, setConfirmTarget] = useState<HospitalRecord | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const active = hospitals.filter((h) => h.activo).length;
    const inactive = hospitals.length - active;
    return { active, inactive, all: hospitals.length };
  }, [hospitals]);

  const statusScopedHospitals = useMemo(() => {
    if (statusFilter === "active") return hospitals.filter((h) => h.activo);
    if (statusFilter === "inactive") return hospitals.filter((h) => !h.activo);
    return hospitals;
  }, [hospitals, statusFilter]);

  const filteredHospitals = useMemo(() => {
    const normalized = normalizeSearchText(searchQuery).trim();
    if (!normalized) return statusScopedHospitals;

    const terms = normalized.split(/\s+/).filter(Boolean);
    return statusScopedHospitals.filter((h) => {
      const searchable = normalizeSearchText(
        `${h.descripcion} ${h.localidad || ""} ${h.cuit || ""} ${h.email || ""}`
      );
      return terms.every((term) => searchable.includes(term));
    });
  }, [statusScopedHospitals, searchQuery]);

  const isFiltering = searchQuery.trim().length > 0;
  const colSpan = isAdmin ? 6 : 5;

  const handleConfirmToggleStatus = async () => {
    if (!confirmTarget) return;
    const nextActive = !confirmTarget.activo;
    setTogglingId(confirmTarget.id);
    setActionError(null);
    try {
      const res = await toggleHospitalStatusAction(confirmTarget.id, nextActive);
      if (res.error) {
        setActionError(res.error);
        return;
      }
      setConfirmTarget(null);
      router.refresh();
    } catch (err: any) {
      setActionError(err?.message || "No se pudo actualizar el estado del establecimiento.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="pb-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <SearchBar
              name="query"
              placeholder="Buscar en tiempo real por nombre, localidad, CUIT o correo..."
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery("")}
              onSubmit={(e) => e.preventDefault()}
              showSubmitButton={false}
              className="w-full lg:max-w-md"
            />

            {/* Selector de estado (Activos / Inactivos / Todos) */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1 self-start lg:self-auto">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  statusFilter === "active"
                    ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Activos ({counts.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  statusFilter === "inactive"
                    ? "bg-background text-rose-600 dark:text-rose-400 shadow-2xs border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Inactivos ({counts.inactive})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  statusFilter === "all"
                    ? "bg-background text-foreground shadow-2xs border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Todos ({counts.all})
              </button>
            </div>
          </div>

          {isFiltering && (
            <div className="text-xs text-muted-foreground font-medium">
              Mostrando <strong className="text-foreground">{filteredHospitals.length}</strong> de{" "}
              <strong className="text-foreground">{statusScopedHospitals.length}</strong> establecimientos
            </div>
          )}

          {actionError && !confirmTarget && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="break-words">{actionError}</span>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-3xs uppercase py-3">
                    Nombre / Razón Social
                  </TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Localidad</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">CUIT</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">
                    Correo Corporativo
                  </TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Estado</TableHead>
                  {isAdmin && (
                    <TableHead className="font-semibold text-3xs uppercase text-right">
                      Acciones
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHospitals.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={colSpan} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-muted-foreground opacity-60" />
                        <p className="break-words max-w-md">
                          {isFiltering
                            ? `No se encontraron establecimientos que coincidan con "${searchQuery.trim()}".`
                            : statusFilter === "inactive"
                            ? "No hay establecimientos inactivos o dados de baja."
                            : "No se encontraron establecimientos registrados."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHospitals.map((hospital) => (
                    <TableRow
                      key={hospital.id}
                      className={cn(
                        "hover:bg-muted/40 border-border text-foreground transition-colors",
                        !hospital.activo && "opacity-75 bg-muted/20"
                      )}
                    >
                      <TableCell className="font-semibold text-foreground py-3.5 text-xs whitespace-normal break-words max-w-[260px]">
                        {hospital.descripcion}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[160px]">{hospital.localidad || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-mono">
                          <ShieldCheck
                            className={`h-3.5 w-3.5 shrink-0 ${
                              hospital.cuit ? "text-emerald-500" : "text-muted-foreground/40"
                            }`}
                          />
                          <span>{hospital.cuit || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {hospital.email ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 font-mono text-2xs max-w-full">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[220px]" title={hospital.email}>
                              {hospital.email}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-3xs font-medium">
                            Sin correo asignado
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {hospital.activo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-400 text-[11px] font-semibold">
                            <Ban className="h-3 w-3 shrink-0" />
                            Inactivo
                          </span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <EditHospitalModal hospital={hospital} proveedores={proveedores} />

                            {hospital.activo ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={togglingId === hospital.id}
                                onClick={() => {
                                  setActionError(null);
                                  setConfirmTarget(hospital);
                                }}
                                title="Dar de baja (desactivar establecimiento)"
                                className="h-8 px-2.5 text-xs font-medium border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-700 cursor-pointer gap-1"
                              >
                                <Ban className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden xl:inline">Desactivar</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={togglingId === hospital.id}
                                onClick={() => {
                                  setActionError(null);
                                  setConfirmTarget(hospital);
                                }}
                                title="Reactivar establecimiento"
                                className="h-8 px-2.5 text-xs font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-700 cursor-pointer gap-1"
                              >
                                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden xl:inline">Reactivar</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de confirmación para desactivar / reactivar establecimiento */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open && togglingId === null) {
            setConfirmTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] sm:max-w-md bg-card border-border text-card-foreground">
          <DialogHeader className="text-left space-y-2 pr-6">
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              {confirmTarget?.activo ? (
                <>
                  <Ban className="h-5 w-5 text-rose-500 shrink-0" />
                  <span>Desactivar establecimiento</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span>Reactivar establecimiento</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed break-words">
              {confirmTarget?.activo ? (
                <>
                  ¿Confirmás dar de baja a{" "}
                  <strong className="text-foreground">{confirmTarget.descripcion}</strong>? Dejará de
                  figurar como activo en el listado principal, en la asignación de usuarios y en futuras
                  notificaciones, sin perder ningún historial ni modificar{" "}
                  <span className="font-mono">PROVEEDORES</span>. Podrás reactivarlo en cualquier
                  momento desde el filtro <strong>Inactivos</strong>.
                </>
              ) : (
                <>
                  ¿Confirmás reactivar a{" "}
                  <strong className="text-foreground">{confirmTarget?.descripcion}</strong>? Volverá a
                  aparecer como activo para asignación de usuarios y recepción de notificaciones.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words">{actionError}</span>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={togglingId !== null}
              onClick={() => {
                setConfirmTarget(null);
                setActionError(null);
              }}
              className="w-full sm:w-auto cursor-pointer text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={togglingId !== null}
              onClick={handleConfirmToggleStatus}
              className={cn(
                "w-full sm:w-auto cursor-pointer text-xs font-semibold gap-1.5",
                confirmTarget?.activo
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-zinc-950"
              )}
            >
              {togglingId !== null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando...
                </>
              ) : confirmTarget?.activo ? (
                <>
                  <Ban className="h-3.5 w-3.5" />
                  Confirmar Baja
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Confirmar Reactivación
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
