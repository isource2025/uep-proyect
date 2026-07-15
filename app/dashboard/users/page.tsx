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
import { UserPlus, Search, ShieldCheck, Mail, Users2 } from "lucide-react";

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

  // Server Action to add a user (imPersonal + Account)
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
      const maxVal = await prisma.user.aggregate({
        _max: { id: true }
      });
      const nextId = (maxVal._max.id || 0) + 1;

      // Hash password using Better Auth context helper
      const authContext = await auth.$context;
      const hashedPassword = await authContext.password.hash(password);

      // Create imPersonal record (User model)
      const newUser = await prisma.user.create({
        data: {
          id: nextId,
          name: name.toUpperCase(),
          email: email.toLowerCase(),
          password: hashedPassword,
          role,
          operador: operador || email.split("@")[0].substring(0, 10),
          cuit,
          hospitalId: hospitalIdStr ? parseInt(hospitalIdStr, 10) : null,
          matricula: nextId, // Unique dummy matricula to satisfy KPorMatricula constraint
          emailVerified: true,
        },
      });

      // Create credentials Account record for Better Auth login
      await prisma.account.create({
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

      revalidatePath("/dashboard/users");
    } catch (e) {
      console.error("Error creating user in imPersonal:", e);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Módulo 1: Control de operadores, roles y asignación de efectores en la tabla `imPersonal`.
          </p>
        </div>

        {/* Create User Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer">
              <UserPlus className="h-4.5 w-4.5" />
              Nuevo Operador
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card text-card-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground font-bold">Registrar Nuevo Operador</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Crea un registro de personal en `imPersonal` y asocia credenciales de inicio de sesión.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateUser} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">
                  Apellido y Nombre
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="GARCIA JUAN CARLOS"
                  required
                  className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jgarcia@uep.gov.ar"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operador" className="text-foreground">
                    Código Operador (Max 10 chars)
                  </Label>
                  <Input
                    id="operador"
                    name="operador"
                    placeholder="jgarcia"
                    maxLength={10}
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">
                    Contraseña
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuit" className="text-foreground">
                    CUIT (CUIL)
                  </Label>
                  <Input
                    id="cuit"
                    name="cuit"
                    placeholder="20123456789"
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-foreground">
                    Rol Operador
                  </Label>
                  <select
                    id="role"
                    name="role"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={String(r.id)} className="bg-card text-foreground">
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hospitalId" className="text-foreground">
                    Lugar Trabajo / Efector
                  </Label>
                  <select
                    id="hospitalId"
                    name="hospitalId"
                    className="flex h-10 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
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
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10 cursor-pointer">
                  Guardar Operador
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & List Card */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="pb-4">
          <form method="GET" className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="query"
              placeholder="Buscar por nombre, operador o email..."
              defaultValue={query}
              className="bg-muted/40 border-border text-foreground placeholder-muted-foreground pl-10 pr-4 focus-visible:ring-emerald-500 h-10 w-full"
            />
          </form>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">Nombre</TableHead>
                  <TableHead className="font-semibold text-xs">Operador</TableHead>
                  <TableHead className="font-semibold text-xs">Email</TableHead>
                  <TableHead className="font-semibold text-xs">Rol ERP</TableHead>
                  <TableHead className="font-semibold text-xs">Establecimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Users2 className="h-8 w-8 text-muted-foreground animate-pulse" />
                        <p>No se encontraron operadores registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/40 border-border text-foreground">
                      <TableCell className="font-semibold text-foreground py-3.5">
                        {u.name}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 text-xs font-mono text-emerald-600 dark:text-emerald-400 border border-border">
                          {u.operador || "-"}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          {u.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          {roleMap.get(String(u.role)) || `Rol: ${u.role}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.hospital?.nombre || "Unidad Ejecutora (Sede)"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
