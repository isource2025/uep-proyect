"use client";

import { useMemo, useState } from "react";
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
import { EditUserModal, type HospitalOption, type RoleOption } from "./create-user-modal";
import { toggleUserStatusAction } from "./actions";
import { parseUserRoleIds, getUserRoleConfig, getUserRoleBadge } from "@/lib/constants";

export interface UserListItem {
  id: number;
  name: string;
  email: string | null;
  operador: string | null;
  cuit: string | null;
  role: string | null;
  estado: number | null;
  empresaId?: number;
  establecimiento: string;
}

interface UsersTableClientProps {
  users: UserListItem[];
  roles: RoleOption[];
  hospitals: HospitalOption[];
  uepCuit: string;
  initialQuery?: string;
}

function normalizeSearchText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tabla interactiva de operadores UEP con búsqueda dinámica en tiempo real
 * (filtra por nombre, operador, email, establecimiento, CUIT y roles asignados).
 */
export function UsersTableClient({
  users,
  roles,
  hospitals,
  uepCuit,
  initialQuery = "",
}: UsersTableClientProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery).trim();
    if (!normalizedQuery) return users;

    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return users.filter((u) => {
      const rolesText = parseUserRoleIds(u.role)
        .map((roleId) => getUserRoleConfig(roleId).name)
        .join(" ");

      const searchable = normalizeSearchText(
        `${u.name} ${u.operador || ""} ${u.email || ""} ${u.establecimiento} ${u.cuit || ""} ${rolesText}`
      );

      return terms.every((term) => searchable.includes(term));
    });
  }, [users, searchQuery]);

  const isFiltering = searchQuery.trim().length > 0;

  return (
    <Card className="border-border bg-card text-card-foreground">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <SearchBar
            name="query"
            placeholder="Buscar en tiempo real por nombre, operador, email, rol o efector..."
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery("")}
            onSubmit={(e) => e.preventDefault()}
            showSubmitButton={false}
            className="w-full sm:max-w-md"
          />
          {isFiltering && (
            <span className="text-xs text-muted-foreground font-medium">
              Mostrando <strong className="text-foreground">{filteredUsers.length}</strong> de{" "}
              <strong className="text-foreground">{users.length}</strong> operadores
            </span>
          )}
        </div>
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
              {filteredUsers.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Users2 className="h-8 w-8 text-muted-foreground animate-pulse" />
                      <p>
                        {isFiltering
                          ? `No se encontraron operadores que coincidan con "${searchQuery.trim()}".`
                          : "No se encontraron operadores registrados."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => {
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
                            const userRoles = parseUserRoleIds(u.role);
                            if (userRoles.length === 0) {
                              return <span className="text-muted-foreground text-3xs italic">Sin rol</span>;
                            }
                            return userRoles.map((roleId) => {
                              const config = getUserRoleConfig(roleId);
                              return (
                                <span
                                  key={roleId}
                                  title={config.description}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-3xs font-semibold border",
                                    getUserRoleBadge(roleId)
                                  )}
                                >
                                  <ShieldCheck className="h-3 w-3 shrink-0" />
                                  {config.name}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate max-w-[180px]">{u.establecimiento}</span>
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
                              hospitalId: u.empresaId,
                            }}
                            roles={roles}
                            hospitals={hospitals}
                            uepCuit={uepCuit}
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
  );
}
