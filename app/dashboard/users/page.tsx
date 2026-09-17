import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Mail,
  Users2,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
  Building2,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import { CreateUserModal, EditUserModal } from "./create-user-modal";
import { toggleUserStatusAction } from "./actions";

export const revalidate = 0;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.query || "";

  // 1. Fetch users from imPersonal (those who have an email set)
  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      OR: [
        { name: { contains: query } },
        { email: { contains: query } },
        { operador: { contains: query } },
      ],
    },
    include: {
      hospital: true,
    },
    orderBy: { name: "asc" },
  });

  // Calculate metrics
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.estado !== 0).length;
  const inactiveCount = users.filter((u) => u.estado === 0).length;

  // Fetch roles for display
  const roles = await prisma.imRol.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  const roleMap = new Map(roles.map((r) => [String(r.id), r.nombre]));

  // Fetch public hospitals/providers
  const hospitals = await prisma.proveedor.findMany({
    where: { tipoProvId: 18 },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Módulo 1: Control de operadores, roles, estado y asignación de efectores en la tabla <code className="font-mono text-emerald-600 dark:text-emerald-400">imPersonal</code>.
          </p>
        </div>

        {/* Create User Modal with Eye password toggle */}
        <CreateUserModal roles={roles} hospitals={hospitals} />
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

      {/* Search & List Card */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="pb-4">
          <SearchBar
            name="query"
            placeholder="Buscar por nombre, operador o email..."
            defaultValue={query}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-3xs uppercase py-3">Nombre</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Operador</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Email</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Rol ERP</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase">Establecimiento</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-center">Estado</TableHead>
                  <TableHead className="font-semibold text-3xs uppercase text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users2 className="h-8 w-8 text-muted-foreground animate-pulse" />
                        <p>No se encontraron operadores registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const isActive = u.estado !== 0;

                    return (
                      <TableRow
                        key={u.id}
                        className={cn(
                          "hover:bg-muted/40 border-border text-foreground transition-colors",
                          !isActive && "opacity-60 bg-muted/20"
                        )}
                      >
                        <TableCell className="font-semibold text-foreground py-3.5 text-xs whitespace-normal break-words max-w-[200px]">
                          {u.name}
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-1 text-3xs font-mono text-emerald-600 dark:text-emerald-400 border border-border">
                            {u.operador || "-"}
                          </code>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[180px]">{u.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
                            {(() => {
                              const userRoles = (u.role || "").split(",").map((r) => r.trim()).filter(Boolean);
                              if (userRoles.length === 0) {
                                return <span className="text-muted-foreground text-3xs italic">Sin rol</span>;
                              }
                              return userRoles.map((roleId) => {
                                const roleName = roleMap.get(roleId) || `Rol: ${roleId}`;
                                const isAdmin = roleId === "1";
                                return (
                                  <span
                                    key={roleId}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-3xs font-semibold border ${
                                      isAdmin
                                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    }`}
                                  >
                                    <ShieldCheck className="h-3 w-3 shrink-0" />
                                    {roleName}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate max-w-[180px]">
                              {u.hospital?.nombre || "Unidad Ejecutora (Sede)"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                              <XCircle className="h-3 w-3 shrink-0" />
                              Inactivo
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <EditUserModal
                              user={{
                                id: u.id,
                                name: u.name,
                                email: u.email,
                                operador: u.operador,
                                cuit: u.cuit,
                                role: u.role,
                                hospitalId: u.hospitalId,
                              }}
                              roles={roles}
                              hospitals={hospitals}
                            />
                            <form action={toggleUserStatusAction} className="inline-block">
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="currentEstado" value={isActive ? 1 : 0} />
                              {isActive ? (
                                <Button
                                  type="submit"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-3xs border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer gap-1 px-2.5 transition-colors"
                                >
                                  <UserX className="h-3 w-3" />
                                  Dar de baja
                                </Button>
                              ) : (
                                <Button
                                  type="submit"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-3xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-600 cursor-pointer gap-1 px-2.5 transition-colors"
                                >
                                  <UserCheck className="h-3 w-3" />
                                  Reactivar
                                </Button>
                              )}
                            </form>
                          </div>
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
    </div>
  );
}
