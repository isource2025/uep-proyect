import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calculator, Receipt, Calendar, Building, DollarSign, Eye, Settings2, FileText, CheckCircle2 } from "lucide-react";

export const revalidate = 0;

export default async function LiquidationsPage() {
  // 1. Fetch generated liquidations
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
  const handleCalculateLiquidation = async (rcId: string) => {
    "use server";
    try {
      const rc = await prisma.cbte.findUnique({
        where: { id: rcId },
      });
      if (!rc) return;

      const activePeriod = await prisma.period.findFirst({
        where: { status: "OPEN" },
      });
      if (!activePeriod) return;

      // Find applied sales invoices (FC)
      const applications = await prisma.cbteAplica.findMany({
        where: { rcId },
      });

      const totalFacturado = applications.reduce((sum, app) => sum + Number(app.importe), 0);
      const netoInicial = Number(rc.importe);

      // Create liquidation
      const liquidation = await prisma.liquidation.create({
        data: {
          periodId: activePeriod.id,
          rcId,
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

  // Format currency helper
  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Generación de Liquidaciones</h1>
        <p className="text-sm text-zinc-400">
          Módulo 3: Construcción automática de liquidaciones basada en la secuencia CBTES &rarr; CBTES_APLICA &rarr; COMPRAS.
        </p>
      </div>

      {/* Pending Calculations Card */}
      {pendingRcs.length > 0 ? (
        <Card className="border-emerald-500/25 bg-emerald-500/5 backdrop-blur-sm text-zinc-100">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <Calculator className="h-5 w-5" />
              <CardTitle className="text-base font-bold text-white">Recibos de Cobro Pendientes de Liquidar</CardTitle>
            </div>
            <CardDescription className="text-zinc-400 text-xs mt-1">
              Se detectaron recibos de cobro de obras sociales que aún no han sido procesados en este período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRcs.map((rc) => (
                <div key={rc.id} className="flex flex-col gap-4 rounded-xl border border-emerald-500/20 bg-zinc-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-3xs font-semibold text-emerald-400 border border-emerald-500/25">
                        {rc.type}
                      </span>
                      <code className="text-xs font-mono font-bold text-white">{rc.puntoVenta}-{rc.numero}</code>
                      <span className="text-xs text-zinc-500">| Obra Social: <strong className="text-zinc-300">{rc.cliente.nombre}</strong></span>
                    </div>
                    <p className="text-2xs text-zinc-500">
                      Fecha: {new Date(rc.fecha).toLocaleDateString("es-AR")} &bull; Importe Cobrado: <strong className="text-white">{formatCurrency(rc.importe)}</strong>
                    </p>
                    <div className="text-[10px] text-zinc-500">
                      Cancela Facturas: {rc.appliedAsRc.map((app) => `${app.fc.puntoVenta}-${app.fc.numero} (${formatCurrency(app.importe)})`).join(", ")}
                    </div>
                  </div>
                  
                  <form action={handleCalculateLiquidation.bind(null, rc.id)}>
                    <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1 h-9 transition-all">
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
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-900/30 border border-zinc-800 p-4 text-zinc-400">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <span className="text-xs">Todos los recibos de cobro importados han sido liquidados.</span>
        </div>
      )}

      {/* Generated Liquidations Table */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm text-zinc-100">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Liquidaciones Generadas</CardTitle>
          <CardDescription className="text-zinc-400 text-xs mt-1">
            Consulte y agregue débitos, créditos y ajustes sobre las liquidaciones de este período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-950/40 text-zinc-400">
                <TableRow className="hover:bg-transparent border-zinc-800">
                  <TableHead className="font-semibold text-xs py-3">Código Liquidación</TableHead>
                  <TableHead className="font-semibold text-xs">Período</TableHead>
                  <TableHead className="font-semibold text-xs">Recibo (RC)</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Facturado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidations.length === 0 ? (
                  <TableRow className="border-zinc-800">
                    <TableCell colSpan={7} className="text-center text-zinc-500 text-sm py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 text-zinc-600 animate-pulse" />
                        <p>No se han generado liquidaciones en este período.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  liquidations.map((liq) => (
                    <TableRow key={liq.id} className="hover:bg-zinc-900/20 border-zinc-800 text-zinc-300">
                      <TableCell className="font-mono text-xs text-white py-3.5">
                        LIQ-{liq.id.substring(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {liq.period.name}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {liq.rc.puntoVenta}-{liq.rc.numero}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(liq.totalFacturado)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-white">
                        {formatCurrency(liq.netoInicial)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold border ${
                          liq.status === "PENDIENTE"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}>
                          {liq.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-xs gap-1.5 h-8 border border-zinc-800 hover:bg-zinc-800 hover:text-white">
                              <Eye className="h-3.5 w-3.5" />
                              Ver Detalle
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 max-w-xl">
                            <DialogHeader>
                              <DialogTitle className="text-white">Detalle de Liquidación LIQ-{liq.id.substring(0, 8).toUpperCase()}</DialogTitle>
                            </DialogHeader>
                            
                            <div className="space-y-4 py-2">
                              {/* Summary info */}
                              <div className="grid grid-cols-2 gap-4 rounded-lg bg-zinc-950/40 p-4 border border-zinc-850">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Total Neto Inicial:</span>
                                  <p className="text-xl font-bold text-white">{formatCurrency(liq.netoInicial)}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Facturado Imputado:</span>
                                  <p className="text-xl font-bold text-zinc-300">{formatCurrency(liq.totalFacturado)}</p>
                                </div>
                              </div>

                              {/* Details list */}
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold text-zinc-300">Facturas de Venta Imputadas:</h4>
                                <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950/20">
                                  <Table>
                                    <TableHeader className="bg-zinc-950/50">
                                      <TableRow className="hover:bg-transparent border-zinc-850">
                                        <TableHead className="py-2 text-[10px] font-semibold text-zinc-400">ID Factura</TableHead>
                                        <TableHead className="py-2 text-[10px] font-semibold text-zinc-400 text-right">Importe Imputado</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {liq.details.map((detail) => (
                                        <TableRow key={detail.id} className="hover:bg-transparent border-zinc-850">
                                          <TableCell className="py-2 text-xs font-mono">FC-{detail.fcVentaId.substring(0, 8)}</TableCell>
                                          <TableCell className="py-2 text-xs text-right text-white font-semibold">{formatCurrency(detail.amount)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </div>
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
    </div>
  );
}
