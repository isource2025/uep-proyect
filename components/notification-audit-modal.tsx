"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchLiquidationNotificationHistoryAction } from "@/app/dashboard/notifications/actions";
import type { LiquidationNotificationHistoryItem } from "@/lib/notification-types";

interface NotificationAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidationId: number | null;
  liquidationCode?: string;
  clientName?: string;
  initialHistory?: LiquidationNotificationHistoryItem[];
}

export function NotificationAuditModal({
  isOpen,
  onClose,
  liquidationId,
  liquidationCode,
  clientName,
  initialHistory,
}: NotificationAuditModalProps) {
  const [history, setHistory] = useState<LiquidationNotificationHistoryItem[]>(initialHistory || []);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!liquidationId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchLiquidationNotificationHistoryAction(liquidationId);
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.history) {
        setHistory(res.history);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al cargar la auditoría de notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [liquidationId]);

  useEffect(() => {
    if (!isOpen || !liquidationId) return;
    if (initialHistory && initialHistory.length > 0 && initialHistory[0]?.liquidationId === liquidationId) {
      setHistory(initialHistory);
    } else if (!initialHistory) {
      setHistory([]);
    }
    loadHistory();
  }, [isOpen, liquidationId, initialHistory, loadHistory]);

  const displayCode =
    liquidationCode || (liquidationId ? `LIQ-${String(liquidationId).padStart(4, "0")}` : "");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden bg-card border-border text-card-foreground shadow-2xl">
        <DialogHeader className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-border/70 bg-muted/20 shrink-0 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pr-8">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
              <div className="min-w-0 flex-1 text-left space-y-0.5">
                <DialogTitle className="text-sm sm:text-base font-bold text-foreground break-words leading-snug">
                  Auditoría de Notificaciones {displayCode ? `· ${displayCode}` : ""}
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground break-words leading-snug">
                  {clientName
                    ? `${clientName} — Trazabilidad de avisos emitidos y lecturas registradas.`
                    : "Trazabilidad de avisos emitidos a hospitales/UEP y confirmaciones de lectura."}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                {history.length} evento{history.length === 1 ? "" : "s"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={loadHistory}
                disabled={loading}
                title="Actualizar historial y lecturas"
                className="h-7 w-7 cursor-pointer border-border shrink-0"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-3">
          {errorMsg ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words">{errorMsg}</span>
            </div>
          ) : loading && history.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
              <span>Cargando auditoría de notificaciones...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center gap-2 text-muted-foreground">
              <Bell className="h-7 w-7 opacity-40" />
              <p className="text-xs font-semibold text-foreground">
                Sin eventos de notificación registrados
              </p>
              <p className="text-[11px] leading-relaxed break-words max-w-sm">
                Los avisos quedarán auditados aquí automáticamente al notificar a los hospitales, emitir rectificaciones o completar la distribución.
              </p>
            </div>
          ) : (
            history.map((ev) => {
              const isUepAud = ev.audiencia === "UEP";
              const isRect = ev.tipo === "RECTIFICACION";
              const eventDate = new Date(ev.createdAt);
              const dateLabel = !isNaN(eventDate.getTime())
                ? eventDate.toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={ev.id}
                  className="rounded-xl border border-border/80 bg-muted/15 p-3 sm:p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                          isUepAud
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            : isRect
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                            : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                        )}
                      >
                        {ev.tipo}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground max-w-full break-words whitespace-normal">
                        {isUepAud
                          ? "Destino: UEP"
                          : ev.targetHospitalName && ev.targetCuit
                          ? `${ev.targetHospitalName} (CUIT ${ev.targetCuit})`
                          : ev.targetHospitalName
                          ? ev.targetHospitalName
                          : ev.targetCuit
                          ? `Hospital CUIT ${ev.targetCuit}`
                          : "Destino: Hospital"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>{dateLabel}</span>
                    </div>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-bold text-foreground break-words">
                      {ev.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground break-words leading-relaxed">
                      {ev.mensaje}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground pt-2 border-t border-border/50 min-w-0">
                    {ev.emisorNombre && (
                      <span className="inline-flex items-center gap-1 min-w-0 break-words">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="break-words">
                          Emisor: <strong className="text-foreground">{ev.emisorNombre}</strong>
                        </span>
                      </span>
                    )}

                    {ev.emailDestinatarios.length > 0 && (
                      <span className="inline-flex items-start sm:items-center gap-1 min-w-0 [overflow-wrap:anywhere]">
                        <Mail className="h-3 w-3 shrink-0 mt-0.5 sm:mt-0" />
                        <span>
                          Casillas (
                          <strong
                            className={
                              ev.emailEnviado
                                ? "text-emerald-600 dark:text-emerald-400"
                                : ev.emailError
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground"
                            }
                          >
                            {ev.emailEnviado
                              ? "Email enviado"
                              : ev.emailError
                              ? "Error de envío"
                              : "Sin envío de email"}
                          </strong>
                          ):{" "}
                          <strong className="text-foreground font-mono text-[10px]">
                            {ev.emailDestinatarios.join(", ")}
                          </strong>
                        </span>
                      </span>
                    )}
                  </div>

                  {ev.emailError && (
                    <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="break-words">Detalle SMTP: {ev.emailError}</span>
                    </div>
                  )}

                  <div className="rounded-lg bg-background/70 border border-border/60 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground mb-1.5">
                      <CheckCircle2
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          ev.lecturas.length > 0 ? "text-emerald-500" : "text-muted-foreground/50"
                        )}
                      />
                      <span>Confirmaciones de lectura ({ev.lecturas.length})</span>
                    </div>

                    {ev.lecturas.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        Aún sin lecturas registradas en plataforma.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {ev.lecturas.map((lec) => {
                          const readAt = new Date(lec.leidaAt);
                          const readLabel = !isNaN(readAt.getTime())
                            ? readAt.toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "";
                          return (
                            <span
                              key={lec.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300 break-words max-w-full"
                            >
                              <span className="font-semibold">{lec.userName}</span>
                              {readLabel && (
                                <span className="opacity-75 font-mono">({readLabel})</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 px-4 py-3 sm:px-6 border-t border-border/70 bg-muted/20 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto font-medium cursor-pointer text-xs"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
