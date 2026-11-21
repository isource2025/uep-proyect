"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Compass, FileQuestion, Home, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundViewProps {
  /** Si es true, se renderiza dentro del layout del dashboard en lugar de ocupar toda la pantalla */
  embedded?: boolean;
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
}

export function NotFoundView({
  embedded = false,
  title = "Página no encontrada",
  description = "La ruta o el comprobante que estás buscando no existe, fue movido o ya no se encuentra disponible en el sistema.",
  primaryHref = "/dashboard",
  primaryLabel = "Ir al inicio",
}: NotFoundViewProps) {
  const router = useRouter();

  return (
    <div
      className={
        embedded
          ? "flex flex-1 min-h-[68vh] w-full items-center justify-center px-4 py-8 sm:px-6"
          : "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6 md:px-8 text-foreground"
      }
    >
      {/* Decoración ambiental sutil (sin desbordamiento) */}
      {!embedded && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl sm:h-96 sm:w-96" />
          <div className="absolute -bottom-24 right-1/4 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
        </div>
      )}

      <div className="relative z-10 w-full max-w-lg mx-auto">
        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm p-6 sm:p-8 md:p-10 shadow-xl text-center space-y-6">
          {/* Membrete institucional */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>UEP · Ministerio de Salud Pública</span>
          </div>

          {/* Código 404 + ícono */}
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                <FileQuestion className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <span className="absolute -bottom-2 -right-3 rounded-lg border border-border bg-background px-2 py-0.5 font-mono text-xs font-extrabold text-foreground shadow-sm">
                404
              </span>
            </div>

            <div className="space-y-2 pt-1 max-w-md mx-auto">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-foreground break-words">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed break-words">
                {description}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="w-full sm:w-auto h-10 px-4 text-xs sm:text-sm font-semibold border-border gap-2 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span>Volver atrás</span>
            </Button>

            <Button
              asChild
              className="w-full sm:w-auto h-10 px-5 text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-zinc-950 gap-2 shadow-sm cursor-pointer"
            >
              <Link href={primaryHref}>
                <Home className="h-4 w-4 shrink-0" />
                <span>{primaryLabel}</span>
              </Link>
            </Button>
          </div>

          {/* Pie informativo */}
          <div className="pt-4 border-t border-border/70 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Compass className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="break-words">
              Verificá la dirección ingresada o navegá desde el menú principal.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
