export type InAppNotificationType =
  | "NUEVA_LIQUIDACION"
  | "RECTIFICACION"
  | "EN_PROCESO"
  | "DISTRIBUCION_COMPLETA";

export type InAppNotificationAudience = "HOSPITAL" | "UEP";

export interface InAppNotificationItem {
  id: string;
  liquidationId: number;
  audience: InAppNotificationAudience;
  type: InAppNotificationType;
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
  createdAt: string;
  status: string;
}
