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
import { Calculator, Receipt, Eye, Settings2, CheckCircle2, Coins, Landmark } from "lucide-react";

export const revalidate = 0;

export default async function LiquidationsPage() {
  // 1. Fetch generated liquidations with nested details and hospital purchases mapping
  const liquidations = await prisma.liquidation.findMany({
    include: {
      period: true,
      rc: {
        include: {
          cliente: true,
        },
      },
      details: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // For each liquidation, find the hospital name dynamically by looking up the Compra corresponding to the first detail's fcVentaId
  const liquidationsWithHospital = await Promise.all(
    liquidations.map(async (liq) => {
      let hospitalName = "No Asignado";
      if (liq.details.length > 0) {
        const firstDetail = liq.details[0];
        const purchase = await prisma.compra.findFirst({
          where: { fcVentaId: firstDetail.fcVentaId },
          include: { hospital: true },
        });
        if (purchase?.hospital?.nombre) {
          hospitalName = purchase.hospital.nombre;
        }
      }
      return { ...liq, hospitalName };
    })
  );

  // 2. Fetch RCs that DO NOT have a liquidation yet (Pending calculation)
  const generatedRcIds = liquidations.map((l) => l.rcId);
  const pendingRcs = await prisma.cbte.findMany({
    where: {
      type: "RC",
      id: { notIn: generatedRcIds },
    },
    include: {
      cliente: true,
      appliedAsRc: {
        include: {
          fc: true,
        },
      },
    },
  });

  // Server Action to calculate a liquidation
  const handleCalculateLiquidation = async (rcId: string | number) => {
    "use server";
    try {
      const rcIdNum = typeof rcId === "number" ? rcId : parseInt(rcId, 10);
      if (isNaN(rcIdNum)) return;

      const rc = await prisma.cbte.findUnique({
        where: { id: rcIdNum },
      });
      if (!rc) return;

      const activePeriod = await prisma.periodoIVA.findFirst({
        where: { fechaCierre: null },
      });
      if (!activePeriod) return;

      // Find applied sales invoices (FC)
      const applications = await prisma.cbteAplica.findMany({
        where: { rcId: rcIdNum },
      });

      const totalFacturado = applications.reduce((sum, app) => sum + Number(app.importe), 0);
      const netoInicial = Number(rc.importe);

      // Create liquidation
      const liquidation = await prisma.liquidation.create({
        data: {
          periodAnio: activePeriod.anio,
          periodMes: activePeriod.mes,
          rcId: rcIdNum,
          totalFacturado,
          netoInicial,
          status: "PENDIENTE",
        },
      });

      // Create details
      for (const app of applications) {
        await prisma.liquidationDetail.create({
          data: {
            liquidationId: liquidation.id,
            fcVentaId: app.fcId,
            amount: app.importe,
          },
        });
      }

      revalidatePath("/dashboard/liquidations");
    } catch (e) {
      console.error("Error generating liquidation:", e);
    }
  };

  // Server Action to save adjustments & status updates
  const handleUpdateLiquidation = async (formData: FormData) => {
    "use server";
    const id = formData.get("id") as string;
    const creditos = parseFloat(formData.get("creditos") as string) || 0;
    const debitos = parseFloat(formData.get("debitos") as string) || 0;
    const ajustes = parseFloat(formData.get("ajustes") as string) || 0;
    const recuperos = parseFloat(formData.get("recuperos") as string) || 0;
    const pendientes = parseFloat(formData.get("pendientes") as string) || 0;
    const status = formData.get("status") as string;

    try {
      await prisma.liquidation.update({
        where: { id },
        data: {
          creditos,
          debitos,
          ajustes,
          recuperos,
          pendientes,
          status,
        },
      });
      revalidatePath("/dashboard/liquidations");
    } catch (e) {
      console.error("Error updating liquidation adjustments:", e);
    }
  };

  // Format currency helper
  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Generación de Liquidaciones</h1>
        <p className="text-sm text-muted-foreground">
          Módulo 3: Construcción automática de liquidaciones basada en la secuencia CBTES &rarr; CBTES_APLICA &rarr; COMPRAS.
        </p>
      </div>

      {/* Pending Calculations Card */}
      {pendingRcs.length > 0 ? (
        <Card className="border-emerald-500/25 bg-emerald-500/5 text-foreground">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Calculator className="h-5 w-5" />
              <CardTitle className="text-base font-bold text-foreground">Recibos de Cobro Pendientes de Liquidar</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground text-xs mt-1">
              Se detectaron recibos de cobro de obras sociales que aún no han sido procesados en este período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRcs.map((rc) => (
                <div key={rc.id} className="flex flex-col gap-4 rounded-xl border border-emerald-500/20 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-3xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        {rc.type}
                      </span>
                      <code className="text-xs font-mono font-bold text-foreground">{rc.puntoVenta}-{rc.numero}</code>
                      <span className="text-xs text-muted-foreground">| Obra Social: <strong className="text-foreground">{rc.cliente.nombre}</strong></span>
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      Fecha: {new Date(rc.fecha).toLocaleDateString("es-AR")} &bull; Importe Cobrado: <strong className="text-foreground">{formatCurrency(rc.importe)}</strong>
                    </p>
                    <div className="text-[10px] text-muted-foreground">
                      Cancela Facturas: {rc.appliedAsRc.map((app) => `${app.fc.puntoVenta}-${app.fc.numero} (${formatCurrency(app.importe)})`).join(", ")}
                    </div>
                  </div>
                  
                  <form action={handleCalculateLiquidation.bind(null, rc.id)}>
                    <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1 h-9 transition-all cursor-pointer">
                      <Calculator className="h-4 w-4" />
                      Calcular Liquidación
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 border border-border p-4 text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <span className="text-xs">Todos los recibos de cobro importados han sido liquidados.</span>
        </div>
      )}

      {/* Generated Liquidations Table */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">Liquidaciones Generadas</CardTitle>
          <CardDescription className="text-muted-foreground text-xs mt-1">
            Consulte y agregue débitos, créditos y ajustes sobre las liquidaciones de este período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">Código Liquidación</TableHead>
                  <TableHead className="font-semibold text-xs">Hospital / Efector</TableHead>
                  <TableHead className="font-semibold text-xs">Período</TableHead>
                  <TableHead className="font-semibold text-xs">Recibo (RC)</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Final</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidationsWithHospital.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-muted-foreground animate-pulse" />
                        <p>No se han generado liquidaciones en este período.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  liquidationsWithHospital.map((liq) => {
                    const netoFinal =
                      Number(liq.netoInicial) +
                      Number(liq.creditos) -
                      Number(liq.debitos) +
                      Number(liq.ajustes) +
                      Number(liq.recuperos) -
                      Number(liq.pendientes);

                    return (
                      <TableRow key={liq.id} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell className="font-mono text-xs text-foreground py-3.5">
                          LIQ-{liq.id.substring(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {liq.hospitalName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {getMonthName(liq.period.mes)} {liq.period.anio}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {liq.rc.puntoVenta}-{liq.rc.numero}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatCurrency(liq.netoInicial)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(netoFinal)}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold border ${
                            liq.status === "PENDIENTE"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                              : liq.status === "EN_PROCESO"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          }`}>
                            {liq.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-xs gap-1.5 h-8 border border-border hover:bg-muted cursor-pointer">
                                <Eye className="h-3.5 w-3.5" />
                                Detalle & Ajustes
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-border bg-card text-card-foreground max-w-xl">
                              <DialogHeader>
                                <DialogTitle className="text-foreground font-bold">Liquidación LIQ-{liq.id.substring(0, 8).toUpperCase()}</DialogTitle>
                                <DialogDescription className="text-muted-foreground text-xs">
                                  {liq.hospitalName} &bull; Recibo {liq.rc.puntoVenta}-{liq.rc.numero}
                                </DialogDescription>
                              </DialogHeader>
                              
                              <form action={handleUpdateLiquidation} className="space-y-6 py-2">
                                <input type="hidden" name="id" value={liq.id} />
                                
                                {/* Totals calculation overview */}
                                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-4 border border-border text-center">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Neto Inicial</span>
                                    <p className="text-sm font-semibold text-foreground">{formatCurrency(liq.netoInicial)}</p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Ajustes Netos</span>
                                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                      {formatCurrency(Number(liq.creditos) - Number(liq.debitos) + Number(liq.ajustes) + Number(liq.recuperos) - Number(liq.pendientes))}
                                    </p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-emerald-500 uppercase font-bold">Neto Final</span>
                                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(netoFinal)}</p>
                                  </div>
                                </div>

                                {/* Form controls for adjustments */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1.5">
                                    <Label htmlFor="creditos" className="text-xs text-foreground">Créditos (+)</Label>
                                    <Input
                                      id="creditos"
                                      name="creditos"
                                      type="number"
                                      step="0.01"
                                      defaultValue={Number(liq.creditos)}
                                      className="bg-muted/40 border-border text-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="debitos" className="text-xs text-foreground">Débitos (-)</Label>
                                    <Input
                                      id="debitos"
                                      name="debitos"
                                      type="number"
                                      step="0.01"
                                      defaultValue={Number(liq.debitos)}
                                      className="bg-muted/40 border-border text-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-1.5">
                                    <Label htmlFor="ajustes" className="text-xs text-foreground">Ajustes (+)</Label>
                                    <Input
                                      id="ajustes"
                                      name="ajustes"
                                      type="number"
                                      step="0.01"
                                      defaultValue={Number(liq.ajustes)}
                                      className="bg-muted/40 border-border text-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="recuperos" className="text-xs text-foreground">Recuperos (+)</Label>
                                    <Input
                                      id="recuperos"
                                      name="recuperos"
                                      type="number"
                                      step="0.01"
                                      defaultValue={Number(liq.recuperos)}
                                      className="bg-muted/40 border-border text-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="pendientes" className="text-xs text-foreground">Pendientes (-)</Label>
                                    <Input
                                      id="pendientes"
                                      name="pendientes"
                                      type="number"
                                      step="0.01"
                                      defaultValue={Number(liq.pendientes)}
                                      className="bg-muted/40 border-border text-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <Label htmlFor="status" className="text-xs text-foreground">Estado de Liquidación</Label>
                                  <select
                                    id="status"
                                    name="status"
                                    defaultValue={liq.status}
                                    className="flex h-9 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                                  >
                                    <option value="PENDIENTE" className="bg-card text-foreground">PENDIENTE</option>
                                    <option value="EN_PROCESO" className="bg-card text-foreground">EN_PROCESO</option>
                                    <option value="CONSOLIDADA" className="bg-card text-foreground">CONSOLIDADA</option>
                                    <option value="CERRADA" className="bg-card text-foreground">CERRADA</option>
                                  </select>
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
