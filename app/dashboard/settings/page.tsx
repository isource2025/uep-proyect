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
import { Settings, Pencil, Sliders, Landmark, Calculator } from "lucide-react";

export const revalidate = 0;

export default async function SettingsPage() {
  // Fetch parameters from CParametros
  const params = await prisma.cParametro.findMany({
    orderBy: { id: "asc" },
  });

  // Server Action to update a parameter
  const handleUpdateParam = async (formData: FormData) => {
    "use server";
    const id = formData.get("id") as string;
    const description = formData.get("description") as string;
    const notes = formData.get("notes") as string;

    if (!id || !description) return;

    try {
      await prisma.cParametro.update({
        where: { id },
        data: {
          descripcion: description.substring(0, 30),
          observaciones: notes || null,
        },
      });
      revalidatePath("/dashboard/settings");
    } catch (e) {
      console.error("Error updating system parameter:", e);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Configuración del Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Módulo 1: Gestión de parámetros contables y del ERP desde la tabla nativa `CParametros`.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Side: Parameters List */}
        <Card className="md:col-span-2 border-border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-emerald-500" />
              Parámetros ERP Activos
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Configuraciones generales de centros de costo, ejercicios y cuentas asociadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50 text-muted-foreground">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-semibold text-xs py-3">Código</TableHead>
                    <TableHead className="font-semibold text-xs">Descripción</TableHead>
                    <TableHead className="font-semibold text-xs">Ejercicio</TableHead>
                    <TableHead className="font-semibold text-xs">Cuenta Contable</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {params.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-12">
                        No hay parámetros del sistema cargados en CParametros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    params.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold py-3.5">
                          {p.id.trim()}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {p.descripcion.trim()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.ejercicio}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {p.idCuenta.toString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted text-foreground cursor-pointer">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-border bg-card text-card-foreground max-w-sm">
                              <DialogHeader>
                                <DialogTitle className="text-foreground font-bold">Editar Parámetro</DialogTitle>
                                <DialogDescription className="text-muted-foreground text-xs">
                                  Modifica la descripción y observaciones del parámetro contable.
                                </DialogDescription>
                              </DialogHeader>
                              <form action={handleUpdateParam} className="space-y-4 py-2">
                                <input type="hidden" name="id" value={p.id} />
                                <div className="space-y-2">
                                  <Label htmlFor="id-display" className="text-foreground">Código Parametro</Label>
                                  <Input
                                    id="id-display"
                                    value={p.id.trim()}
                                    disabled
                                    className="bg-muted border-border text-muted-foreground focus-visible:ring-0"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="description" className="text-foreground">Descripción</Label>
                                  <Input
                                    id="description"
                                    name="description"
                                    defaultValue={p.descripcion.trim()}
                                    maxLength={30}
                                    required
                                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="notes" className="text-foreground">Observaciones / Detalles</Label>
                                  <textarea
                                    id="notes"
                                    name="notes"
                                    defaultValue={p.observaciones || ""}
                                    placeholder="Detalles sobre el uso de este parámetro contable..."
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 placeholder-muted-foreground"
                                  />
                                </div>
                                <DialogFooter className="pt-2">
                                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10 cursor-pointer">
                                    Guardar Cambios
                                  </Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Information Panels */}
        <div className="space-y-6">
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-500" />
                Auditoría Contable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>
                Los parámetros definidos en <code className="rounded bg-muted px-1.5 py-0.5 border border-border">CParametros</code> controlan la imputación directa de las facturas de venta y compra procesadas en el portal.
              </p>
              <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span>Base de datos:</span>
                  <span className="text-emerald-500 font-bold">iSource @ SQL Server</span>
                </div>
                <div className="flex justify-between">
                  <span>Esquema:</span>
                  <span>dbo.CParametros</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card text-card-foreground">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-500" />
                Ejercicios ERP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>
                Las liquidaciones se asocian de forma automática con el ejercicio fiscal activo determinado por el ERP para garantizar consistencia.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
