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
  // Fetch periods
  const periods = await prisma.period.findMany({
    orderBy: { startDate: "desc" },
  });

  // Server Action to create a new Period
  const handleCreatePeriod = async (formData: FormData) => {
    "use server";
    const name = formData.get("name") as string;
    const startStr = formData.get("startDate") as string;
    const endStr = formData.get("endDate") as string;

    if (!name || !startStr || !endStr) return;

    try {
      // By default, if a new period is created as OPEN, we might want to close other periods or just create it.
      await prisma.period.create({
        data: {
          name,
          startDate: new Date(startStr),
          endDate: new Date(endStr),
          status: "OPEN",
        },
      });
      revalidatePath("/dashboard/periods");
    } catch (e) {
      console.error("Error creating period:", e);
    }
  };

  // Server Action to toggle status
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    "use server";
    const nextStatus = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    try {
      await prisma.period.update({
        where: { id },
        data: { status: nextStatus },
      });
      revalidatePath("/dashboard/periods");
    } catch (e) {
      console.error("Error toggling status:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Configuración de Períodos</h1>
          <p className="text-sm text-zinc-400">
            Apertura y cierre de períodos de liquidación médica e históricos de cierre.
          </p>
        </div>

        {/* Create Period Modal */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all">
              <Plus className="h-4.5 w-4.5" />
              Nuevo Período
            </Button>
          </DialogTrigger>
          <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Abrir Nuevo Período</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Define el intervalo de fechas para un nuevo mes de liquidación de honorarios.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreatePeriod} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-300">
                  Nombre del Período
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Junio 2026"
                  required
                  className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-emerald-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-zinc-300">
                    Fecha de Inicio
                  </Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    required
                    className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-emerald-500 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-zinc-300">
                    Fecha de Fin
                  </Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    required
                    className="bg-zinc-950/50 border-zinc-800 text-white placeholder-zinc-500 focus-visible:ring-emerald-500 h-10"
                  />
                </div>
              </div>
              
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-10">
                  Iniciar Período
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* List Card */}
      <Card className="border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm text-zinc-100">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Historial de Períodos</CardTitle>
          <CardDescription className="text-zinc-400 text-xs mt-1">
            Los períodos cerrados no permiten modificar liquidaciones ni distribuciones de honorarios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/40 text-zinc-400">
                <TableRow className="hover:bg-transparent border-zinc-800">
                  <TableHead className="font-semibold text-xs py-3">Nombre</TableHead>
                  <TableHead className="font-semibold text-xs">Fecha Desde</TableHead>
                  <TableHead className="font-semibold text-xs">Fecha Hasta</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={5} className="text-center text-zinc-500 text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <CalendarRange className="h-8 w-8 text-zinc-600 animate-pulse" />
                        <p>No hay períodos registrados.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  periods.map((period) => (
                    <TableRow key={period.id} className="hover:bg-zinc-900/20 border-zinc-800 text-zinc-300">
                      <TableCell className="font-semibold text-white py-3.5">
                        {period.name}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(period.startDate).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(period.endDate).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                          period.status === "OPEN"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}>
                          {period.status === "OPEN" ? (
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
                        <form action={handleToggleStatus.bind(null, period.id, period.status)}>
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className={`text-xs gap-1.5 h-8 px-2.5 hover:bg-zinc-800 border border-zinc-800 ${
                              period.status === "OPEN"
                                ? "text-zinc-400 hover:text-white"
                                : "text-emerald-400 hover:text-emerald-300"
                            }`}
                          >
                            {period.status === "OPEN" ? (
                              <>
                                <ToggleRight className="h-4 w-4 text-emerald-400" />
                                Cerrar Período
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-4 w-4 text-zinc-500" />
                                Abrir Período
                              </>
                            )}
                          </Button>
                        </form>
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
