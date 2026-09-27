/**
 * Configuración centralizada de Roles de Usuario en UEP.
 * Permite agregar nuevos roles, modificar descripciones, estilos visuales y permisos.
 */

export interface UserRoleConfig {
  id: string;
  name: string;
  shortCode: string;
  description: string;
  badgeClasses: string;
  isAdmin?: boolean;
  isHospital?: boolean;
  isMedico?: boolean;
}

export const USER_ROLES: Record<string, UserRoleConfig> = {
  "1": {
    id: "1",
    name: "Administrador General",
    shortCode: "ADMIN",
    description: "Acceso total a todos los módulos, gestión de operadores, liquidaciones y consolidaciones.",
    badgeClasses: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
    isAdmin: true,
  },
  "2": {
    id: "2",
    name: "Médico / Personal MSP",
    shortCode: "MEDICO",
    description: "Profesional de la salud registrado para percepción de honorarios o sobreasignaciones.",
    badgeClasses: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
    isMedico: true,
  },
  "3": {
    id: "3",
    name: "Operador UEP / Liquidador",
    shortCode: "OPERADOR",
    description: "Operador de la Unidad Ejecutora Provincial. Genera liquidaciones y administra débitos.",
    badgeClasses: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  },
  "4": {
    id: "4",
    name: "Hospital / CAPS",
    shortCode: "HOSPITAL",
    description: "Director o administrador de efector sanitario. Realiza distribución de fondos asignados.",
    badgeClasses: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25",
    isHospital: true,
  },
  "5": {
    id: "5",
    name: "Auditor / Consulta",
    shortCode: "AUDITOR",
    description: "Perfil de solo lectura para auditoría y visualización de reportes consolidados.",
    badgeClasses: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
  },
};

/**
 * Convierte un string de roles separados por coma (ej. "1,4") en un array de IDs limpios.
 */
export function parseUserRoleIds(rolesStr?: string | null): string[] {
  if (!rolesStr) return [];
  return String(rolesStr)
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Obtiene la configuración de un rol por su ID numérico o string.
 */
export function getUserRoleConfig(roleId: string | number): UserRoleConfig {
  const idStr = String(roleId).trim();
  return (
    USER_ROLES[idStr] || {
      id: idStr,
      name: `Rol #${idStr}`,
      shortCode: `ROL-${idStr}`,
      description: "Rol configurable del sistema",
      badgeClasses: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/25",
    }
  );
}

/**
 * Obtiene las clases Tailwind para el badge de un rol.
 */
export function getUserRoleBadge(roleId: string | number): string {
  return getUserRoleConfig(roleId).badgeClasses;
}

/**
 * Determina si el usuario tiene privilegios de Administrador.
 */
export function isUserAdmin(rolesStr?: string | null): boolean {
  const roleIds = parseUserRoleIds(rolesStr);
  return roleIds.some((id) => USER_ROLES[id]?.isAdmin);
}

/**
 * Determina si el usuario pertenece al Portal de Hospital.
 */
export function isUserHospital(rolesStr?: string | null, hospitalId?: number | null): boolean {
  if (hospitalId && hospitalId > 0) return true;
  const roleIds = parseUserRoleIds(rolesStr);
  return roleIds.some((id) => USER_ROLES[id]?.isHospital);
}
