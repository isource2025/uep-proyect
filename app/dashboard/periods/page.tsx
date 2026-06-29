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
import { CalendarRange, Plus, CircleCheck, CircleAlert, ToggleLeft, ToggleRight } from "lucide-react";

export const revalidate = 0;

export default async function PeriodsPage() {
  // Fetch periods from Periodos_IVA where IVA = 'V'
  const periods = await prisma.periodoIVA.findMany({
    where: { iva: "V" },
    orderBy: [
      { anio: "desc" },
      { mes: "desc" },
    ],
  });

  // Server Action to create a new Period (PeriodoIVA)
  const handleCreatePeriod = async (formData: FormData) => {
    "use server";
    const anioStr = formData.get("anio") as string;
    const mesStr = formData.get("mes") as string;

    if (!anioStr || !mesStr) return;

    try {
      await prisma.periodoIVA.create({
        data: {
          anio: parseInt(anioStr, 10),
          mes: parseInt(mesStr, 10),
          iva: "V",
          fechaAlta: new Date(),
        },
      });
      revalidatePath("/dashboard/periods");
    } catch (e) {
      console.error("Error creating period:", e);
    }
  };

  // Server Action to toggle status (using fechaCierre nullability)
  const handleToggleStatus = async (anio: number, mes: number, iva: string, currentClosed: boolean) => {
    "use server";
    const nextCierre = currentClosed ? null : new Date();
    try {
      await prisma.periodoIVA.update({
        where: {
          anio_mes_iva: { anio, mes, iva },
        },
        data: { fechaCierre: nextCierre },
      });
      revalidatePath("/dashboard/periods");
    } catch (e) {
      console.error("Error toggling status:", e);
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return months[monthNum - 1] || `Mes ${monthNum}`;
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Configuración de Períodos</h1>
          <p className="text-sm text-muted-foreground">
            Apertura y cierre de períodos de liquidación médica e históricos del sistema ERP.
          </p>
        </div>

        {/* Create Period Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer">
              <Plus className="h-4.5 w-4.5" />
              Nuevo Período
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card text-card-foreground max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground font-bold">Abrir Nuevo Período</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Define el mes y año para la carga y liquidación de facturas.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreatePeriod} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mes" className="text-foreground">
                    Mes
                  </Label>
                  <Input
                    id="mes"
                    name="mes"
                    type="number"
                    min={1}
                    max={12}
                    placeholder="6"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anio" className="text-foreground">
                    Año
                  </Label>
                  <Input
                    id="anio"
                    name="anio"
                    type="number"
                    min={2000}
                    max={2100}
                    placeholder="2026"
                    required
                    className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-10"
                  />
                </div>
              </div>
              
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10 cursor-pointer">
                  Iniciar Período
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* List Card */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">Historial de Períodos</CardTitle>
          <CardDescription className="text-muted-foreground text-xs mt-1">
            Los períodos cerrados no permiten modificar liquidaciones ni distribuciones de honorarios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">Nombre</TableHead>
                  <TableHead className="font-semibold text-xs">Fecha de Alta</TableHead>
                  <TableHead className="font-semibold text-xs">Fecha de Cierre</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarRange className="h-8 w-8 text-muted-foreground animate-pulse" />
                        <p>No hay períodos registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  periods.map((period) => {
                    const isClosed = period.fechaCierre !== null;
                    return (
                      <TableRow key={`${period.anio}-${period.mes}-${period.iva}`} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell className="font-semibold text-foreground py-3.5">
                          {getMonthName(period.mes)} {period.anio}
                        </TableCell>
                        <TableCell className="text-xs">
                          {period.fechaAlta ? new Date(period.fechaAlta).toLocaleDateString("es-AR") : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {period.fechaCierre ? new Date(period.fechaCierre).toLocaleDateString("es-AR") : "-"}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                            !isClosed
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                              : "bg-muted text-muted-foreground border-border"
                          }`}>
                            {!isClosed ? (
                              <>
                                <CircleCheck className="h-3 w-3" />
                                Abierto
                              </>
                            ) : (
                              <>
                                <CircleAlert className="h-3 w-3" />
                                Cerrado
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={handleToggleStatus.bind(null, period.anio, period.mes, period.iva, isClosed)}>
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className={`text-xs gap-1.5 h-8 px-2.5 hover:bg-muted border border-border cursor-pointer ${
                                !isClosed
                                  ? "text-muted-foreground hover:text-foreground"
                                  : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
                              }`}
                            >
                              {!isClosed ? (
                                <>
                                  <ToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  Cerrar Período
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                  Abrir Período
                                </>
                              )}
                            </Button>
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
