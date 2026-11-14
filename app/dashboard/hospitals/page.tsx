import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, AlertCircle, ShieldAlert } from "lucide-react";
import { isUserAdmin } from "@/lib/constants";
import { cleanCuit } from "@/lib/hospital-mapping";
import { UEP_EMPRESA_ID } from "@/lib/hospital-resolver";
import { CreateHospitalModal } from "./hospital-modal";
import { HospitalsTableClient } from "./hospitals-client";
import type { HospitalRecord, ProveedorSuggestion } from "./hospital-modal";

export const revalidate = 0;

export default async function HospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAdmin = isUserAdmin((session?.user as any)?.role);

  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.query || "";

  // Efectores públicos: EMPRESAS (excluyendo Sede Central UEP id = 1) y PROVEEDORES con CUIT para autocompletar
  const [rawHospitals, rawProveedores] = await Promise.all([
    prisma.empresa.findMany({
      where: { id: { not: UEP_EMPRESA_ID } },
      select: {
        id: true,
        descripcion: true,
        localidad: true,
        cuit: true,
        email: true,
      },
      orderBy: { descripcion: "asc" },
    }),
    prisma.proveedor.findMany({
      where: { cuit: { not: null } },
      select: {
        id: true,
        nombre: true,
        cuit: true,
      },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const hospitals: HospitalRecord[] = rawHospitals.map((h) => ({
    id: h.id,
    descripcion: h.descripcion?.trim() || `Hospital ID ${h.id}`,
    localidad: h.localidad?.trim() || null,
    cuit: cleanCuit(h.cuit) || null,
    email: h.email?.trim() || null,
  }));

  const proveedores: ProveedorSuggestion[] = rawProveedores
    .map((p) => ({
      id: p.id,
      nombre: p.nombre?.trim() || `Proveedor #${p.id}`,
      cuit: cleanCuit(p.cuit),
    }))
    .filter((p) => p.cuit.length === 11);

  const totalCount = hospitals.length;
  const withoutCuitCount = hospitals.filter((h) => !h.cuit).length;
  const withoutEmailCount = hospitals.filter((h) => !h.email).length;

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gestión de Hospitales
          </h1>
          <p className="text-sm text-muted-foreground">
            Efectores públicos (EMPRESAS): datos institucionales y correos corporativos para notificaciones de liquidaciones.
          </p>
        </div>

        {/* Create Hospital Modal (Admin Only) */}
        {isAdmin && <CreateHospitalModal proveedores={proveedores} />}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Total Efectores
              </span>
              <p className="text-2xl sm:text-3xl font-black text-foreground font-mono truncate">
                {totalCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Sin CUIT Asignado
              </span>
              <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono truncate">
                {withoutCuitCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Pendientes de Correo
              </span>
              <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono truncate">
                {withoutEmailCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Search & Table */}
      <HospitalsTableClient
        hospitals={hospitals}
        proveedores={proveedores}
        isAdmin={isAdmin}
        initialQuery={query}
      />
    </div>
  );
}
