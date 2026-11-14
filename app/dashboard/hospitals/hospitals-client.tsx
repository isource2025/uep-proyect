"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Mail, MapPin, ShieldCheck } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { EditHospitalModal, type HospitalRecord, type ProveedorSuggestion } from "./hospital-modal";

interface HospitalsTableClientProps {
  hospitals: HospitalRecord[];
  proveedores: ProveedorSuggestion[];
  isAdmin: boolean;
  initialQuery?: string;
}

function normalizeSearchText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Listado interactivo de hospitales/CAPS (EMPRESAS) con búsqueda en tiempo real
 * por nombre, localidad, CUIT y correo corporativo de notificaciones.
 */
export function HospitalsTableClient({
  hospitals,
  proveedores,
  isAdmin,
  initialQuery = "",
}: HospitalsTableClientProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const filteredHospitals = useMemo(() => {
    const normalized = normalizeSearchText(searchQuery).trim();
    if (!normalized) return hospitals;

    const terms = normalized.split(/\s+/).filter(Boolean);
    return hospitals.filter((h) => {
      const searchable = normalizeSearchText(
        `${h.descripcion} ${h.localidad || ""} ${h.cuit || ""} ${h.email || ""}`
      );
      return terms.every((term) => searchable.includes(term));
    });
  }, [hospitals, searchQuery]);

  const isFiltering = searchQuery.trim().length > 0;
  const colSpan = isAdmin ? 5 : 4;

  return (
    <Card className="border-border bg-card text-card-foreground">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <SearchBar
            name="query"
            placeholder="Buscar en tiempo real por nombre, localidad, CUIT o correo..."
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery("")}
            onSubmit={(e) => e.preventDefault()}
            showSubmitButton={false}
            className="w-full sm:max-w-md"
          />
          {isFiltering && (
            <span className="text-xs text-muted-foreground font-medium">
              Mostrando <strong className="text-foreground">{filteredHospitals.length}</strong> de{" "}
              <strong className="text-foreground">{hospitals.length}</strong> establecimientos
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
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
                      <Building2 className="h-8 w-8 text-muted-foreground animate-pulse" />
                      <p>
                        {isFiltering
                          ? `No se encontraron establecimientos que coincidan con "${searchQuery.trim()}".`
                          : "No se encontraron establecimientos registrados."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredHospitals.map((hospital) => (
                  <TableRow
                    key={hospital.id}
                    className="hover:bg-muted/40 border-border text-foreground transition-colors"
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
                    {isAdmin && (
                      <TableCell className="text-right">
                        <EditHospitalModal hospital={hospital} proveedores={proveedores} />
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
  );
}
