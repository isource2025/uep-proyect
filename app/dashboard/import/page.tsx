"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, UploadCloud, CheckCircle, RefreshCw, FileSpreadsheet, AlertCircle, Info, ShieldCheck } from "lucide-react";
import { SisperImportModal } from "@/components/sisper-import-modal";

interface ErpStatusData {
  fcCount: number;
  rcCount: number;
  appliesCount: number;
  purchasesCount: number;
}

export default function ImportPage() {
  const [erpLoading, setErpLoading] = useState(false);
  const [erpStatus, setErpStatus] = useState<ErpStatusData | null>(null);
  const [erpError, setErpError] = useState("");
  const [lastImportInfo, setLastImportInfo] = useState<{ period: string; count: number } | null>(null);

  const triggerErpSync = async () => {
    setErpLoading(true);
    setErpStatus(null);
    setErpError("");

    try {
      const res = await fetch("/api/import/erp-status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al sincronizar");
      
      setErpStatus(data);
    } catch (e: any) {
      setErpError(e.message || "Error al conectar con la base de datos SQL Server");
    } finally {
      setErpLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Centro de Importación</h1>
        <p className="text-sm text-muted-foreground">
          Módulo 2: Sincronización de datos con sistemas ERP y carga de nómina de personal de salud (SISPER).
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ERP Sync Card */}
        <Card className="border-border bg-card text-card-foreground flex flex-col justify-between">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-2">
              <Database className="h-5 w-5" />
            </div>
            <CardTitle className="text-foreground text-lg font-bold">Conexión ERP en Tiempo Real</CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-1 leading-relaxed">
              Verifica el estado y consulta la cantidad de registros activos directamente en el ERP de facturación y compras.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Esquema Contable ERP:</h3>
              <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                <li><strong className="text-foreground">CBTES</strong>: Facturas de Venta (FC) y Recibos (RC).</li>
                <li><strong className="text-foreground">CBTES_APLICA</strong>: Imputaciones contables del ERP.</li>
                <li><strong className="text-foreground">COMPRAS</strong>: Comprobantes de Hospitales cargados.</li>
              </ul>
            </div>

            {erpStatus && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle className="h-4.5 w-4.5" />
                  <span>Conexión de Lectura Establecida</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/40 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Facturas (FC):</span>
                    <span className="font-semibold text-foreground">{erpStatus.fcCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recibos (RC):</span>
                    <span className="font-semibold text-foreground">{erpStatus.rcCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Imputaciones:</span>
                    <span className="font-semibold text-foreground">{erpStatus.appliesCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Compras:</span>
                    <span className="font-semibold text-foreground">{erpStatus.purchasesCount}</span>
                  </div>
                </div>
              </div>
            )}

            {erpError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{erpError}</p>
              </div>
            )}

            <Button
              onClick={triggerErpSync}
              disabled={erpLoading}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-11 cursor-pointer"
            >
              {erpLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4.5 w-4.5 animate-spin" />
                  Consultando ERP...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4.5 w-4.5" />
                  Verificar Conexión ERP
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* SISPER Excel Card */}
        <Card className="border-border bg-card text-card-foreground flex flex-col justify-between">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 mb-2">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <CardTitle className="text-foreground text-lg font-bold">Importación SISPER (Excel)</CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-1 leading-relaxed">
              Sube la nómina médica y de personal sanitario exportada de SISPER para procesarla y guardarla en la tabla <code className="font-mono text-emerald-600 dark:text-emerald-400">imPersonalMsp</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Características del Proceso:</h3>
              <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                <li><strong className="text-foreground">Matcheo Automático</strong>: Vincula agentes con hospitales mediante el código de Lugar de Pago.</li>
                <li><strong className="text-foreground">Extracción de CUIL</strong>: Limpia y normaliza el CUIL/DNI de 11 dígitos como identificador único.</li>
                <li><strong className="text-foreground">Transacción Atómica</strong>: Inserción segura con detección y confirmación de nóminas previas.</li>
              </ul>
            </div>

            {lastImportInfo && (
              <div className="flex items-start gap-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 p-3 text-xs text-teal-600 dark:text-teal-400 animate-fade-in">
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Última importación exitosa</p>
                  <p className="text-muted-foreground mt-0.5">
                    Se procesaron <strong className="text-foreground">{lastImportInfo.count.toLocaleString("es-AR")}</strong> agentes para el período <strong className="text-foreground">{lastImportInfo.period}</strong>.
                  </p>
                </div>
              </div>
            )}

            <SisperImportModal
              onSuccess={(period, count) => {
                setLastImportInfo({ period, count });
              }}
              trigger={
                <Button className="w-full mt-4 bg-teal-600 hover:bg-teal-500 text-zinc-950 font-bold h-11 cursor-pointer gap-2 shadow-sm">
                  <UploadCloud className="h-5 w-5" />
                  Abrir Asistente de Importación SISPER
                </Button>
              }
            />

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border pt-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Compatible con planillas oficiales <span className="font-mono text-foreground">.xlsx / .xls</span> de Arancelamiento SISPER.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
