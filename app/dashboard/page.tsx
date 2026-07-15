import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Building2, Users, FileText, Landmark, ArrowUpRight, DollarSign, CalendarDays } from "lucide-react";
import Link from "next/link";

export const revalidate = 0; // Force dynamic rendering so database updates show immediately

export default async function DashboardPage() {
  // Fetch summary stats from DB
  const hospitalCount = await prisma.proveedor.count({ where: { tipoProvId: 18 } });
  const agentCount = await prisma.agent.count();
  const fcCount = await prisma.cbte.count({ where: { type: "FC" } });
  const rcCount = await prisma.cbte.count({ where: { type: "RC" } });

  // Get active period (fechaCierre is null)
  const activePeriod = await prisma.periodoIVA.findFirst({
    where: { fechaCierre: null, iva: "V" },
  });

  // Get recent ERP invoices/receipts
  const recentCbtes = await prisma.cbte.findMany({
    take: 5,
    orderBy: { fecha: "desc" },
    include: { cliente: true },
  });

  // Calculate total invoice amounts
  const totalInvoiced = await prisma.cbte.aggregate({
    _sum: { importe: true },
    where: { type: "FC" },
  });

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

  const statCards = [
    {
      title: "Hospitales (Proveedores)",
      value: hospitalCount,
      description: "Centros médicos activos en el sistema ERP",
      icon: Building2,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Agentes Médicos (SISPER)",
      value: agentCount,
      description: "Profesionales de la salud registrados",
      icon: Users,
      color: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20",
    },
    {
      title: "Facturas de Venta (FC)",
      value: fcCount,
      description: `Monto total: ${formatCurrency(totalInvoiced._sum.importe)}`,
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "Recibos de Cobranza (RC)",
      value: rcCount,
      description: "Recibos de cobro de obras sociales",
      icon: Landmark,
      color: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
  ];

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard General</h1>
          <p className="text-sm text-muted-foreground">
            Resumen estadístico y operaciones iniciales del período actual.
          </p>
        </div>
        
        {activePeriod && (
          <div className="flex items-center gap-3 rounded-xl bg-card border border-border p-3 self-start md:self-auto">
            <CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div className="text-left text-xs">
              <p className="font-semibold text-foreground">
                Período Activo: {getMonthName(activePeriod.mes)} {activePeriod.anio}
              </p>
              <p className="text-muted-foreground mt-0.5">
                Alta: {activePeriod.fechaAlta ? new Date(activePeriod.fechaAlta).toLocaleDateString("es-AR") : "-"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-border bg-card text-card-foreground">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {card.title}
                </CardTitle>
                <div className={`rounded-lg p-2 border ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground tracking-tight">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-tight">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Grid split */}
      <div className="grid gap-6 md:grid-cols-7">
        {/* Recent Invoices / Receipts Table */}
        <Card className="col-span-4 border-border bg-card text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">Comprobantes Recientes (ERP)</CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                Últimos comprobantes de cobro (RC) y venta (FC) importados del ERP.
              </CardDescription>
            </div>
            <Link href="/dashboard/import">
              <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-muted text-xs gap-1.5 h-8 cursor-pointer">
                Importar Más
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50 text-muted-foreground">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="font-semibold text-xs">Tipo</TableHead>
                    <TableHead className="font-semibold text-xs">Número</TableHead>
                    <TableHead className="font-semibold text-xs">Fecha</TableHead>
                    <TableHead className="font-semibold text-xs">Cliente</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCbtes.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                        No hay comprobantes cargados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentCbtes.map((cbte) => (
                      <TableRow key={cbte.id} className="hover:bg-muted/40 border-border text-foreground">
                        <TableCell>
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold ${
                            cbte.type === "RC"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25"
                          }`}>
                            {cbte.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{cbte.puntoVenta}-{cbte.numero}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(cbte.fecha).toLocaleDateString("es-AR")}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground truncate max-w-[120px]">
                          {cbte.cliente.nombre}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-foreground">
                          {formatCurrency(cbte.importe)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Shortcuts and Quick Actions */}
        <Card className="col-span-3 border-border bg-card text-card-foreground flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Acciones Rápidas</CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-1">
              Atajos a operaciones principales de liquidación y control.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between space-y-4">
            <div className="grid gap-3">
              <Link href="/dashboard/import">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/60 cursor-pointer transition-all duration-200">
                  <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-2 text-teal-600 dark:text-teal-400">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Importar Archivo SISPER</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sube nómina médica e identifica personal</p>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/liquidations">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/60 cursor-pointer transition-all duration-200">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Calcular Liquidación</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Generar liquidaciones automáticas basadas en RCs</p>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/periods">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/60 cursor-pointer transition-all duration-200">
                  <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2 text-purple-600 dark:text-purple-400">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Configurar Período</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Abrir o cerrar períodos contables de facturación</p>
                  </div>
                </div>
              </Link>
            </div>
            
            <div className="text-[10px] text-muted-foreground text-center border-t border-border pt-4 mt-auto leading-relaxed">
              Sistema de Liquidaciones - Unidad Ejecutora Provincial (UEP) &copy; 2026. Todos los derechos reservados.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
