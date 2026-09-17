"use client";

import { useState, useEffect } from "react";
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
import { UserPlus, Pencil, Eye, EyeOff, Loader2, AlertCircle, Shield, KeyRound, UserCheck } from "lucide-react";
import { createUserAction, updateUserAction } from "./actions";

export interface RoleOption {
  id: number;
  nombre: string;
}

export interface HospitalOption {
  id: number;
  nombre: string | null;
}

export interface UserFormData {
  id: number;
  name: string;
  email: string | null;
  operador?: string | null;
  cuit?: string | null;
  role?: string | null;
  hospitalId?: number | null;
}

interface UserModalProps {
  mode?: "create" | "edit";
  user?: UserFormData | null;
  roles: RoleOption[];
  hospitals: HospitalOption[];
  trigger?: React.ReactNode;
}

export function UserModal({
  mode = "create",
  user = null,
  roles,
  hospitals,
  trigger,
}: UserModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled form values for reliable prefilling in edit mode
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    operador: "",
    cuit: "",
    role: "",
    hospitalId: "",
    password: "",
    confirmPassword: "",
  });

  const isEdit = mode === "edit" || !!user;

  // Initialize or reset form values when opening or when user changes
  useEffect(() => {
    if (open) {
      if (isEdit && user) {
        setFormData({
          name: user.name || "",
          email: user.email || "",
          operador: user.operador || "",
          cuit: user.cuit || "",
          role: user.role ? String(user.role) : "",
          hospitalId: user.hospitalId ? String(user.hospitalId) : "",
          password: "",
          confirmPassword: "",
        });
      } else {
        setFormData({
          name: "",
          email: "",
          operador: "",
          cuit: "",
          role: "",
          hospitalId: "",
          password: "",
          confirmPassword: "",
        });
      }
      setError("");
      setFieldErrors({});
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open, isEdit, user]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setError("");
      setFieldErrors({});
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    const data = new FormData();
    if (isEdit && user) {
      data.append("userId", String(user.id));
    }
    data.append("name", formData.name);
    data.append("email", formData.email);
    data.append("operador", formData.operador);
    data.append("cuit", formData.cuit);
    data.append("role", formData.role);
    data.append("hospitalId", formData.hospitalId);
    data.append("password", formData.password);
    data.append("confirmPassword", formData.confirmPassword);

    const res = isEdit
      ? await updateUserAction(data)
      : await createUserAction(data);

    setLoading(false);
    if (res?.error) {
      setError(res.error);
      if (res.fieldErrors) {
        setFieldErrors(res.fieldErrors);
      }
    } else {
      setOpen(false);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setError("");
      setFieldErrors({});
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : isEdit ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-3xs border-border text-foreground hover:bg-muted cursor-pointer gap-1 px-2.5 transition-colors"
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
            Editar
          </Button>
        ) : (
          <Button className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold gap-1.5 self-start md:self-auto h-10 transition-all cursor-pointer shadow-sm">
            <UserPlus className="h-4.5 w-4.5" />
            Nuevo Operador
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-card text-card-foreground w-full max-w-[95vw] sm:max-w-2xl md:max-w-3xl p-5 sm:p-7 max-h-[90vh] overflow-y-auto shadow-2xl rounded-2xl">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {isEdit ? <Pencil className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">
                {isEdit ? "Editar Operador" : "Registrar Nuevo Operador"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                {isEdit
                  ? "Modifica los datos del operador en imPersonal y actualiza sus credenciales de acceso."
                  : "Crea un registro de personal en imPersonal en estado Activo y asocia sus credenciales de inicio de sesión."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs sm:text-sm text-red-600 dark:text-red-400 animate-fade-in my-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Seccion Datos Personales y Acceso */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              <span>Datos del Operador y Perfil</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name" className="text-foreground text-xs font-semibold">
                  Apellido y Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej. PEREZ JUAN"
                  className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 ${
                    fieldErrors.name ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-foreground text-xs font-semibold">
                  Correo Electrónico <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="usuario@uep.gov.ar"
                  className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 ${
                    fieldErrors.email ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                  }`}
                />
                {fieldErrors.email && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="operador" className="text-foreground text-xs font-semibold">
                  Código Operador (Max 10)
                </Label>
                <Input
                  id="operador"
                  name="operador"
                  maxLength={10}
                  value={formData.operador}
                  onChange={handleChange}
                  placeholder="ej. JPEREZ"
                  className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 ${
                    fieldErrors.operador ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                  }`}
                />
                {fieldErrors.operador && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.operador}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-foreground text-xs font-semibold">
                  Rol Operador <span className="text-red-500">*</span>
                </Label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className={`flex h-10 w-full rounded-md border bg-muted/40 text-foreground px-3 py-2 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 cursor-pointer ${
                    fieldErrors.role ? "border-red-500/70 focus-visible:ring-red-500" : "border-input"
                  }`}
                >
                  <option value="" className="bg-card text-foreground">Seleccionar rol...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={String(r.id)} className="bg-card text-foreground">
                      {r.nombre}
                    </option>
                  ))}
                </select>
                {fieldErrors.role && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.role}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cuit" className="text-foreground text-xs font-semibold">
                  CUIT / CUIL
                </Label>
                <Input
                  id="cuit"
                  name="cuit"
                  value={formData.cuit}
                  onChange={handleChange}
                  placeholder="11 dígitos numéricos"
                  className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 ${
                    fieldErrors.cuit ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                  }`}
                />
                {fieldErrors.cuit && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.cuit}</p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="hospitalId" className="text-foreground text-xs font-semibold">
                  Lugar Trabajo / Establecimiento Efector
                </Label>
                <select
                  id="hospitalId"
                  name="hospitalId"
                  value={formData.hospitalId}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-muted/40 text-foreground px-3 py-2 text-xs sm:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 cursor-pointer"
                >
                  <option value="" className="bg-card text-foreground">Ninguno (Sede Central UEP)</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id} className="bg-card text-foreground">
                      {h.nombre || `Hospital ${h.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Seccion Seguridad & Credenciales */}
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
              <span>Credenciales de Inicio de Sesión</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-foreground text-xs font-semibold">
                  {isEdit ? "Nueva Contraseña" : "Contraseña"} {!isEdit && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={isEdit ? "Dejar en blanco para no modificar" : "Mínimo 6 caracteres"}
                    className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 pr-10 ${
                      fieldErrors.password ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.password}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-foreground text-xs font-semibold">
                  Repetir Contraseña {!isEdit && <span className="text-red-500">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder={isEdit ? "Repetir nueva contraseña" : "Repetir contraseña"}
                    className={`bg-muted/40 text-foreground text-xs sm:text-sm h-10 focus-visible:ring-emerald-500 pr-10 ${
                      fieldErrors.confirmPassword ? "border-red-500/70 focus-visible:ring-red-500" : "border-border"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none cursor-pointer"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] text-red-500 font-medium">{fieldErrors.confirmPassword}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-10 text-xs font-semibold cursor-pointer border-border hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold h-10 cursor-pointer shadow-sm gap-2 text-xs sm:text-sm px-5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validando y guardando...
                </>
              ) : isEdit ? (
                <>
                  <UserCheck className="h-4 w-4" />
                  Guardar Cambios
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Guardar Operador Activo
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Convenience export aliases
export function CreateUserModal(props: Omit<UserModalProps, "mode" | "user">) {
  return <UserModal mode="create" {...props} />;
}

export function EditUserModal(props: Omit<UserModalProps, "mode">) {
  return <UserModal mode="edit" {...props} />;
}
