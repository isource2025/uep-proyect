import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
import { Building2, Receipt, Users, Plus, ShieldCheck, Mail, Paperclip, FileText, CheckCircle } from "lucide-react";

export const revalidate = 0;

export default async function HospitalPortalPage() {
  // 1. Get authenticated user session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as any;
  if (!session || !user?.hospitalId) {
    redirect("/dashboard");
  }

  const hospitalId = user.hospitalId;

  // 2. Fetch the hospital/proveedor info
  const hospital = await prisma.proveedor.findUnique({
    where: { id: hospitalId },
  });

  if (!hospital) {
    redirect("/dashboard");
  }

  // 3. Find liquidations that belong to this hospital
  // (We check detail fcVentaId -> Compra -> hospitalId = hospitalId)
  const allLiquidations = await prisma.liquidation.findMany({
    include: {
      period: true,
      rc: {
        include: {
          cliente: true,
        },
      },
      details: true,
      distributions: {
        include: {
          agent: true,
        },
      },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter liquidations: keep only those where at least one detail belongs to this hospital
  const hospitalLiquidations = [];
  for (const liq of allLiquidations) {
    let belongsToHospital = false;
    for (const detail of liq.details) {
      if (detail.hospitalId === hospitalId) {
        belongsToHospital = true;
        break;
      }
      if (detail.compraId) {
        const purchase = await prisma.compra.findFirst({
          where: { id: detail.compraId },
        });
        if (purchase && purchase.hospitalId === hospitalId) {
          belongsToHospital = true;
          break;
        }
      }
    }
    if (belongsToHospital) {
      hospitalLiquidations.push(liq);
    }
  }

  // 4. Fetch agents belonging to this hospital for fee distribution
  const agents = await prisma.agent.findMany({
    where: { hospitalId },
    orderBy: { nombre: "asc" },
  });

  // Server Action to save a distribution
  const handleSaveDistribution = async (formData: FormData) => {
    "use server";
    const liquidationIdStr = formData.get("liquidationId") as string;
    const agentIdStr = formData.get("agentId") as string;
    const honorarios = parseFloat(formData.get("honorarios") as string) || 0;
    const sobreasignaciones = parseFloat(formData.get("sobreasignaciones") as string) || 0;
    const gastos = parseFloat(formData.get("gastos") as string) || 0;

    if (!liquidationIdStr || !agentIdStr) return;
    const liquidationId = parseInt(liquidationIdStr, 10);
    const agentId = parseInt(agentIdStr, 10);

    try {
      // Find liquidation to check totals
      const liq = await prisma.liquidation.findUnique({
        where: { id: liquidationId },
        include: { distributions: true, details: true },
      });
      if (!liq) return;

      const netoFinal = liq.details.reduce((sum, d) => sum + Number(d.netoAPagar), 0);

      // Calculate current total distributed excluding this agent (if they exist)
      const otherDistributionsTotal = liq.distributions
        .filter((d) => d.agentId !== agentId)
        .reduce((sum, d) => sum + Number(d.honorarios) + Number(d.sobreasignaciones) + Number(d.gastos), 0);

      const requestedTotal = honorarios + sobreasignaciones + gastos;

      if (otherDistributionsTotal + requestedTotal > netoFinal) {
        console.error("Exceeded total neto final limit!");
        return;
      }

      // Upsert distribution
      const existingDist = liq.distributions.find((d) => d.agentId === agentId);
      if (existingDist) {
        await prisma.distribution.update({
          where: { id: existingDist.id },
          data: {
            honorarios,
            sobreasignaciones,
            gastos,
          },
        });
      } else {
        await prisma.distribution.create({
          data: {
            liquidationId,
            agentId,
            honorarios,
            sobreasignaciones,
            gastos,
          },
        });
      }

      revalidatePath("/dashboard/hospital-portal");
    } catch (e) {
      console.error("Error saving distribution:", e);
    }
  };

  // Server Action to add a mock attachment (URL link)
  const handleAddAttachment = async (formData: FormData) => {
    "use server";
    const liquidationIdStr = formData.get("liquidationId") as string;
    const fileName = formData.get("fileName") as string;
    const fileUrl = formData.get("fileUrl") as string;

    if (!liquidationIdStr || !fileName || !fileUrl) return;
    const liquidationId = parseInt(liquidationIdStr, 10);

    try {
      await prisma.attachment.create({
        data: {
          liquidationId,
          fileName,
          fileUrl,
        },
      });
      revalidatePath("/dashboard/hospital-portal");
    } catch (e) {
      console.error("Error creating attachment:", e);
    }
  };

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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
          <Building2 className="h-7 w-7" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{hospital.nombre}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Portal del Hospital / CAPS. Visualice liquidaciones de su establecimiento, distribuya honorarios y adjunte comprobantes.
        </p>
      </div>

      {/* Liquidations list */}
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">Liquidaciones de Obras Sociales</CardTitle>
          <CardDescription className="text-muted-foreground text-xs">
            Seleccione una liquidación consolidada para cargar la distribución y los adjuntos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="font-semibold text-xs py-3">Liquidación</TableHead>
                  <TableHead className="font-semibold text-xs">Período</TableHead>
                  <TableHead className="font-semibold text-xs">Recibo (RC)</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Inicial</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Neto Final</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Distribuido</TableHead>
                  <TableHead className="font-semibold text-xs">Estado</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitalLiquidations.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-12">
                      No se encontraron liquidaciones para su establecimiento.
                    </TableCell>
                  </TableRow>
                ) : (
                  hospitalLiquidations.map((liq) => {
                    const totalFacturado = liq.details.reduce((sum, d) => sum + Number(d.totalFacturado), 0);
                    const netoFinal = liq.details.reduce((sum, d) => sum + Number(d.netoAPagar), 0);

                    const totalDistributed = liq.distributions.reduce(
                      (sum, d) => sum + Number(d.honorarios) + Number(d.sobreasignaciones) + Number(d.gastos),
                      0
                    );

                    const remaining = netoFinal - totalDistributed;

                    return (
                      <TableRow key={liq.id} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell className="font-mono text-xs text-foreground py-3.5">
                          LIQ-{String(liq.id).padStart(4, "0")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {liq.mesCarga || `${getMonthName(liq.period.mes)} ${liq.period.anio}`}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {liq.rc.puntoVenta}-{liq.rc.numero}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatCurrency(totalFacturado)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(netoFinal)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-foreground">
                          {formatCurrency(totalDistributed)}
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
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 h-8 text-xs cursor-pointer">
                                <Plus className="h-3.5 w-3.5" />
                                Distribuir Fondos
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-border bg-card text-card-foreground max-w-2xl overflow-y-auto max-h-[85vh]">
                              <DialogHeader>
                                <DialogTitle className="text-foreground font-bold">Distribución y Adjuntos</DialogTitle>
                                <DialogDescription className="text-muted-foreground text-xs">
                                  Liquidación LIQ-{String(liq.id).padStart(4, "0")} &bull; Neto Final: <strong className="text-foreground">{formatCurrency(netoFinal)}</strong>
                                </DialogDescription>
                              </DialogHeader>

                              {/* Summary calculations */}
                              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 border border-border text-center">
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Asignado</span>
                                  <p className="text-sm font-semibold text-foreground">{formatCurrency(totalDistributed)}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Saldo Remanente</span>
                                  <p className={`text-sm font-bold ${remaining < 0 ? "text-red-500" : "text-emerald-500"}`}>
                                    {formatCurrency(remaining)}
                                  </p>
                                </div>
                              </div>

                              {/* Save distribution Form */}
                              {liq.status !== "CERRADA" && (
                                <form action={handleSaveDistribution} className="space-y-4 border-b border-border pb-6">
                                  <input type="hidden" name="liquidationId" value={liq.id} />
                                  <h4 className="text-xs font-bold text-foreground">Asignar Monto a Profesional:</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <Label htmlFor="agentId" className="text-xs">Profesional de Salud</Label>
                                      <select
                                        id="agentId"
                                        name="agentId"
                                        required
                                        className="flex h-9 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                                      >
                                        <option value="" className="bg-card text-foreground">Seleccionar profesional...</option>
                                        {agents.map((a) => (
                                          <option key={a.id} value={a.id} className="bg-card text-foreground">
                                            {a.nombre} (CUIL: {a.cuil})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor="honorarios" className="text-xs">Honorarios ($)</Label>
                                      <Input
                                        id="honorarios"
                                        name="honorarios"
                                        type="number"
                                        step="0.01"
                                        required
                                        placeholder="0.00"
                                        className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <Label htmlFor="sobreasignaciones" className="text-xs">Sobreasignaciones ($)</Label>
                                      <Input
                                        id="sobreasignaciones"
                                        name="sobreasignaciones"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor="gastos" className="text-xs">Gastos de Funcionamiento ($)</Label>
                                      <Input
                                        id="gastos"
                                        name="gastos"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                      />
                                    </div>
                                  </div>
                                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-9 text-xs cursor-pointer">
                                    Confirmar Asignación
                                  </Button>
                                </form>
                              )}

                              {/* Upload mock Attachment */}
                              {liq.status !== "CERRADA" && (
                                <form action={handleAddAttachment} className="space-y-4 border-b border-border pb-6">
                                  <input type="hidden" name="liquidationId" value={liq.id} />
                                  <h4 className="text-xs font-bold text-foreground">Adjuntar Documento PDF (Comprobante / Acta):</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <Label htmlFor="fileName" className="text-xs">Nombre del Archivo</Label>
                                      <Input
                                        id="fileName"
                                        name="fileName"
                                        required
                                        placeholder="Comprobante_Pago.pdf"
                                        className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label htmlFor="fileUrl" className="text-xs">Enlace / URL del PDF</Label>
                                      <Input
                                        id="fileUrl"
                                        name="fileUrl"
                                        required
                                        placeholder="https://drive.google.com/..."
                                        className="bg-muted/40 border-border text-foreground placeholder-muted-foreground focus-visible:ring-emerald-500 h-9 text-xs"
                                      />
                                    </div>
                                  </div>
                                  <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-zinc-950 font-semibold h-9 text-xs cursor-pointer">
                                    Subir Adjunto
                                  </Button>
                                </form>
                              )}

                              {/* Current distribution list */}
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold text-foreground">Distribución Actual:</h4>
                                <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
                                  <Table>
                                    <TableHeader className="bg-muted/50">
                                      <TableRow className="hover:bg-transparent border-border">
                                        <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Profesional</TableHead>
                                        <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Honorarios</TableHead>
                                        <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Sobreasig.</TableHead>
                                        <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Gastos</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {liq.distributions.length === 0 ? (
                                        <TableRow className="border-border">
                                          <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">
                                            No se han cargado distribuciones de fondos.
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        liq.distributions.map((d) => (
                                          <TableRow key={d.id} className="hover:bg-transparent border-border text-foreground">
                                            <TableCell className="py-2 text-xs font-semibold">{d.agent.nombre}</TableCell>
                                            <TableCell className="py-2 text-xs text-right">{formatCurrency(d.honorarios)}</TableCell>
                                            <TableCell className="py-2 text-xs text-right">{formatCurrency(d.sobreasignaciones)}</TableCell>
                                            <TableCell className="py-2 text-xs text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(d.gastos)}</TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>

                              {/* Attachments list */}
                              <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold text-foreground">Documentos Adjuntos:</h4>
                                <div className="space-y-2">
                                  {liq.attachments.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2 border border-dashed border-border rounded-lg">
                                      No hay documentos adjuntos.
                                    </p>
                                  ) : (
                                    liq.attachments.map((at) => (
                                      <div key={at.id} className="flex items-center justify-between p-2 border border-border rounded-lg bg-muted/20 text-xs">
                                        <div className="flex items-center gap-2">
                                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="font-semibold">{at.fileName}</span>
                                        </div>
                                        <a href={at.fileUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:underline">
                                          Descargar
                                        </a>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
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
