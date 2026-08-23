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
import { Building2, Receipt, Users, Plus, ShieldCheck, Mail, Paperclip, FileText, CheckCircle, FileDown } from "lucide-react";
import { PrintButton } from "./print-button";
import DistributionGrid from "./distribution-grid";

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
}

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
  const allLiquidations = await prisma.liquidacion.findMany({
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
  const agents = await prisma.agente.findMany({
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
      const liq = await prisma.liquidacion.findUnique({
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
        await prisma.distribucion.update({
          where: { id: existingDist.id },
          data: {
            honorarios,
            sobreasignaciones,
            gastos,
          },
        });
      } else {
        await prisma.distribucion.create({
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
      await prisma.adjunto.create({
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
                    const hospitalDetails = liq.details.filter(
                      (d) =>
                        d.hospitalId === hospitalId ||
                        (d.prestadorNombre && hospital.nombre && d.prestadorNombre.toLowerCase().trim().includes(hospital.nombre.toLowerCase().trim())) ||
                        (hospital.nombre && d.prestadorNombre && hospital.nombre.toLowerCase().trim().includes(d.prestadorNombre.toLowerCase().trim()))
                    );
                    const currentDetails = hospitalDetails.length > 0 ? hospitalDetails : liq.details;

                    const totalFacturado = currentDetails.reduce((sum, d) => sum + Number(d.totalFacturado), 0);
                    const netoFinal = currentDetails.reduce((sum, d) => sum + Number(d.netoAPagar), 0);

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
                          <div className="flex justify-end gap-2">
                            {/* Debits PDF Download button if present */}
                            {liq.debitsFileUrl && (
                              <a href={liq.debitsFileUrl} target="_blank" rel="noopener noreferrer" download>
                                <Button size="sm" variant="outline" className="border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold gap-1.5 h-8 text-xs cursor-pointer">
                                  <FileDown className="h-3.5 w-3.5" />
                                  Débitos PDF
                                </Button>
                              </a>
                            )}

                            {/* 1. Distribute Funds Dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 h-8 text-xs cursor-pointer">
                                  <Plus className="h-3.5 w-3.5" />
                                  Distribuir Fondos
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="border-border bg-card text-card-foreground max-w-5xl w-[92vw] overflow-y-auto max-h-[85vh]">
                                <DialogHeader>
                                  <DialogTitle className="text-foreground font-bold">Distribución y Adjuntos</DialogTitle>
                                  <DialogDescription className="text-muted-foreground text-xs">
                                    Liquidación LIQ-{String(liq.id).padStart(4, "0")} &bull; Neto Final: <strong className="text-foreground">{formatCurrency(netoFinal)}</strong>
                                  </DialogDescription>
                                </DialogHeader>

                                {/* Distribution Grid Spreadsheet Component */}
                                <DistributionGrid
                                  liquidationId={liq.id}
                                  hospitalId={hospitalId}
                                  netoFinalLimit={netoFinal}
                                  agents={agents}
                                  initialDistributions={liq.distributions}
                                />

                                {/* Upload mock Attachment */}
                                {liq.status !== "CERRADA" && (
                                  <form action={handleAddAttachment} className="space-y-4 border-t border-b border-border py-4 my-2">
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

                            {/* 2. Official Printable Report Dialog */}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-muted font-semibold gap-1.5 h-8 text-xs cursor-pointer">
                                  <FileText className="h-3.5 w-3.5" />
                                  Ver Reporte
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="border-border bg-card text-card-foreground max-w-4xl overflow-y-auto max-h-[90vh]">
                                <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
                                  <div>
                                    <DialogTitle className="text-foreground text-lg font-bold">Reporte Oficial de Liquidación UEP</DialogTitle>
                                    <DialogDescription className="text-muted-foreground text-xs">
                                      Establecimiento: {hospital.nombre} &bull; Liquidación UEP Nro: LIQ-{String(liq.id).padStart(4, "0")}
                                    </DialogDescription>
                                  </div>
                                  <PrintButton />
                                </DialogHeader>

                                {/* Printable Area */}
                                <div className="space-y-6 my-2 text-foreground" id="printable-report-content">
                                  {/* Debits PDF Download Notice if present */}
                                  {liq.debitsFileUrl && (
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                        <div>
                                          <span className="font-semibold text-foreground">Documento de Débitos de Obra Social Adjunto: </span>
                                          <span className="text-muted-foreground">{liq.debitsFileName || "Comprobante_Debitos.pdf"}</span>
                                        </div>
                                      </div>
                                      <a
                                        href={liq.debitsFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md font-semibold text-xs transition-colors shrink-0"
                                      >
                                        <FileDown className="h-3.5 w-3.5" />
                                        Descargar PDF Débitos
                                      </a>
                                    </div>
                                  )}

                                  {/* General Info Header */}
                                  <div className="grid grid-cols-3 gap-4 border border-border p-4 rounded-lg bg-muted/25 text-xs">
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground text-[10px] uppercase font-bold">Obra Social (Cliente)</p>
                                      <p className="font-semibold text-foreground">{liq.rc.cliente?.nombre || "N/A"}</p>
                                      <p className="text-muted-foreground text-[10px]">CUIT: {liq.rc.cliente?.cuit ? toNum(liq.rc.cliente.cuit).toString() : "N/A"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground text-[10px] uppercase font-bold">Comprobante de Origen</p>
                                      <p className="font-semibold text-foreground font-mono">RC {liq.rc.puntoVenta || "0000"}-{liq.rc.numero || 0}</p>
                                      <p className="text-muted-foreground text-[10px]">Fecha: {new Date(liq.rc.fecha).toLocaleDateString("es-AR")}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-muted-foreground text-[10px] uppercase font-bold">Período de Carga</p>
                                      <p className="font-semibold text-foreground">{liq.mesCarga || "N/A"}</p>
                                      <p className="text-muted-foreground text-[10px]">Estado: {liq.status}</p>
                                    </div>
                                  </div>

                                  {/* Financial breakdown */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-foreground">1. Desglose Financiero (Establecimiento CAPS/Hospital)</h4>
                                    <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
                                      <Table>
                                        <TableHeader className="bg-muted/30">
                                          <TableRow className="hover:bg-transparent border-border">
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Prestador (Hospital)</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Facturado</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Créditos</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Débitos OS</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Ajustes OS</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Pend. Cobro</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Bruto</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">G.A.</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Recupero</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right font-bold text-foreground">Neto Final</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {currentDetails.map((d: any) => (
                                            <TableRow key={d.id} className="hover:bg-transparent border-border text-foreground text-xs">
                                              <TableCell className="font-semibold py-2 text-foreground">{d.prestadorNombre || hospital.nombre}</TableCell>
                                              <TableCell className="text-right py-2">{formatCurrency(d.totalFacturado)}</TableCell>
                                              <TableCell className="text-right py-2 text-emerald-600 dark:text-emerald-400 font-semibold">+{formatCurrency(d.creditos)}</TableCell>
                                              <TableCell className="text-right py-2 text-red-500">-{formatCurrency(d.debitos)}</TableCell>
                                              <TableCell className="text-right py-2 text-blue-500">{formatCurrency(d.ajustesOs)}</TableCell>
                                              <TableCell className="text-right py-2 text-amber-500">-{formatCurrency(d.pendientesCobro)}</TableCell>
                                              <TableCell className="text-right py-2 font-bold text-foreground">{formatCurrency(d.brutoAPagar)}</TableCell>
                                              <TableCell className="text-right py-2 text-red-500">-{formatCurrency(d.ga)}</TableCell>
                                              <TableCell className="text-right py-2 text-emerald-600 dark:text-emerald-400 font-semibold">+{formatCurrency(d.ajusteRecupero)}</TableCell>
                                              <TableCell className="text-right py-2 font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded">{formatCurrency(d.netoAPagar)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  {/* Agent base list section (SISPER) */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-foreground">2. Base de Agentes de Salud (SISPER) e Importes de Distribución</h4>
                                    <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
                                      <Table>
                                        <TableHeader className="bg-muted/30">
                                          <TableRow className="hover:bg-transparent border-border">
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Apellido y Nombre</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground font-mono">CUIL</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground">Puesto Laboral (Cargo)</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Honorarios</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Sobreasignaciones</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right">Gastos</TableHead>
                                            <TableHead className="py-2 text-[10px] font-semibold text-muted-foreground text-right font-bold text-foreground">Total Asignado</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {agents.length === 0 ? (
                                            <TableRow className="border-border">
                                              <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-6">
                                                No hay agentes registrados en la nómina de SISPER para este hospital.
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            agents.map((agent: any) => {
                                              const dist = liq.distributions.find((d: any) => d.agentId === agent.id);
                                              const totalDist = dist ? (Number(dist.honorarios) + Number(dist.sobreasignaciones) + Number(dist.gastos)) : 0;
                                              const cargoStr = agent.cargo === "1" ? "ADMINISTRATIVO" : agent.cargo === "2" ? "MEDICO" : agent.cargo === "3" ? "ENFERMERO" : agent.cargo || "PROFESIONAL";

                                              return (
                                                <TableRow key={agent.id} className="hover:bg-transparent border-border text-foreground text-xs">
                                                  <TableCell className="py-2 font-semibold text-foreground">{agent.nombre}</TableCell>
                                                  <TableCell className="py-2 font-mono">{agent.cuil}</TableCell>
                                                  <TableCell className="py-2">{cargoStr}</TableCell>
                                                  <TableCell className="py-2 text-right">{dist ? formatCurrency(dist.honorarios) : "-"}</TableCell>
                                                  <TableCell className="py-2 text-right">{dist ? formatCurrency(dist.sobreasignaciones) : "-"}</TableCell>
                                                  <TableCell className="py-2 text-right">{dist ? formatCurrency(dist.gastos) : "-"}</TableCell>
                                                  <TableCell className="py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                    {totalDist > 0 ? formatCurrency(totalDist) : "-"}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  {/* Print Footer note */}
                                  <div className="flex justify-between items-center text-[9px] text-muted-foreground border-t border-border pt-3">
                                    <p>Generado a través del Portal UEP - Sistema de Gestión de Liquidación e Intermediación de Facturación.</p>
                                    <p className="font-mono">LIQ-{String(liq.id).padStart(4, "0")} / {liq.mesCarga || "N/A"}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
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
