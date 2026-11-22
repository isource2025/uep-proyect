"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanCuit } from "@/lib/hospital-mapping";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { isUserAdmin, isUserHospital, parseUserRoleIds } from "@/lib/constants";
import type {
  InAppNotificationItem,
  InAppNotificationType,
  LiquidationNotificationHistoryItem,
} from "@/lib/notification-types";

function mapDbNotificationType(rawTipo: string): InAppNotificationType {
  const t = (rawTipo || "").toUpperCase();
  if (t === "RECTIFICACION") return "RECTIFICACION";
  if (t === "DISTRIBUCION_COMPLETA") return "DISTRIBUCION_COMPLETA";
  if (t === "EN_PROCESO") return "EN_PROCESO";
  return "NUEVA_LIQUIDACION";
}

function splitMessageSubtitleAndMeta(mensaje: string): { subtitle: string; meta?: string } {
  const clean = (mensaje || "").trim();
  const sepIndex = clean.indexOf(" — ");
  if (sepIndex !== -1) {
    return {
      subtitle: clean.slice(0, sepIndex).trim(),
      meta: clean.slice(sepIndex + 3).trim() || undefined,
    };
  }
  return { subtitle: clean };
}

/**
 * Obtiene las notificaciones in-app persistidas en SQL Server (`Notificacion` + `NotificacionLectura`)
 * filtradas estrictamente según audiencia/CUIT del usuario autenticado.
 */
export async function fetchInAppNotificationsAction(): Promise<InAppNotificationItem[]> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return [];

    const user = session.user as any;
    const userId = parseInt(String(user.id), 10);
    if (isNaN(userId)) return [];

    const rawRoleStr = String(user.role || "");
    const userRoles = parseUserRoleIds(rawRoleStr);
    const isAdmin = isUserAdmin(rawRoleStr);

    const resolvedEmpresaId = await resolveUserEmpresaId({
      id: userId,
      hospitalId: user.hospitalId,
      cuit: user.cuit,
    });

    const isHospitalScope =
      !isAdmin &&
      (userRoles.includes("4") || (resolvedEmpresaId !== undefined && resolvedEmpresaId > 0));

    if (isHospitalScope) {
      if (!resolvedEmpresaId) return [];

      const empresa = await prisma.empresa.findUnique({
        where: { id: resolvedEmpresaId },
        select: { id: true, cuit: true },
      });

      const hospitalCuit = cleanCuit(empresa?.cuit);
      if (!hospitalCuit) return [];

      const rows = await prisma.notificacion.findMany({
        where: {
          audiencia: "HOSPITAL",
          targetCuit: hospitalCuit,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          liquidation: { select: { status: true } },
          lecturas: {
            where: { userId },
            select: { id: true, leidaAt: true },
          },
        },
      });

      return rows.map((n) => {
        const { subtitle, meta } = splitMessageSubtitleAndMeta(n.mensaje);
        return {
          id: n.id,
          liquidationId: n.liquidationId,
          audience: "HOSPITAL",
          type: mapDbNotificationType(n.tipo),
          title: n.titulo,
          subtitle,
          meta,
          href: n.href,
          createdAt: n.createdAt.toISOString(),
          status: n.liquidation?.status || "NOTIFICADO",
          read: n.lecturas.length > 0,
          emisorNombre: n.emisorNombre,
          emailEnviado: n.emailEnviado,
        };
      });
    }

    // Lado UEP (Admin, Liquidador o Auditor / Contable)
    const isUepOperator = isAdmin || userRoles.includes("3") || userRoles.includes("2");
    if (!isUepOperator) return [];

    const rows = await prisma.notificacion.findMany({
      where: {
        audiencia: "UEP",
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        liquidation: { select: { status: true } },
        lecturas: {
          where: { userId },
          select: { id: true, leidaAt: true },
        },
      },
    });

    return rows.map((n) => {
      const { subtitle, meta } = splitMessageSubtitleAndMeta(n.mensaje);
      return {
        id: n.id,
        liquidationId: n.liquidationId,
        audience: "UEP",
        type: mapDbNotificationType(n.tipo),
        title: n.titulo,
        subtitle,
        meta,
        href: n.href,
        createdAt: n.createdAt.toISOString(),
        status: n.liquidation?.status || "DISTRIBUIDA",
        read: n.lecturas.length > 0,
        emisorNombre: n.emisorNombre,
        emailEnviado: n.emailEnviado,
      };
    });
  } catch (e) {
    console.error("Error fetching in-app notifications from DB:", e);
    return [];
  }
}

/**
 * Registra la lectura individual de una notificación para el usuario autenticado.
 */
export async function markNotificationAsReadAction(notificacionId: string): Promise<{ success: boolean }> {
  try {
    if (!notificacionId) return { success: false };
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false };

    const userId = parseInt(String((session.user as any).id), 10);
    if (isNaN(userId)) return { success: false };

    await prisma.notificacionLectura.upsert({
      where: {
        notificacionId_userId: {
          notificacionId,
          userId,
        },
      },
      update: {},
      create: {
        notificacionId,
        userId,
      },
    });

    return { success: true };
  } catch (e) {
    console.error("Error marking notification as read:", e);
    return { success: false };
  }
}

/**
 * Marca múltiples notificaciones como leídas en bloque dentro de una transacción atómica.
 */
export async function markAllNotificationsAsReadAction(notificacionIds: string[]): Promise<{ success: boolean }> {
  try {
    const cleanIds = Array.from(new Set((notificacionIds || []).filter((id) => typeof id === "string" && id.trim())));
    if (cleanIds.length === 0) return { success: true };

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false };

    const userId = parseInt(String((session.user as any).id), 10);
    if (isNaN(userId)) return { success: false };

    await prisma.$transaction(async (tx) => {
      const existing = await tx.notificacionLectura.findMany({
        where: {
          userId,
          notificacionId: { in: cleanIds },
        },
        select: { notificacionId: true },
      });

      const existingSet = new Set(existing.map((e) => e.notificacionId));
      const pendingIds = cleanIds.filter((id) => !existingSet.has(id));

      for (const notificacionId of pendingIds) {
        await tx.notificacionLectura.create({
          data: {
            notificacionId,
            userId,
          },
        });
      }
    });

    return { success: true };
  } catch (e) {
    console.error("Error marking all notifications as read:", e);
    return { success: false };
  }
}

/**
 * Obtiene el historial y auditoría completa de notificaciones (emisión, casillas y lecturas)
 * de una liquidación específica. Exclusivo para operadores UEP (no hospitales).
 */
export async function fetchLiquidationNotificationHistoryAction(
  liquidationId: number
): Promise<{
  success?: boolean;
  history?: LiquidationNotificationHistoryItem[];
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado." };
    }

    const user = session.user as any;
    const userId = parseInt(String(user.id), 10);
    const rawRoleStr = String(user.role || "");
    const userRoles = parseUserRoleIds(rawRoleStr);
    const isAdmin = isUserAdmin(rawRoleStr);
    const resolvedEmpresaId = await resolveUserEmpresaId({
      id: isNaN(userId) ? 0 : userId,
      hospitalId: user.hospitalId,
      cuit: user.cuit,
    });
    const isHospitalUser = !isAdmin && isUserHospital(rawRoleStr, resolvedEmpresaId ?? user?.hospitalId);

    if (isHospitalUser) {
      return { error: "Acceso denegado." };
    }

    const isUepOperator = isAdmin || userRoles.includes("3") || userRoles.includes("2");
    if (!isUepOperator) {
      return { error: "Sin permisos para consultar auditoría de notificaciones." };
    }

    const rawNotifs = await prisma.notificacion.findMany({
      where: { liquidationId },
      orderBy: { createdAt: "desc" },
      include: {
        lecturas: {
          orderBy: { leidaAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    // Resolver nombre del establecimiento sanitario por CUIT normalizado
    const targetCuits = Array.from(
      new Set(
        rawNotifs
          .filter((n) => n.audiencia !== "UEP" && n.targetCuit)
          .map((n) => cleanCuit(n.targetCuit))
          .filter(Boolean)
      )
    );

    const cuitToHospitalName = new Map<string, string>();
    if (targetCuits.length > 0) {
      const numericCuits = targetCuits
        .map((c) => Number(c))
        .filter((n) => Number.isFinite(n) && n > 0);

      const [detalles, empresas, proveedores] = await Promise.all([
        prisma.liquidacionDetalle.findMany({
          where: { liquidationId },
          select: {
            cuit: true,
            prestadorNombre: true,
            hospital: { select: { nombre: true, cuit: true } },
          },
        }),
        numericCuits.length > 0
          ? prisma.empresa.findMany({
              where: { cuit: { in: numericCuits } },
              select: { descripcion: true, cuit: true },
            })
          : Promise.resolve([]),
        numericCuits.length > 0
          ? prisma.proveedor.findMany({
              where: { cuit: { in: numericCuits } },
              select: { nombre: true, cuit: true },
            })
          : Promise.resolve([]),
      ]);

      for (const p of proveedores) {
        const c = cleanCuit(p.cuit);
        const name = p.nombre?.trim();
        if (c && name && !cuitToHospitalName.has(c)) {
          cuitToHospitalName.set(c, name);
        }
      }
      for (const d of detalles) {
        const c = cleanCuit(d.cuit || d.hospital?.cuit);
        const name = d.prestadorNombre?.trim() || d.hospital?.nombre?.trim();
        if (c && name) {
          cuitToHospitalName.set(c, name);
        }
      }
      for (const emp of empresas) {
        const c = cleanCuit(emp.cuit);
        const name = emp.descripcion?.trim();
        if (c && name) {
          cuitToHospitalName.set(c, name);
        }
      }
    }

    const history: LiquidationNotificationHistoryItem[] = rawNotifs.map((n) => {
      let emailDestinatarios: string[] = [];
      if (n.emailDestinatarios) {
        try {
          const parsed = JSON.parse(n.emailDestinatarios);
          if (Array.isArray(parsed)) {
            emailDestinatarios = parsed.filter((x) => typeof x === "string");
          }
        } catch {
          emailDestinatarios = [n.emailDestinatarios];
        }
      }
      const normalizedCuit = cleanCuit(n.targetCuit);
      const targetHospitalName =
        n.audiencia !== "UEP" && normalizedCuit
          ? cuitToHospitalName.get(normalizedCuit) || null
          : null;

      return {
        id: n.id,
        liquidationId: n.liquidationId,
        tipo: n.tipo,
        audiencia: n.audiencia,
        targetCuit: n.targetCuit,
        targetHospitalName,
        titulo: n.titulo,
        mensaje: n.mensaje,
        emisorNombre: n.emisorNombre,
        emailEnviado: n.emailEnviado,
        emailDestinatarios,
        emailError: n.emailError,
        createdAt: n.createdAt.toISOString(),
        lecturas: n.lecturas.map((l) => ({
          id: l.id,
          userId: l.userId,
          userName: l.user?.name || `Usuario #${l.userId}`,
          userEmail: l.user?.email || null,
          leidaAt: l.leidaAt.toISOString(),
        })),
      };
    });

    return { success: true, history };
  } catch (e: any) {
    console.error("Error fetching liquidation notification history:", e);
    return { error: e?.message || "Error al consultar la auditoría de notificaciones." };
  }
}
