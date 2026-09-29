import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
import { Building2, Plus, ShieldCheck, MapPin } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { isUserAdmin } from "@/lib/constants";

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

  // Efectores públicos: EMPRESAS
  const hospitals = await prisma.empresa.findMany({
    where: query
      ? {
          OR: [
            { descripcion: { contains: query } },
            { localidad: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { descripcion: "asc" },
  });

  // Server Action to add a hospital (Empresa) - ADMIN ONLY
  const handleCreateHospital = async (formData: FormData) => {
    "use server";
    const currentSession = await auth.api.getSession({ headers: await headers() });
    if (!isUserAdmin((currentSession?.user as any)?.role)) {
      throw new Error("Acceso denegado. Solo los administradores pueden crear hospitales.");
    }

    const name = formData.get("name") as string;
    const localidad = formData.get("localidad") as string;
    const cuitStr = formData.get("cuit") as string;

    if (!name) return;

    try {
      const maxId = await prisma.empresa.aggregate({
        _max: { id: true },
      });
      const nextId = (maxId._max.id || 0) + 1;

      await prisma.empresa.create({
        data: {
          id: nextId,
          descripcion: name.toUpperCase().trim(),
          localidad: localidad ? localidad.toUpperCase().trim() : null,
          cuit: cuitStr ? parseFloat(cuitStr.replace(/[^0-9]/g, "")) : null,
        },
      });
      revalidatePath("/dashboard/hospitals");
    } catch (e) {
      console.error("Error creating hospital in EMPRESAS:", e);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Hospitales</h1>
          <p className="text-sm text-muted-foreground">
            Efectores públicos (EMPRESAS): hospitales, CAPS y establecimientos de salud.
          </p>
        </div>

        {/* Create Hospital Modal (Admin Only) */}
        {isAdmin && (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer">
                <Plus className="h-4.5 w-4.5" />
                Nuevo Hospital
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card text-card-foreground max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground font-bold">Registrar Hospital / CAPS</DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  Crea un nuevo establecimiento en EMPRESAS para asociar facturaciones y distribuir honorarios médicos.
                </DialogDescription>
              </DialogHeader>
              <form action={handleCreateHospital} className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground">
                    Nombre del Hospital / CAPS *
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ej. HOSPITAL CENTRAL"
                    required
                    className="border-border bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="localidad" className="text-foreground">
                    Localidad
                  </Label>
                  <Input
                    id="localidad"
                    name="localidad"
                    placeholder="Ej. POSADAS"
                    className="border-border bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuit" className="text-foreground">
                    CUIT (Opcional)
                  </Label>
                  <Input
                    id="cuit"
                    name="cuit"
                    placeholder="Ej. 30123456789"
                    className="border-border bg-background"
                  />
                </div>
                <DialogFooter className="pt-2">
                  <Button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold cursor-pointer"
                  >
                    Guardar Hospital
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search & List Card */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader className="pb-4">
          <SearchBar
            name="query"
            placeholder="Buscar por nombre o localidad..."
            defaultValue={query}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">Nombre / Razón Social</TableHead>
                  <TableHead className="font-semibold text-xs">Localidad</TableHead>
                  <TableHead className="font-semibold text-xs">CUIT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-muted-foreground animate-pulse" />
                        <p>No se encontraron establecimientos registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  hospitals.map((hospital) => (
                    <TableRow key={hospital.id} className="hover:bg-muted/40 border-border text-foreground">
                      <TableCell className="font-semibold text-foreground py-3.5">
                        {hospital.descripcion || `Hospital ID ${hospital.id}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{hospital.localidad?.trim() || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-mono">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          {hospital.cuit ? String(hospital.cuit) : "-"}
                        </div>
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
