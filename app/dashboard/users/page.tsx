import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
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
import {
  UserPlus,
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
  });
  const roleMap = new Map(roles.map((r) => [String(r.id), r.nombre]));

  // Fetch public hospitals/providers
  const hospitals = await prisma.proveedor.findMany({
    where: { tipoProvId: 18 },
    orderBy: { nombre: "asc" },
  });

  // Server Action to add a user (imPersonal + Account) with estado = 1 (Activo)
  const handleCreateUser = async (formData: FormData) => {
    "use server";
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string;
    const cuit = formData.get("cuit") as string;
    const hospitalIdStr = formData.get("hospitalId") as string;
    const operador = formData.get("operador") as string;

    if (!name || !email || !password || !role) return;

    try {
      // Hash password using Better Auth context helper
      const authContext = await auth.$context;
      const hashedPassword = await authContext.password.hash(password);

      // Execute user and account creation atomically in a transaction
      await prisma.$transaction(async (tx) => {
        // Create imPersonal record with auto-generated identity Valor and Estado = 1 (Activo)
        const newUser = await tx.user.create({
          data: {
            name: name.toUpperCase(),
            email: email.toLowerCase(),
            password: hashedPassword,
            role,
            operador: operador || email.split("@")[0].substring(0, 10),
            cuit,
            hospitalId: hospitalIdStr ? parseInt(hospitalIdStr, 10) : null,
            emailVerified: true,
            estado: 1, // Nuevo usuario creado en modo Activo
          },
        });

        // Create credentials Account record for Better Auth login
        await tx.account.create({
          data: {
            id: `account-${newUser.id}`,
            accountId: email.toLowerCase(),
            providerId: "credential",
            userId: newUser.id,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      });

      revalidatePath("/dashboard/users");
    } catch (e) {
      console.error("Error creating user in imPersonal:", e);
    }
  };

  // Server Action to toggle user status (Dar de baja / Reactivar)
  const handleToggleUserStatus = async (formData: FormData) => {
    "use server";
    const userIdStr = formData.get("userId") as string;
    const currentEstadoStr = formData.get("currentEstado") as string;
    if (!userIdStr) return;

    const userId = parseInt(userIdStr, 10);
    const currentEstado = currentEstadoStr ? parseInt(currentEstadoStr, 10) : 1;
    const newEstado = currentEstado === 0 ? 1 : 0; // 0 = Inactivo (Baja), 1 = Activo

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { estado: newEstado },
        });
      });

      revalidatePath("/dashboard/users");
    } catch (e) {
      console.error("Error updating user estado in imPersonal:", e);
    }
  };

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

        {/* Create User Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer shadow-sm">
              <UserPlus className="h-4.5 w-4.5" />
              Nuevo Operador
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card text-card-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground font-bold">Registrar Nuevo Operador</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Crea un registro de personal en <code className="font-mono">imPersonal</code> en estado <strong>Activo</strong> y asocia sus credenciales de inicio de sesión.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateUser} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground text-xs font-semibold">
                  Apellido y Nombre
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="GARCIA JUAN CARLOS"
                  required
                  className="bg-muted/40 border-border text-foreground placeholder-muted-foreground text-xs h-9 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground text-xs font-semibold">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jgarcia@uep.gov.ar"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground text-xs h-9 focus-visible:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operador" className="text-foreground text-xs font-semibold">
                    Código Operador (Max 10)
                  </Label>
                  <Input
                    id="operador"
                    name="operador"
                    placeholder="jgarcia"
                    maxLength={10}
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground text-xs h-9 focus-visible:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground text-xs font-semibold">
                    Contraseña
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground text-xs h-9 focus-visible:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuit" className="text-foreground text-xs font-semibold">
                    CUIT (CUIL)
                  </Label>
                  <Input
                    id="cuit"
                    name="cuit"
                    placeholder="20123456789"
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground text-xs h-9 focus-visible:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-foreground text-xs font-semibold">
                    Rol Operador
                  </Label>
                  <select
                    id="role"
                    name="role"
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 cursor-pointer"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={String(r.id)} className="bg-card text-foreground">
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hospitalId" className="text-foreground text-xs font-semibold">
                    Lugar Trabajo / Efector
                  </Label>
                  <select
                    id="hospitalId"
                    name="hospitalId"
                    className="flex h-9 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 cursor-pointer"
                  >
                    <option value="" className="bg-card text-foreground">Ninguno (Sede UEP)</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id} className="bg-card text-foreground">
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold h-10 cursor-pointer shadow-sm">
                  Guardar Operador Activo
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Total Operadores
              </span>
              <p className="text-2xl font-black text-foreground font-mono">
                {totalCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Operadores Activos
              </span>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {activeCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xs uppercase font-bold text-muted-foreground tracking-wider">
                Inactivos / Dados de Baja
              </span>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                {inactiveCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <UserX className="h-6 w-6" />
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
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span className="text-xs">{roleMap.get(String(u.role)) || `Rol: ${u.role}`}</span>
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
                          <form action={handleToggleUserStatus} className="inline-block">
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
