"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, UploadCloud, CheckCircle, RefreshCw, FileSpreadsheet, AlertCircle, Info, Landmark } from "lucide-react";

interface ErpStatusData {
  fcCount: number;
  rcCount: number;
  appliesCount: number;
  purchasesCount: number;
}

interface SisperImportResult {
  createdCount: number;
  updatedCount: number;
  totalCount: number;
}

export default function ImportPage() {
  const [erpLoading, setErpLoading] = useState(false);
  const [erpStatus, setErpStatus] = useState<ErpStatusData | null>(null);
  const [erpError, setErpError] = useState("");

  const [sisperLoading, setSisperLoading] = useState(false);
  const [sisperResult, setSisperResult] = useState<SisperImportResult | null>(null);
  const [sisperError, setSisperError] = useState("");
  const [fileName, setFileName] = useState("");

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSisperLoading(true);
    setSisperResult(null);
    setSisperError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/sisper", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al importar");

      setSisperResult(data);
    } catch (e: any) {
      setSisperError(e.message || "Error de red al procesar el archivo");
    } finally {
      setSisperLoading(false);
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
              Sube la nómina médica de los establecimientos de salud para guardarlos directamente en la tabla `imPersonal`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
            {/* File Upload Area */}
            <div className="relative rounded-lg border-2 border-dashed border-border bg-muted/20 px-6 py-8 text-center hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={sisperLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <div className="text-xs text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Haz clic para subir</span> o arrastra y suelta
                <p className="text-muted-foreground mt-1 text-[11px]">Planilla Excel de SISPER (.xlsx)</p>
              </div>
            </div>

            {fileName && (
              <div className="flex items-center justify-between text-xs rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-2 text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate max-w-[180px] font-mono">{fileName}</span>
                </div>
                {sisperLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            )}

            {sisperResult && (
              <div className="flex items-start gap-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 p-3 text-sm text-teal-650 dark:text-teal-400 animate-fade-in">
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Nómina importada con éxito</p>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1 font-mono">
                    <div>Procesados: {sisperResult.totalCount}</div>
                    <div>Creados en imPersonal: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sisperResult.createdCount}</span></div>
                    <div>Actualizados: <span className="text-teal-600 dark:text-teal-400 font-bold">{sisperResult.updatedCount}</span></div>
                  </div>
                </div>
              </div>
            )}

            {sisperError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{sisperError}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground border-t border-border pt-4">
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>El Excel debe tener las columnas: CUIL, Nombre, Cargo, Establecimiento, Hospital.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
