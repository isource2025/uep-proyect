"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, UploadCloud, CheckCircle, RefreshCw, FileSpreadsheet, AlertCircle, Users } from "lucide-react";

export default function ImportPage() {
  const [erpLoading, setErpLoading] = useState(false);
  const [erpSuccess, setErpSuccess] = useState(false);
  const [sisperLoading, setSisperLoading] = useState(false);
  const [sisperSuccess, setSisperSuccess] = useState(false);
  const [fileName, setFileName] = useState("");

  const triggerErpImport = async () => {
    setErpLoading(true);
    setErpSuccess(false);
    
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    setErpLoading(false);
    setErpSuccess(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setSisperLoading(true);
    setSisperSuccess(false);

    // Simulate file reading and DB import
    await new Promise((resolve) => setTimeout(resolve, 2500));

    setSisperLoading(false);
    setSisperSuccess(true);
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
            <CardTitle className="text-foreground text-lg font-bold">Importación ERP de Facturas & Recibos</CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-1 leading-relaxed">
              Sincroniza el sistema con las tablas externas del ERP de facturación y pagos (CBTES, CBTES_APLICA y COMPRAS).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 flex flex-col justify-between">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <h3 className="text-xs font-bold text-foreground">Tablas ERP involucradas:</h3>
              <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                <li><strong className="text-foreground">CBTES</strong>: Facturas de Venta (FC) y Recibos de Cobro (RC).</li>
                <li><strong className="text-foreground">CBTES_APLICA</strong>: Relación de imputación entre cobros y ventas.</li>
                <li><strong className="text-foreground">COMPRAS</strong>: Comprobantes emitidos por Hospitales y CAPS.</li>
              </ul>
            </div>

            {erpSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-600 dark:text-emerald-400 animate-fade-in">
                <CheckCircle className="h-4.5 w-4.5 shrink-0" />
                <p>Sincronización exitosa. Comprobantes y relaciones ERP actualizados en MariaDB.</p>
              </div>
            )}

            <Button
              onClick={triggerErpImport}
              disabled={erpLoading}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-11 cursor-pointer"
            >
              {erpLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4.5 w-4.5 animate-spin" />
                  Sincronizando con ERP...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4.5 w-4.5" />
                  Sincronizar ahora
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
              Carga la planilla de nómina médica del personal de los Hospitales y CAPS para habilitar la distribución.
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

            {sisperSuccess && (
              <div className="flex items-start gap-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 p-3 text-sm text-teal-650 dark:text-teal-400 animate-fade-in">
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Nómina importada correctamente</p>
                  <p className="text-xs text-teal-600 dark:text-teal-500 mt-0.5">Se actualizaron 5 profesionales y cargos en la base de datos.</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground border-t border-border pt-4">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>El archivo debe contener las columnas obligatorias: DNI, CUIL, Nombre, Cargo, Establecimiento, Hospital.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
