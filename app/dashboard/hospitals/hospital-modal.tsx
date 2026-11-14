"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Plus,
  Pencil,
  Loader2,
  AlertCircle,
  Mail,
  MapPin,
  ShieldCheck,
  Check,
  Sparkles,
} from "lucide-react";
import { PROVEEDOR_TO_EMPRESA_MAP } from "@/lib/hospital-mapping";
import { createHospitalAction, updateHospitalAction } from "./actions";

export interface HospitalRecord {
  id: number;
  descripcion: string;
  localidad: string | null;
  cuit: string | null;
  email: string | null;
}

export interface ProveedorSuggestion {
  id: number;
  nombre: string;
  cuit: string;
}

function normalizeMatchText(value?: string | null): string {
  return (value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface HospitalModalProps {
  mode?: "create" | "edit";
  hospital?: HospitalRecord | null;
  proveedores?: ProveedorSuggestion[];
  trigger?: React.ReactNode;
}

export function HospitalModal({
  mode = "create",
  hospital = null,
  proveedores = [],
  trigger,
}: HospitalModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cuitAutoSource, setCuitAutoSource] = useState<ProveedorSuggestion | null>(null);
  const [cuitManuallyEdited, setCuitManuallyEdited] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    localidad: "",
    cuit: "",
    email: "",
  });

  const isEdit = mode === "edit" || !!hospital;

  const findExactProveedorForHospital = (
    nameValue: string,
    hospitalId?: number | null
  ): ProveedorSuggestion | null => {
    if (proveedores.length === 0) return null;

    if (hospitalId) {
      const mappedProv = proveedores.find(
        (p) => PROVEEDOR_TO_EMPRESA_MAP[p.id] === hospitalId
      );
      if (mappedProv) return mappedProv;
    }

    const normName = normalizeMatchText(nameValue);
    if (!normName) return null;
    return proveedores.find((p) => normalizeMatchText(p.nombre) === normName) || null;
  };

  useEffect(() => {
    if (open) {
      setCuitManuallyEdited(false);
      if (isEdit && hospital) {
        let initialCuit = hospital.cuit || "";
        let matchedSource: ProveedorSuggestion | null = null;

        if (!initialCuit) {
          const match = findExactProveedorForHospital(hospital.descripcion, hospital.id);
          if (match) {
            initialCuit = match.cuit;
            matchedSource = match;
          }
        }

        setCuitAutoSource(matchedSource);
        setFormData({
          name: hospital.descripcion || "",
          localidad: hospital.localidad || "",
          cuit: initialCuit,
          email: hospital.email || "",
        });
      } else {
        setCuitAutoSource(null);
        setFormData({
          name: "",
          localidad: "",
          cuit: "",
          email: "",
        });
      }
      setError("");
      setFieldErrors({});
    }
  }, [open, isEdit, hospital]);

  const cuitDigits = formData.cuit.replace(/[^\d]/g, "");

  const matchedProveedorByCurrentCuit = useMemo(() => {
    if (cuitDigits.length !== 11) return null;
    return proveedores.find((p) => p.cuit === cuitDigits) || null;
  }, [proveedores, cuitDigits]);

  const suggestedProveedores = useMemo(() => {
    if (proveedores.length === 0 || matchedProveedorByCurrentCuit) return [];
    const normQuery = normalizeMatchText(formData.name);
    if (normQuery.length < 3) return [];

    const terms = normQuery.split(" ").filter((t) => t.length >= 2);
    if (terms.length === 0) return [];

    return proveedores
      .filter((p) => {
        if (p.cuit === cuitDigits) return false;
        const normProv = normalizeMatchText(p.nombre);
        return terms.every((t) => normProv.includes(t));
      })
      .slice(0, 4);
  }, [proveedores, formData.name, cuitDigits, matchedProveedorByCurrentCuit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "cuit") {
      setCuitManuallyEdited(true);
      setCuitAutoSource(null);
      setFormData((prev) => ({ ...prev, cuit: value }));
    } else if (name === "name") {
      const canAutocomplete = !cuitManuallyEdited && (!isEdit || !hospital?.cuit);
      if (canAutocomplete) {
        const match = findExactProveedorForHospital(value, isEdit ? hospital?.id : null);
        if (match) {
          setCuitAutoSource(match);
          setFormData((prev) => ({ ...prev, name: value, cuit: match.cuit }));
        } else {
          setCuitAutoSource(null);
          setFormData((prev) => ({ ...prev, name: value }));
        }
      } else {
        setFormData((prev) => ({ ...prev, name: value }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const applySuggestedProveedor = (prov: ProveedorSuggestion) => {
    setFormData((prev) => ({ ...prev, cuit: prov.cuit }));
    setCuitAutoSource(prov);
    setCuitManuallyEdited(true);
    if (fieldErrors.cuit) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.cuit;
        return next;
      });
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    const trimmedName = formData.name.trim();
    const trimmedLocalidad = formData.localidad.trim();
    const digitsCuit = formData.cuit.replace(/[^\d]/g, "");
    const trimmedEmail = formData.email.trim();

    if (!trimmedName) {
      errors.name = "El nombre o razón social es obligatorio.";
    } else if (trimmedName.length > 80) {
      errors.name = "Máximo 80 caracteres.";
    }

    if (!trimmedLocalidad) {
      errors.localidad = "La localidad es obligatoria.";
    } else if (trimmedLocalidad.length > 30) {
      errors.localidad = "Máximo 30 caracteres.";
    }

    if (!digitsCuit) {
      errors.cuit = "El CUIT es obligatorio.";
    } else if (digitsCuit.length !== 11) {
      errors.cuit = "El CUIT debe tener exactamente 11 dígitos.";
    }

    if (!trimmedEmail) {
      errors.email = "El correo corporativo es obligatorio.";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        errors.email = "Ingrese un correo electrónico válido.";
      } else if (trimmedEmail.length > 40) {
        errors.email = "Máximo 40 caracteres (límite de EMPRESAS.EMail).";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = new FormData();
      if (isEdit && hospital) {
        payload.set("hospitalId", String(hospital.id));
      }
      payload.set("name", formData.name.trim());
      payload.set("localidad", formData.localidad.trim());
      payload.set("cuit", formData.cuit.replace(/[^\d]/g, ""));
      payload.set("email", formData.email.trim());

      const res = isEdit
        ? await updateHospitalAction(payload)
        : await createHospitalAction(payload);

      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
      }
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al guardar el establecimiento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
      <DialogTrigger asChild>
        {trigger ||
          (isEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-3xs border-border text-foreground hover:bg-muted cursor-pointer gap-1 px-2.5 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
          ) : (
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer shadow-sm">
              <Plus className="h-4.5 w-4.5" />
              Nuevo Hospital
            </Button>
          ))}
      </DialogTrigger>

      <DialogContent className="border-border bg-card text-card-foreground flex flex-col gap-0 p-0 overflow-hidden w-[calc(100vw-1rem)] sm:w-[92vw] sm:max-w-xl md:max-w-2xl max-h-[92dvh]">
        <DialogHeader className="px-4 py-4 sm:px-6 sm:py-5 border-b border-border/80 bg-muted/20 pr-10 sm:pr-12 text-left shrink-0 space-y-1.5">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Building2 className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-foreground font-bold text-base sm:text-lg leading-snug break-words whitespace-normal">
                {isEdit ? "Editar Hospital / CAPS" : "Registrar Hospital / CAPS"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs leading-relaxed break-words whitespace-normal mt-0.5">
                {isEdit
                  ? "Actualice los datos institucionales y el correo corporativo para notificaciones de liquidaciones."
                  : "Crea un nuevo establecimiento en EMPRESAS con su CUIT y correo corporativo de notificaciones."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          id={`hospital-form-${hospital?.id ?? "new"}`}
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:p-6 space-y-4"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/25 p-3 text-xs text-red-600 dark:text-red-400 break-words whitespace-normal">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">{error}</span>
            </div>
          )}

          <div className="space-y-1.5 min-w-0">
            <Label htmlFor={`name-${hospital?.id ?? "new"}`} className="text-foreground text-xs font-semibold flex flex-wrap items-center gap-1">
              <span>Nombre / Razón Social</span>
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`name-${hospital?.id ?? "new"}`}
              name="name"
              maxLength={80}
              value={formData.name}
              onChange={handleChange}
              placeholder="Ej. HOSPITAL ESCUELA GRAL SAN MARTIN"
              disabled={loading}
              className={`w-full bg-background text-xs sm:text-sm h-10 ${
                fieldErrors.name ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
              }`}
            />
            {fieldErrors.name && (
              <p className="text-[11px] text-red-500 font-medium break-words whitespace-normal">{fieldErrors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
            <div className="space-y-1.5 min-w-0">
              <Label
                htmlFor={`localidad-${hospital?.id ?? "new"}`}
                className="text-foreground text-xs font-semibold flex flex-wrap items-center gap-1.5"
              >
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Localidad</span>
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`localidad-${hospital?.id ?? "new"}`}
                name="localidad"
                maxLength={30}
                value={formData.localidad}
                onChange={handleChange}
                placeholder="Ej. CORRIENTES"
                disabled={loading}
                className={`w-full bg-background text-xs sm:text-sm h-10 ${
                  fieldErrors.localidad ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                }`}
              />
              {fieldErrors.localidad && (
                <p className="text-[11px] text-red-500 font-medium break-words whitespace-normal">{fieldErrors.localidad}</p>
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label
                htmlFor={`cuit-${hospital?.id ?? "new"}`}
                className="text-foreground text-xs font-semibold flex flex-wrap items-center gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>CUIT</span>
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`cuit-${hospital?.id ?? "new"}`}
                name="cuit"
                maxLength={13}
                value={formData.cuit}
                onChange={handleChange}
                placeholder="Ej. 30709270113"
                disabled={loading}
                className={`w-full bg-background text-xs sm:text-sm h-10 font-mono ${
                  fieldErrors.cuit ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                }`}
              />
              {fieldErrors.cuit && (
                <p className="text-[11px] text-red-500 font-medium break-words whitespace-normal">{fieldErrors.cuit}</p>
              )}
              {matchedProveedorByCurrentCuit && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 leading-snug break-words whitespace-normal min-w-0">
                  <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1">
                    {cuitAutoSource
                      ? `Autocompletado desde PROVEEDORES #${matchedProveedorByCurrentCuit.id} (${matchedProveedorByCurrentCuit.nombre}) · modificable`
                      : `Coincide con PROVEEDORES #${matchedProveedorByCurrentCuit.id} (${matchedProveedorByCurrentCuit.nombre})`}
                  </span>
                </p>
              )}
            </div>
          </div>

          {suggestedProveedores.length > 0 && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2 min-w-0">
              <span className="text-3xs text-muted-foreground block leading-snug break-words whitespace-normal">
                Sugerencias de CUIT en PROVEEDORES (clic para completar):
              </span>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {suggestedProveedores.map((prov) => (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => applySuggestedProveedor(prov)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-emerald-500/15 hover:border-emerald-500/40 text-3xs text-foreground transition-colors cursor-pointer max-w-full min-w-0"
                    title={`Aplicar CUIT ${prov.cuit} (${prov.nombre})`}
                  >
                    <span className="truncate min-w-0 font-medium">{prov.nombre}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                      {prov.cuit}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <Label
                htmlFor={`email-${hospital?.id ?? "new"}`}
                className="text-foreground text-xs font-semibold flex flex-wrap items-center gap-1.5 min-w-0"
              >
                <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Correo Corporativo (Notificaciones)</span>
                <span className="text-red-500">*</span>
              </Label>
              <span className="text-3xs text-muted-foreground font-mono shrink-0">
                {formData.email.trim().length}/40
              </span>
            </div>
            <Input
              id={`email-${hospital?.id ?? "new"}`}
              name="email"
              type="email"
              maxLength={40}
              value={formData.email}
              onChange={handleChange}
              placeholder="administracion@hospital.gob.ar"
              disabled={loading}
              className={`w-full bg-background text-xs sm:text-sm h-10 font-mono ${
                fieldErrors.email ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
              }`}
            />
            <p className="text-[11px] text-muted-foreground leading-snug break-words whitespace-normal">
              Casilla institucional donde el efector recibirá los avisos de liquidaciones (independiente de los correos personales de acceso en <code className="text-3xs">imPersonal</code>).
            </p>
            {fieldErrors.email && (
              <p className="text-[11px] text-red-500 font-medium break-words whitespace-normal">{fieldErrors.email}</p>
            )}
          </div>
        </form>

        <DialogFooter className="mx-0 mb-0 px-4 py-4 sm:px-6 sm:py-4 border-t border-border/80 bg-muted/20 shrink-0 flex flex-col-reverse sm:flex-row gap-2.5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="w-full sm:w-auto h-9 text-xs font-semibold cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={`hospital-form-${hospital?.id ?? "new"}`}
            disabled={loading}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-9 text-xs sm:text-sm cursor-pointer gap-1.5 px-4"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {isEdit ? "Guardar Cambios" : "Guardar Hospital"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateHospitalModal(props: Omit<HospitalModalProps, "mode" | "hospital">) {
  return <HospitalModal mode="create" {...props} />;
}

export function EditHospitalModal(props: Omit<HospitalModalProps, "mode">) {
  return <HospitalModal mode="edit" {...props} />;
}
