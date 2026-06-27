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
import { Building2, Plus, Search, Calendar } from "lucide-react";

export const revalidate = 0;

export default async function HospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.query || "";

  // Fetch hospitals from DB based on search query
  const hospitals = await prisma.hospital.findMany({
    where: {
      OR: [
        { name: { contains: query } },
        { code: { contains: query } },
      ],
    },
    orderBy: { name: "asc" },
  });

  // Server Action to add a hospital
  const handleCreateHospital = async (formData: FormData) => {
    "use server";
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;

    if (!name || !code) return;

    try {
      await prisma.hospital.create({
        data: {
          name,
          code: code.toUpperCase().replace(/\s+/g, "_"),
        },
      });
      revalidatePath("/dashboard/hospitals");
    } catch (e) {
      console.error("Error creating hospital:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Gestión de Hospitales</h1>
          <p className="text-sm text-zinc-400">
            Administración y consulta de centros médicos y CAPS registrados en el sistema.
          </p>
        </div>

        {/* Create Hospital Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all">
              <Plus className="h-4.5 w-4.5" />
              Nuevo Hospital
            </Button>
          </DialogTrigger>
          <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Registrar Hospital / CAPS</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Crea un nuevo establecimiento para asociar facturaciones y distribuir honorarios médicos.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateHospital} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-300">
                  Nombre del Establecimiento
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Hospital Escuela José R. Vidal"
                  required
                  className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code" className="text-zinc-300">
                  Código de Identificación (ERP)
                </Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="HOSP_VIDAL"
                  required
                  className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-emerald-500"
                />
                <p className="text-[10px] text-zinc-500">
                  Debe coincidir con el identificador del hospital en los archivos del ERP.
                </p>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10">
                  Guardar Establecimiento
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & List Card */}
      <Card className="border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm text-zinc-100">
        <CardHeader className="pb-4">
          <form method="GET" className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              name="query"
              placeholder="Buscar por nombre o código..."
              defaultValue={query}
              className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 pl-10 pr-4 focus-visible:ring-emerald-500 h-10 w-full"
            />
          </form>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/40 text-zinc-400">
                <TableRow className="hover:bg-transparent border-zinc-800">
                  <TableHead className="font-semibold text-xs py-3">Nombre</TableHead>
                  <TableHead className="font-semibold text-xs">Código ERP</TableHead>
                  <TableHead className="font-semibold text-xs">Fecha de Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={3} className="text-center text-zinc-500 text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-zinc-600 animate-pulse" />
                        <p>No se encontraron establecimientos registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  hospitals.map((hospital) => (
                    <TableRow key={hospital.id} className="hover:bg-zinc-900/20 border-zinc-800 text-zinc-300">
                      <TableCell className="font-semibold text-white py-3.5">
                        {hospital.name}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-zinc-950 px-2 py-1 text-xs font-mono text-emerald-400 border border-zinc-850">
                          {hospital.code}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                          {new Date(hospital.createdAt).toLocaleDateString("es-AR")}
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
