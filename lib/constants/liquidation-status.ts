/**
 * Configuración centralizada de Estados de Liquidación en UEP.
 * Permite agregar nuevos estados, modificar descripciones, colores y orden de flujo.
 */

export interface LiquidationStatusConfig {
  key: string;
  label: string;
  description: string;
  badgeClasses: string;
  stepOrder: number;
  isCompleted?: boolean;
}

export const LIQUIDATION_STATUSES: Record<string, LiquidationStatusConfig> = {
  PENDIENTE: {
    key: "PENDIENTE",
    label: "Pendiente",
    description: "Liquidación generada a partir de los comprobantes. Lista para revisión inicial.",
    badgeClasses: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    stepOrder: 1,
  },
  NOTIFICADO: {
    key: "NOTIFICADO",
    label: "Notificado",
    description: "Establecimientos sanitarios y hospitales notificados para iniciar su distribución de fondos.",
    badgeClasses: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
    stepOrder: 2,
  },
  "EN PROCESO": {
    key: "EN PROCESO",
    label: "En Proceso",
    description: "Distribución de fondos y nómina de agentes en curso por parte del hospital o liquidador.",
    badgeClasses: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25",
    stepOrder: 3,
  },
  DISTRIBUIDA: {
    key: "DISTRIBUIDA",
    label: "Distribuida",
    description: "Fondos 100% distribuidos entre honorarios, sobreasignaciones y gastos por los efectores.",
    badgeClasses: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25",
    stepOrder: 4,
  },
  RECTIFICADA: {
    key: "RECTIFICADA",
    label: "Rectificada",
    description: "Liquidación modificada con posterioridad a la notificación. Notificación rectificatoria enviada a los efectores.",
    badgeClasses: "bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    stepOrder: 4.5,
  },
  CERRADA: {
    key: "CERRADA",
    label: "Cerrada",
    description: "Liquidación consolidada y cerrada para exportación definitiva a SISPER y Tesorería.",
    badgeClasses: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    stepOrder: 5,
    isCompleted: true,
  },
};

export type LiquidationStatusKey = keyof typeof LIQUIDATION_STATUSES;

/**
 * Obtiene la configuración visual y descriptiva de un estado de liquidación.
 * Maneja automáticamente variaciones como "EN_PROCESO", "DISTRIBUIDO" y "RECTIFICADO".
 */
export function getLiquidationStatusConfig(status?: string | null): LiquidationStatusConfig {
  if (!status) return LIQUIDATION_STATUSES.PENDIENTE;
  
  let normalized = status.trim().toUpperCase().replace(/_/g, " ");
  if (normalized === "DISTRIBUIDO") {
    normalized = "DISTRIBUIDA";
  } else if (normalized === "RECTIFICADO") {
    normalized = "RECTIFICADA";
  }

  return (
    LIQUIDATION_STATUSES[normalized] || {
      key: status,
      label: status,
      description: "Estado personalizado",
      badgeClasses: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/25",
      stepOrder: 99,
    }
  );
}

/**
 * Devuelve únicamente las clases Tailwind para renderizar el badge del estado.
 */
export function getLiquidationStatusBadge(status?: string | null): string {
  return getLiquidationStatusConfig(status).badgeClasses;
}
