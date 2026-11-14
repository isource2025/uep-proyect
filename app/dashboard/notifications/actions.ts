"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanCuit } from "@/lib/hospital-mapping";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { isUserAdmin, parseUserRoleIds } from "@/lib/constants";
import type { InAppNotificationItem } from "@/lib/notification-types";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatPeriodLabel(mesCarga?: string | null, period?: { mes: number; anio: number } | null): string {
  if (mesCarga && mesCarga.trim()) return mesCarga.trim();
  if (period) {
    const monthName = MONTH_NAMES[period.mes - 1] || `Mes ${period.mes}`;
    return `${monthName} ${period.anio}`;
  }
  return "Sin período";
}

function summarizeHospitalNames(details: { prestadorNombre: string | null; hospital: { nombre: string | null } | null }[]): string | undefined {
  const uniqueNames = Array.from(
    new Set(
      details
        .map((d) => (d.prestadorNombre || d.hospital?.nombre || "").trim())
        .filter(Boolean)
    )
  );
  if (uniqueNames.length === 0) return undefined;
  if (uniqueNames.length === 1) return uniqueNames[0];
  return `${uniqueNames[0]} y ${uniqueNames.length - 1} efector(es) más`;
}

/**
 * Obtiene las notificaciones in-app derivadas en tiempo real desde Liquidacion (sin tablas extra en BD).
 * - Hospitales: liquidaciones notificadas/rectificadas/en proceso con renglones de su CUIT.
 * - UEP (Admin/Liquidador): liquidaciones en estado DISTRIBUIDA (todos los hospitales completaron su carga).
 */
export async function fetchInAppNotificationsAction(): Promise<InAppNotificationItem[]> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return [];

    const user = session.user as any;
    const userId = parseInt(String(user.id), 10);
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

      const matchingProveedores = await prisma.proveedor.findMany({
        where: { cuit: Number(hospitalCuit) },
        select: { id: true },
      });
      const proveedorIds = matchingProveedores.map((p) => p.id);

      const liquidations = await prisma.liquidacion.findMany({
        where: {
          status: {
            in: ["NOTIFICADO", "RECTIFICADA", "RECTIFICADA_PENDIENTE", "EN PROCESO", "EN_PROCESO"],
          },
          details: {
            some: {
              OR: [
                { cuit: hospitalCuit },
                ...(proveedorIds.length > 0
                  ? [
                      { hospitalId: { in: proveedorIds } },
                      { compra: { hospitalId: { in: proveedorIds } } },
                    ]
                  : []),
              ],
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: {
          id: true,
          status: true,
          mesCarga: true,
          updatedAt: true,
          period: { select: { mes: true, anio: true } },
          rc: {
            select: {
              cliente: { select: { nombre: true } },
            },
          },
        },
      });

      return liquidations.map((liq) => {
        const liqCode = `LIQ-${String(liq.id).padStart(4, "0")}`;
        const obraSocial = liq.rc?.cliente?.nombre?.trim() || "Obra Social";
        const periodLabel = formatPeriodLabel(liq.mesCarga, liq.period);
        const normalizedStatus = (liq.status || "").toUpperCase();

        const type = normalizedStatus.startsWith("RECTIFICAD")
          ? "RECTIFICACION"
          : normalizedStatus === "EN PROCESO" || normalizedStatus === "EN_PROCESO"
          ? "EN_PROCESO"
          : "NUEVA_LIQUIDACION";

        const title =
          type === "RECTIFICACION"
            ? "Liquidación rectificada"
            : type === "EN_PROCESO"
            ? "Liquidación en proceso"
            : "Nueva liquidación disponible";

        return {
          id: `hosp-${liq.id}-${normalizedStatus}-${liq.updatedAt.getTime()}`,
          liquidationId: liq.id,
          audience: "HOSPITAL",
          type,
          title,
          subtitle: `${liqCode} · ${obraSocial} (${periodLabel})`,
          meta:
            type === "RECTIFICACION"
              ? "Revisar montos actualizados y revalidar distribución"
              : "Disponible para cargar distribución de personal",
          href: `/dashboard/hospital-portal?highlight=${liq.id}`,
          createdAt: liq.updatedAt.toISOString(),
          status: liq.status,
        };
      });
    }

    // Lado UEP (Admin o Liquidador): avisar únicamente cuando todos los hospitales completaron la distribución
    const isUepOperator = isAdmin || userRoles.includes("3") || userRoles.includes("5");
    if (!isUepOperator) return [];

    const distributedLiquidations = await prisma.liquidacion.findMany({
      where: {
        status: { in: ["DISTRIBUIDA", "DISTRIBUIDO"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        mesCarga: true,
        updatedAt: true,
        period: { select: { mes: true, anio: true } },
        rc: {
          select: {
            cliente: { select: { nombre: true } },
          },
        },
        details: {
          select: {
            prestadorNombre: true,
            hospital: { select: { nombre: true } },
          },
        },
      },
    });

    return distributedLiquidations.map((liq) => {
      const liqCode = `LIQ-${String(liq.id).padStart(4, "0")}`;
      const obraSocial = liq.rc?.cliente?.nombre?.trim() || "Obra Social";
      const periodLabel = formatPeriodLabel(liq.mesCarga, liq.period);
      const hospitalsMeta = summarizeHospitalNames(liq.details);

      return {
        id: `uep-${liq.id}-${liq.status}-${liq.updatedAt.getTime()}`,
        liquidationId: liq.id,
        audience: "UEP",
        type: "DISTRIBUCION_COMPLETA",
        title: "Distribución completada",
        subtitle: `${liqCode} · ${obraSocial} (${periodLabel})`,
        meta: hospitalsMeta ? `Todos los efectores completaron: ${hospitalsMeta}` : "Todos los hospitales finalizaron su carga",
        href: `/dashboard/liquidations?highlight=${liq.id}`,
        createdAt: liq.updatedAt.toISOString(),
        status: liq.status,
      };
    });
  } catch (e) {
    console.error("Error fetching in-app notifications:", e);
    return [];
  }
}
