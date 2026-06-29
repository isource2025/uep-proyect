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
import { Building2, Plus, Search, ShieldCheck } from "lucide-react";

export const revalidate = 0;

export default async function HospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.query || "";

  // Fetch providers (hospitals) from DB based on search query
  const hospitals = await prisma.proveedor.findMany({
    where: {
      OR: [
        { nombre: { contains: query } },
        { code: { contains: query } },
      ],
    },
    orderBy: { nombre: "asc" },
  });

  // Server Action to add a hospital (Proveedor)
  const handleCreateHospital = async (formData: FormData) => {
    "use server";
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;
    const cuitStr = formData.get("cuit") as string;

    if (!name || !code) return;

    try {
      const maxId = await prisma.proveedor.aggregate({
        _max: { id: true }
      });
      const nextId = (maxId._max.id || 0) + 1;

      await prisma.proveedor.create({
        data: {
          id: nextId,
          nombre: name.toUpperCase(),
          code: code.toUpperCase().replace(/\s+/g, "_"),
          cuit: cuitStr ? parseFloat(cuitStr) : null,
        },
      });
      revalidatePath("/dashboard/hospitals");
    } catch (e) {
      console.error("Error creating hospital:", e);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestión de Hospitales</h1>
          <p className="text-sm text-muted-foreground">
            Administración y consulta de centros médicos y CAPS registrados en el sistema ERP.
          </p>
        </div>

        {/* Create Hospital Modal */}
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
                Crea un nuevo establecimiento para asociar facturaciones y distribuir honorarios médicos.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateHospital} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">
                  Nombre del Establecimiento
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Hospital Escuela José R. Vidal"
                  required
                  className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code" className="text-foreground">
                  Código de Identificación (ERP)
                </Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="HOSP_VIDAL"
                  required
                  className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cuit" className="text-foreground">
                  Nro CUIT
                </Label>
                <Input
                  id="cuit"
                  name="cuit"
                  placeholder="30123456789"
                  className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10 cursor-pointer">
                  Guardar Establecimiento
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
              placeholder="Buscar por nombre o código..."
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
                  <TableHead className="font-semibold text-xs">Código ERP</TableHead>
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
                        {hospital.nombre}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 text-xs font-mono text-emerald-600 dark:text-emerald-400 border border-border">
                          {hospital.code || "-"}
                        </code>
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
