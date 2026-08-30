"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  Building2,
  Plus,
  Paperclip,
  FileDown,
  Eye,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import DistributionGrid from "./distribution-grid";

interface HospitalPortalClientProps {
  hospital: any;
  hospitalId: number;
  initialLiquidations: any[];
  agents: any[];
  onAddAttachment: (formData: FormData) => Promise<void>;
}

export default function HospitalPortalClient({
  hospital,
  hospitalId,
  initialLiquidations,
  agents,
  onAddAttachment,
}: HospitalPortalClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter liquidations based on search query
  const filteredLiquidations = initialLiquidations.filter((liq: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const liqNum = `liq-${String(liq.id).padStart(4, "0")}`.toLowerCase();
    const idStr = String(liq.id);
    const mesCarga = (liq.mesCarga || "").toLowerCase();
    const periodName = (liq.period ? `${getMonthName(liq.period.mes)} ${liq.period.anio}` : "").toLowerCase();
    const rcNum = `${liq.rc?.puntoVenta || ""}-${liq.rc?.numero || ""}`.toLowerCase();
    const clienteName = (liq.rc?.cliente?.nombre || "").toLowerCase();
    const status = (liq.status || "").toLowerCase();

    return (
      liqNum.includes(q) ||
      idStr.includes(q) ||
      mesCarga.includes(q) ||
      periodName.includes(q) ||
      rcNum.includes(q) ||
      clienteName.includes(q) ||
      status.includes(q)
    );
  });

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
        <CardHeader className="p-5 pb-3 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold text-foreground">Liquidaciones de Obras Sociales</CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-0.5">
              Seleccione una liquidación consolidada para cargar la distribución y los adjuntos.
            </CardDescription>
          </div>

          {/* Search bar */}
          <SearchBar
            placeholder="Buscar por liquidación, período, recibo u O.S..."
            value={searchQuery}
            onChange={setSearchQuery}
            size="sm"
            className="w-full sm:w-80"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                {filteredLiquidations.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-12">
                      {searchQuery.trim()
                        ? "No se encontraron liquidaciones que coincidan con la búsqueda."
                        : "No se encontraron liquidaciones para su establecimiento."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLiquidations.map((liq) => {
                    const hospitalDetails = liq.details.filter(
                      (d: any) =>
                        d.hospitalId === hospitalId ||
                        (d.prestadorNombre && hospital.nombre && d.prestadorNombre.toLowerCase().trim().includes(hospital.nombre.toLowerCase().trim())) ||
                        (hospital.nombre && d.prestadorNombre && hospital.nombre.toLowerCase().trim().includes(d.prestadorNombre.toLowerCase().trim()))
                    );
                    const currentDetails = hospitalDetails.length > 0 ? hospitalDetails : liq.details;

                    const totalFacturado = currentDetails.reduce((sum: number, d: any) => sum + Number(d.totalFacturado), 0);
                    const netoFinal = currentDetails.reduce((sum: number, d: any) => sum + Number(d.netoAPagar), 0);

                    const totalDistributed = liq.distributions.reduce(
                      (sum: number, d: any) => sum + Number(d.honorarios) + Number(d.sobreasignaciones) + Number(d.gastos),
                      0
                    );

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
                                  <form action={onAddAttachment} className="space-y-4 border-t border-b border-border py-4 my-2">
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
                                      liq.attachments.map((at: any) => (
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

                            {/* 2. Direct Navigation to Liquidation Detail Page */}
                            <Link href={`/dashboard/liquidations/${liq.id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1.5 h-8 border border-border hover:bg-muted cursor-pointer font-bold text-foreground"
                              >
                                <Eye className="h-3.5 w-3.5 text-emerald-500" />
                                Ver / Editar
                              </Button>
                            </Link>
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
