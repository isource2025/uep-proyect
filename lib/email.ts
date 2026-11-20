import nodemailer, { type Transporter } from "nodemailer";
import { getAppUrl } from "@/lib/auth-config";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface LiquidationNotificationEmailParams {
  to: string[];
  liquidationId: number;
  liquidationCode: string;
  obraSocial: string;
  periodLabel: string;
  hospitalName?: string;
  isRectification: boolean;
  subject: string;
  bodyMessage: string;
  portalBaseUrl?: string;
}

export function resolvePortalBaseUrl(explicitBaseUrl?: string): string {
  const envPortal = (process.env.EMAIL_PORTAL_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (envPortal) return envPortal.replace(/\/$/, "");

  const explicit = (explicitBaseUrl || "").trim();
  if (explicit && !explicit.includes("localhost") && !explicit.includes("127.0.0.1")) {
    return explicit.replace(/\/$/, "");
  }

  const appUrl = getAppUrl();
  if (appUrl && !appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    return appUrl.replace(/\/$/, "");
  }

  if (explicit) return explicit.replace(/\/$/, "");
  return appUrl;
}

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = parseInt((process.env.SMTP_PORT || "465").trim(), 10) || 465;
  const secureEnv = (process.env.SMTP_SECURE || "").trim().toLowerCase();
  const secure = secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465;
  const user = (process.env.SMTP_USER || "").trim();
  // Normalizar espacios accidentales si la App Password de Google se pegó con espacios
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  const from =
    (process.env.EMAIL_FROM || "").trim() ||
    (user ? `"Unidad Ejecutora Provincial - UEP" <${user}>` : "");

  return { host, port, secure, user, pass, from };
}

export function isEmailConfigured(): boolean {
  const cfg = getSmtpConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

let cachedTransporter: Transporter | null = null;
let cachedKey = "";

function getTransporter(): Transporter {
  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    throw new Error(
      "Servicio de correo no configurado (faltan SMTP_USER / SMTP_PASS en variables de entorno)."
    );
  }

  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${cfg.pass.length}`;
  if (cachedTransporter && cachedKey === key) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  cachedKey = key;
  return cachedTransporter;
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo verificar la conexión SMTP." };
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return { success: false, error: "Sin destinatarios válidos." };
  }

  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    return {
      success: false,
      error: "Credenciales SMTP no configuradas en el servidor (SMTP_USER / SMTP_PASS).",
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from: cfg.from,
        to: recipients.join(", "),
        replyTo: input.replyTo || cfg.user,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      lastError = err?.message || "Error al enviar correo electrónico.";
      // Resetear transporte ante fallo de conexión para reintento limpio
      cachedTransporter = null;
      cachedKey = "";
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  return { success: false, error: lastError };
}

/**
 * Construye el HTML institucional responsivo para avisos de liquidaciones a hospitales
 * (sin incluir montos sensibles, respetando la política vigente del sistema UEP).
 */
export function buildLiquidationNotificationEmailHtml(
  params: Omit<LiquidationNotificationEmailParams, "to" | "subject">
): string {
  const baseUrl = resolvePortalBaseUrl(params.portalBaseUrl);
  const portalUrl = `${baseUrl}/dashboard/hospital-portal?highlight=${params.liquidationId}`;
  const accentColor = params.isRectification ? "#d97706" : "#059669";
  const accentBg = params.isRectification ? "#fef3c7" : "#d1fae5";
  const accentText = params.isRectification ? "#92400e" : "#065f46";
  const badgeLabel = params.isRectification
    ? "RECTIFICACIÓN DE LIQUIDACIÓN"
    : "NUEVA LIQUIDACIÓN DISPONIBLE";

  const formattedBody = escapeHtml(params.bodyMessage)
    .replace(/\r?\n/g, "<br />");

  const hospitalRow = params.hospitalName
    ? `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#64748b;width:150px;vertical-align:top;">Establecimiento:</td>
        <td style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;vertical-align:top;">${escapeHtml(params.hospitalName)}</td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(badgeLabel)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
            <!-- Cabecera institucional -->
            <tr>
              <td style="background-color:#0f172a;padding:22px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#34d399;font-weight:700;">
                        Ministerio de Salud Pública
                      </div>
                      <div style="font-size:19px;font-weight:800;color:#ffffff;margin-top:4px;">
                        Unidad Ejecutora Provincial (UEP)
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Contenido principal -->
            <tr>
              <td style="padding:24px;">
                <div style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${accentBg};color:${accentText};font-size:11px;font-weight:700;letter-spacing:0.6px;margin-bottom:16px;">
                  ${escapeHtml(badgeLabel)}
                </div>

                <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">
                  ${formattedBody}
                </p>

                <!-- Tarjeta resumen sin montos -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:22px;">
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#64748b;width:150px;vertical-align:top;">Liquidación N°:</td>
                    <td style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;font-family:monospace;vertical-align:top;">${escapeHtml(params.liquidationCode)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#64748b;width:150px;vertical-align:top;">Obra Social:</td>
                    <td style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;vertical-align:top;">${escapeHtml(params.obraSocial)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:13px;color:#64748b;width:150px;vertical-align:top;">Período:</td>
                    <td style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;vertical-align:top;">${escapeHtml(params.periodLabel)}</td>
                  </tr>
                  ${hospitalRow}
                </table>

                <!-- Botón CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center" style="padding:4px 0 8px 0;">
                      <a
                        href="${escapeHtml(portalUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        style="display:inline-block;background-color:${accentColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;"
                      >
                        Ingresar al Portal de Hospitales
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:#64748b;text-align:center;word-break:break-all;">
                  Si el botón no funciona, copie y pegue este enlace en su navegador:<br />
                  <a href="${escapeHtml(portalUrl)}" style="color:${accentColor};text-decoration:underline;">${escapeHtml(portalUrl)}</a>
                </p>
              </td>
            </tr>

            <!-- Pie -->
            <tr>
              <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">
                  Mensaje automático generado por el Sistema de Gestión de Liquidaciones · Unidad Ejecutora Provincial (UEP).<br />
                  Por seguridad institucional, los detalles y montos solo se consultan dentro del portal autenticado.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendLiquidationNotificationEmail(
  params: LiquidationNotificationEmailParams
): Promise<SendEmailResult> {
  const baseUrl = resolvePortalBaseUrl(params.portalBaseUrl);
  const portalUrl = `${baseUrl}/dashboard/hospital-portal?highlight=${params.liquidationId}`;
  const html = buildLiquidationNotificationEmailHtml({
    liquidationId: params.liquidationId,
    liquidationCode: params.liquidationCode,
    obraSocial: params.obraSocial,
    periodLabel: params.periodLabel,
    hospitalName: params.hospitalName,
    isRectification: params.isRectification,
    bodyMessage: params.bodyMessage,
    portalBaseUrl: baseUrl,
  });

  const textLines = [
    params.isRectification
      ? "RECTIFICACIÓN DE LIQUIDACIÓN - UNIDAD EJECUTORA PROVINCIAL (UEP)"
      : "NUEVA LIQUIDACIÓN DISPONIBLE - UNIDAD EJECUTORA PROVINCIAL (UEP)",
    "",
    params.bodyMessage,
    "",
    `Liquidación N°: ${params.liquidationCode}`,
    `Obra Social: ${params.obraSocial}`,
    `Período: ${params.periodLabel}`,
    ...(params.hospitalName ? [`Establecimiento: ${params.hospitalName}`] : []),
    "",
    `Ingresar al Portal de Hospitales: ${portalUrl}`,
  ];

  return sendEmail({
    to: params.to,
    subject: params.subject,
    text: textLines.join("\n"),
    html,
  });
}
