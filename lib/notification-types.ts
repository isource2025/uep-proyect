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
  read: boolean;
  emisorNombre?: string | null;
  emailEnviado?: boolean;
}

export interface NotificationReadReceiptItem {
  id: string;
  userId: number;
  userName: string;
  userEmail?: string | null;
  leidaAt: string;
}

export interface LiquidationNotificationHistoryItem {
  id: string;
  liquidationId: number;
  tipo: string;
  audiencia: string;
  targetCuit?: string | null;
  targetHospitalName?: string | null;
  titulo: string;
  mensaje: string;
  emisorNombre?: string | null;
  emailEnviado: boolean;
  emailDestinatarios: string[];
  emailError?: string | null;
  createdAt: string;
  lecturas: NotificationReadReceiptItem[];
}
