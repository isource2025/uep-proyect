"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send,
  Mail,
  RefreshCw,
  Building2,
  Calendar,
  DollarSign,
  AlertTriangle,
  Info,
  Hash,
  X,
  FileText,
  Plus,
  UserCheck,
} from "lucide-react";

export interface RecipientItem {
  id: string;
  name: string;
  email: string;
  isCustom?: boolean;
}

export interface NotifyHospitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    recipients: string[];
    subject: string;
    message: string;
  }) => Promise<void>;
  liquidation: {
    id: number;
    mesCarga?: string | null;
    status: string;
    clientName?: string;
    rcNumber?: string;
    totalNeto?: number;
    details?: any[];
  } | null;
  isRectification?: boolean;
}

export function NotifyHospitalModal({
  isOpen,
  onClose,
  onConfirm,
  liquidation,
  isRectification = false,
}: NotifyHospitalModalProps) {
  const [recipientsList, setRecipientsList] = useState<RecipientItem[]>([]);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const formatCurrency = (val?: number) => {
    if (val === undefined || isNaN(val)) return "$0,00";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(val);
  };

  useEffect(() => {
    if (!liquidation || !isOpen) return;

    // 1. Calculate default hospital recipient items
    const details = liquidation.details || [];
    const items: RecipientItem[] = [];
    const hospitalNames: string[] = [];

    details.forEach((d: any, idx: number) => {
      const hName = d.prestadorNombre || d.hospital?.nombre || `Hospital #${d.hospitalId || idx + 1}`;
      if (!hospitalNames.includes(hName)) {
        hospitalNames.push(hName);
      }
      const rawEmail =
        d.hospital?.email ||
        `${hName.toLowerCase().replace(/\s+/g, "")}@uep.gov.ar`;

      if (!items.some((it) => it.email.toLowerCase() === rawEmail.toLowerCase())) {
        items.push({
          id: `hosp-${d.hospitalId || idx}`,
          name: hName,
          email: rawEmail,
          isCustom: false,
        });
      }
    });

    if (items.length === 0) {
      items.push({
        id: "default-1",
        name: "Hospital Prestador",
        email: "hospital@uep.gov.ar",
        isCustom: false,
      });
    }

    setRecipientsList(items);
    setNewEmailInput("");

    // 2. Build default subject
    const periodStr = liquidation.mesCarga?.trim() || "Período Actual";
    const liqIdStr = `LIQ-${String(liquidation.id).padStart(4, "0")}`;
    const clientStr = liquidation.clientName || "Obra Social";

    if (isRectification) {
      setSubject(`[RECTIFICACIÓN] Liquidación Rectificada Disponible - Período: ${periodStr} - ${liqIdStr}`);
    } else {
      setSubject(`Nueva Liquidación Disponible - Período: ${periodStr} - ${liqIdStr}`);
    }

    // 3. Build default professional message body
    const totalNetoStr = formatCurrency(liquidation.totalNeto);
    const hospitalsListed = hospitalNames.length > 0 ? hospitalNames.join(", ") : "Establecimientos Asignados";

    if (isRectification) {
      setMessage(
`Estimado Director / Administrador de Establecimiento de Salud,

Nos comunicamos desde la Unidad Ejecutora Provincial (UEP) para informarle que se ha emitido una RECTIFICACIÓN sobre la liquidación de fondos correspondiente a su establecimiento:

• Obra Social: ${clientStr}
• Período: ${periodStr}
• Liquidación N°: ${liqIdStr}
• Establecimiento(s): ${hospitalsListed}
• Importe Neto Total Ajustado: ${totalNetoStr}

Por favor, ingrese a la brevedad al Portal de Hospitales (UEP) para verificar los nuevos montos rectificados y revalidar la distribución de fondos entre Honorarios Médicos, Sobreasignaciones y Gastos.

Atentamente,
Mesa de Liquidaciones - UEP
Unidad Ejecutora Provincial`
      );
    } else {
      setMessage(
`Estimado Director / Administrador de Establecimiento de Salud,

Nos comunicamos desde la Unidad Ejecutora Provincial (UEP) para informarle que se encuentra disponible una nueva liquidación de fondos correspondiente a su establecimiento:

• Obra Social: ${clientStr}
• Período: ${periodStr}
• Liquidación N°: ${liqIdStr}
• Establecimiento(s): ${hospitalsListed}
• Importe Neto Total a Distribuir: ${totalNetoStr}

Por favor, ingrese al Portal de Hospitales (UEP) antes de la fecha límite establecida para realizar la distribución de fondos correspondiente a Honorarios Médicos, Sobreasignaciones y Gastos.

Atentamente,
Mesa de Liquidaciones - UEP
Unidad Ejecutora Provincial`
      );
    }
    setErrorMsg("");
  }, [liquidation, isOpen, isRectification]);

  const handleAddEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = newEmailInput.trim().toLowerCase();
    if (!cleanEmail) return;

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setErrorMsg("Ingrese una dirección de correo electrónico válida.");
      return;
    }

    if (recipientsList.some((r) => r.email.toLowerCase() === cleanEmail)) {
      setErrorMsg("Este correo electrónico ya se encuentra agregado.");
      return;
    }

    setRecipientsList((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: cleanEmail,
        email: cleanEmail,
        isCustom: true,
      },
    ]);
    setNewEmailInput("");
    setErrorMsg("");
  };

  const handleRemoveRecipient = (id: string) => {
    setRecipientsList((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawList = recipientsList.map((r) => r.email.trim()).filter(Boolean);

    if (rawList.length === 0) {
      setErrorMsg("Debe especificar al menos un destinatario en la lista.");
      return;
    }

    if (!subject.trim()) {
      setErrorMsg("El asunto del correo no puede estar vacío.");
      return;
    }

    if (!message.trim()) {
      setErrorMsg("El cuerpo del mensaje no puede estar vacío.");
      return;
    }

    setIsSending(true);
    setErrorMsg("");
    try {
      await onConfirm({
        recipients: rawList,
        subject: subject.trim(),
        message: message.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al enviar la notificación.");
    } finally {
      setIsSending(false);
    }
  };

  if (!liquidation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSending && onClose()}>
      <DialogContent className="w-[96vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-card border-border shadow-2xl">
        {/* MODAL HEADER */}
        <div className="p-5 sm:p-6 border-b border-border/80 bg-muted/20">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    isRectification
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                  }`}
                >
                  {isRectification ? (
                    <RefreshCw className="h-6 w-6" />
                  ) : (
                    <Send className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    {isRectification
                      ? "Notificar Rectificación de Liquidación"
                      : "Notificar Liquidación al Hospital"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Personalice los destinatarios, el asunto y el mensaje antes de emitir la notificación.
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Responsive Summary Cards Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
              <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-0.5 shadow-2xs">
                <span className="text-3xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-emerald-500" />
                  Obra Social
                </span>
                <p className="font-extrabold text-foreground truncate text-xs" title={liquidation.clientName || "Obra Social"}>
                  {liquidation.clientName || "Obra Social"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-0.5 shadow-2xs">
                <span className="text-3xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                  <Hash className="h-3 w-3 text-purple-500" />
                  Liquidación
                </span>
                <p className="font-mono font-bold text-foreground text-xs">
                  LIQ-{String(liquidation.id).padStart(4, "0")}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-0.5 shadow-2xs">
                <span className="text-3xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-blue-500" />
                  Período
                </span>
                <p className="font-mono font-bold text-foreground text-xs">
                  {liquidation.mesCarga || "N/A"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-0.5 shadow-2xs">
                <span className="text-3xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-emerald-500" />
                  Neto a Pagar
                </span>
                <p className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-xs truncate">
                  {formatCurrency(liquidation.totalNeto)}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          <form id="notify-form" onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* DESTINATARIOS EN BADGES */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Destinatarios ({recipientsList.length})
                </Label>
                <span className="text-3xs text-muted-foreground">
                  Pase el mouse sobre un badge para ver la dirección de correo
                </span>
              </div>

              {/* Badges Container */}
              <div className="p-3 bg-background border border-border rounded-lg flex flex-wrap items-center gap-2 min-h-[52px] overflow-visible">
                {recipientsList.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    No hay destinatarios seleccionados. Agregue un correo debajo.
                  </span>
                ) : (
                  recipientsList.map((rec) => (
                    <div
                      key={rec.id}
                      className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold shadow-2xs hover:bg-primary/15 hover:z-30 transition-all cursor-default"
                      title={`Correo de destino: ${rec.email}`}
                    >
                      {rec.isCustom ? (
                        <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      <span className="max-w-[240px] sm:max-w-[320px] truncate">
                        {rec.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRecipient(rec.id);
                        }}
                        disabled={isSending}
                        className="p-0.5 rounded-full hover:bg-primary/20 text-primary/70 hover:text-primary transition-colors cursor-pointer ml-1"
                        title={`Eliminar ${rec.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>

                      {/* Tooltip Hover Popup (Oriented downwards to avoid header clipping) */}
                      <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col z-50 w-72 sm:w-80 max-w-[90vw] p-3 bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border text-xs pointer-events-none animate-in fade-in-0 zoom-in-95 whitespace-normal break-words text-left">
                        {/* Upward Arrow */}
                        <div className="absolute -top-1.5 left-4 sm:left-1/2 sm:-translate-x-1/2 w-3 h-3 bg-popover border-t border-l border-border rotate-45" />
                        
                        <div className="flex items-center gap-1.5 font-bold text-primary text-2xs mb-1.5 pb-1 border-b border-border/60 relative z-10">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span>Dirección de Correo Destino</span>
                        </div>
                        <div className="p-1.5 rounded bg-muted/60 border border-border/50 font-mono text-2xs text-foreground font-bold break-all select-text relative z-10">
                          {rec.email}
                        </div>
                        {!rec.isCustom && (
                          <p className="text-3xs text-muted-foreground mt-1.5 leading-tight relative z-10">
                            <strong className="text-foreground font-semibold">Establecimiento:</strong> {rec.name}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input para agregar nuevos destinatarios */}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  disabled={isSending}
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                  placeholder="Agregar otro correo destinatario (ej. direccion@hospital.gob.ar)..."
                  className="text-xs bg-background h-8.5 font-mono flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddEmail()}
                  disabled={isSending || !newEmailInput.trim()}
                  className="h-8.5 text-xs font-bold gap-1 px-3 border-border cursor-pointer shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir
                </Button>
              </div>
            </div>

            {/* ASUNTO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Asunto del Correo
                </Label>
              </div>
              <Input
                disabled={isSending}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto de la notificación..."
                className="text-xs bg-background font-medium h-9 w-full"
              />
            </div>

            {/* CUERPO DEL MENSAJE */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Mensaje al Establecimiento
                </Label>
                <span className="text-3xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Texto libre editable
                </span>
              </div>
              <textarea
                disabled={isSending}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={9}
                placeholder="Escriba el cuerpo del mensaje..."
                className="w-full text-xs bg-background border border-border rounded-lg p-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 resize-y font-normal leading-relaxed"
              />
            </div>
          </form>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 border-t border-border/80 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-2xs text-muted-foreground text-center sm:text-left">
            La notificación se enviará a los establecimientos seleccionados y registrará el estado correspondiente.
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSending}
              className="text-xs border-border h-9 px-4 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="notify-form"
              disabled={isSending || recipientsList.length === 0}
              className={`h-9 px-5 text-xs font-bold gap-2 cursor-pointer shadow-sm ${
                isRectification
                  ? "bg-amber-600 hover:bg-amber-500 text-zinc-950"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {isSending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Enviando Notificación...
                </>
              ) : isRectification ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Confirmar y Enviar Rectificación
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Confirmar y Enviar Notificación
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
