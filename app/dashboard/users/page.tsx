import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Users2, UserCheck, UserX } from "lucide-react";
import { CreateUserModal } from "./create-user-modal";
import { UsersTableClient, type UserListItem } from "./users-client";
import { parseUserRoleIds, isUserAdmin, USER_ROLES } from "@/lib/constants";
import { cleanCuit } from "@/lib/hospital-mapping";
import { UEP_DEFAULT_CUIT, UEP_EMPRESA_ID } from "@/lib/hospital-resolver";

export const revalidate = 0;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isUserAdmin((session.user as any).role)) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.query || "";

  const trimmedQuery = query.trim();

  // 1. Fetch all UEP operators from imPersonal (requiere email y rol UEP asignado, excluyendo usuarios de iMedic)
  const rawUsers = await prisma.user.findMany({
    where: {
      AND: [
        { email: { not: null } },
        { email: { not: "" } },
        { role: { not: null } },
        { role: { not: "" } },
      ],
    },
    include: {
      hospital: true,
    },
    orderBy: { name: "asc" },
  });

  const hasValidUepRole = (roleStr?: string | null) =>
    parseUserRoleIds(roleStr).some((roleId) => Boolean(USER_ROLES[roleId]));

  const users = rawUsers.filter((u) => hasValidUepRole(u.role));

  // Calculate metrics exclusivamente sobre la nómina de operadores UEP con rol asignado
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.estado !== 0).length;
  const inactiveCount = users.filter((u) => u.estado === 0).length;

  // Centralized roles from lib/constants/user-roles.ts
  const roles = Object.values(USER_ROLES).map((r) => ({
    id: parseInt(r.id, 10),
    nombre: r.name,
  }));

  // Fetch intermediate relation imPersonalEmpresas
  const [empresas, personalEmpresas] = await Promise.all([
    prisma.empresa.findMany({
      select: { id: true, descripcion: true, cuit: true },
      orderBy: { descripcion: "asc" },
    }),
    prisma.imPersonalEmpresas.findMany({
      include: {
        empresa: {
          select: { id: true, descripcion: true },
        },
      },
    }),
  ]);

  const uepEmpresaRecord = empresas.find((e) => e.id === UEP_EMPRESA_ID);
  const uepCuit = cleanCuit(uepEmpresaRecord?.cuit) || UEP_DEFAULT_CUIT;

  const userEmpresaMap = new Map(
    personalEmpresas
      .filter((pe) => pe.idEmpresa !== UEP_EMPRESA_ID)
      .map((pe) => [
        pe.idPersonal,
        { idEmpresa: pe.idEmpresa, descripcion: pe.empresa?.descripcion?.trim() },
      ])
  );

  // imPersonal.hospitalId es un IDPROVEEDOR: su Empresa se resuelve EXCLUSIVAMENTE por CUIT (PROVEEDORES.NRO_CUIT === EMPRESAS.Nro_CUIT)
  const empresaByCuit = new Map<string, { idEmpresa: number; descripcion?: string }>();
  for (const e of empresas) {
    if (e.id === UEP_EMPRESA_ID) continue;
    const c = cleanCuit(e.cuit);
    if (c && !empresaByCuit.has(c)) empresaByCuit.set(c, { idEmpresa: e.id, descripcion: e.descripcion?.trim() });
  }
  const resolveUserEmpresa = (u: (typeof users)[number]) =>
    userEmpresaMap.get(u.id) ?? (u.hospital?.cuit ? empresaByCuit.get(cleanCuit(u.hospital.cuit)) : undefined);

  const hospitals = empresas
    .filter((e) => e.id !== UEP_EMPRESA_ID)
    .map((e) => ({
      id: e.id,
      nombre: e.descripcion?.trim() || `Hospital ${e.id}`,
      cuit: cleanCuit(e.cuit) || null,
    }));

  const serializedUsers: UserListItem[] = users.map((u) => {
    const resolvedEmpresa = resolveUserEmpresa(u);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      operador: u.operador,
      cuit: u.cuit,
      role: u.role,
      estado: u.estado,
      empresaId: resolvedEmpresa?.idEmpresa,
      establecimiento: resolvedEmpresa?.descripcion || "Sede Central UEP",
    };
  });

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Control de operadores, roles, estado y asignación de efectores sanitarios.
          </p>
        </div>

        {/* Create User Modal with Eye password toggle */}
        <CreateUserModal roles={roles} hospitals={hospitals} uepCuit={uepCuit} />
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Total Operadores
              </span>
              <p className="text-2xl sm:text-3xl font-black text-foreground font-mono truncate">
                {totalCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Users2 className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Operadores Activos
              </span>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                {activeCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3 min-w-0">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-2xs sm:text-3xs uppercase font-bold text-muted-foreground tracking-wider leading-tight block break-words">
                Inactivos / Dados de Baja
              </span>
              <p className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono truncate">
                {inactiveCount}
              </p>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <UserX className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Live Filtering List Card */}
      <UsersTableClient
        users={serializedUsers}
        roles={roles}
        hospitals={hospitals}
        uepCuit={uepCuit}
        initialQuery={trimmedQuery}
      />
    </div>
  );
}
