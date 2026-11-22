"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getActivePeriodInfo, getActiveSisperPeriodFilter } from "@/lib/periods";
import { cleanCuit } from "@/lib/hospital-mapping";
import { filterLiquidationForHospital } from "@/lib/hospital-liquidation-scope";
import {
  resolveHospitalRecipientsByCuits,
  resolveUserEmpresaId,
  type HospitalNotificationRecipient,
} from "@/lib/hospital-resolver";
import { serializeData } from "@/lib/utils";
import { isUserAdmin, isUserHospital, isUserReadOnlyAuditor, parseUserRoleIds } from "@/lib/constants";
import { generateLiquidationExcelBuffer } from "@/lib/export-liquidation-excel";
import { sendLiquidationNotificationEmail } from "@/lib/email";
import {
  resolveHospitalPurchasesForFcs,
  buildLiquidacionDetailInputFromCompra,
  formatCompraVoucherNumber,
} from "@/lib/erp-compras-resolver";

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeHospitalName(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingDetailHospital(
  pCuil: string,
  cuilEmpresas: { id: number; descripcion: string; cuit: string }[],
  details: any[]
): { hospitalId?: number; hospitalKey?: string; hospitalCuit?: string; hospitalNombre?: string } {
  if (!details || details.length === 0) return {};
  if (!cuilEmpresas || cuilEmpresas.length === 0) return {};

  // Cruce EXCLUSIVO por CUIT normalizado: EMPRESAS.Nro_CUIT (SISPER) === CUIT del renglón (PROVEEDORES.NRO_CUIT)
  for (const emp of cuilEmpresas) {
    const cleanEmpCuit = cleanCuit(emp.cuit);
    if (!cleanEmpCuit) continue;
    for (const d of details) {
      const cleanDetCuit = cleanCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit);
      if (cleanDetCuit && cleanDetCuit === cleanEmpCuit) {
        const hid = d.hospitalId || d.compra?.hospitalId;
        const key = hid ? `id-${hid}` : `cuit-${cleanDetCuit}`;
        return {
          hospitalId: hid,
          hospitalKey: key,
          hospitalCuit: cleanDetCuit,
          hospitalNombre: emp.descripcion?.trim() || d.prestadorNombre?.trim() || d.hospital?.nombre?.trim() || undefined,
        };
      }
    }
  }

  return {};
}

function resolvePersonalDistributionHospital(
  p: { cuil: any; idEmpresa?: number | null },
  empresaById: Map<number, { id: number; descripcion: string; cuit: string }>,
  cuilEmpresas: { id: number; descripcion: string; cuit: string }[],
  details: any[]
): { hospitalId?: number; hospitalKey?: string; hospitalCuit?: string; hospitalNombre?: string } {
  const empId = Number(p.idEmpresa || 0);
  if (empId > 0) {
    const emp = empresaById.get(empId);
    if (emp) {
      const cleanEmpCuit = cleanCuit(emp.cuit);
      if (cleanEmpCuit) {
        for (const d of details || []) {
          const cleanDetCuit = cleanCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit);
          if (cleanDetCuit && cleanDetCuit === cleanEmpCuit) {
            const hid = d.hospitalId || d.compra?.hospitalId;
            const key = hid ? `id-${hid}` : `cuit-${cleanDetCuit}`;
            return {
              hospitalId: hid,
              hospitalKey: key,
              hospitalCuit: cleanDetCuit,
              hospitalNombre: emp.descripcion?.trim() || d.prestadorNombre?.trim() || d.hospital?.nombre?.trim() || undefined,
            };
          }
        }
        return {
          hospitalCuit: cleanEmpCuit,
          hospitalNombre: emp.descripcion?.trim() || undefined,
        };
      }
      return { hospitalNombre: emp.descripcion?.trim() || undefined };
    }
  }

  return findMatchingDetailHospital(String(p.cuil || ""), cuilEmpresas, details || []);
}

function sanitizeCliente(c: any) {
  if (!c) return null;
  return {
    ...c,
    cuit: c.cuit ? toNum(c.cuit).toString() : "",
  };
}

function sanitizeProveedor(p: any) {
  if (!p) return null;
  return {
    ...p,
    cuit: p.cuit ? toNum(p.cuit).toString() : "",
  };
}

function sanitizeCbte(c: any) {
  if (!c) return null;
  return {
    ...c,
    puntoVenta: c.puntoVenta ? String(c.puntoVenta).padStart(4, "0") : "0000",
    numero: c.numero ? Number(c.numero) : 0,
    importe: toNum(c.importe),
    cliente: sanitizeCliente(c.cliente),
    appliedAsRc: c.appliedAsRc ? c.appliedAsRc.map((app: any) => ({
      ...app,
      importe: toNum(app.importe),
      fc: sanitizeCbte(app.fc),
    })) : undefined,
  };
}

function sanitizeCompra(comp: any) {
  if (!comp) return null;
  return {
    ...comp,
    numero: comp.numero ? toNum(comp.numero) : 0,
    importe: toNum(comp.importe),
    hospital: sanitizeProveedor(comp.hospital),
    cliente: sanitizeCliente(comp.cliente),
  };
}

function sanitizarLiquidacionDetalle(d: any) {
  if (!d) return null;

  // Extract locality name from hospital description
  const name = d.prestadorNombre || d.hospital?.nombre;
  let loc = d.localidad || "CAPITAL";
  if (name) {
    const parts = name.split("-");
    if (parts.length > 1) {
      loc = parts[parts.length - 1].trim().toUpperCase();
    }
  }

  // Format FC Hospital string using point of sale (grupoCbte) if compra relation is loaded
  let fcNumStr = d.fcHospital;
  if (d.compra) {
    fcNumStr = formatCompraVoucherNumber(d.compra);
  }

  return {
    ...d,
    totalFacturado: toNum(d.totalFacturado),
    creditos: toNum(d.creditos),
    debitos: toNum(d.debitos),
    ajustesOs: toNum(d.ajustesOs),
    pendientesCobro: toNum(d.pendientesCobro),
    pagosParcialesAnteriores: toNum(d.pagosParcialesAnteriores),
    brutoAPagar: toNum(d.brutoAPagar),
    ga: toNum(d.ga),
    ajusteRecupero: toNum(d.ajusteRecupero),
    netoAPagar: toNum(d.netoAPagar),
    localidad: loc,
    fcHospital: fcNumStr,
    hospital: sanitizeProveedor(d.hospital),
    cliente: sanitizeCliente(d.cliente),
    compra: sanitizeCompra(d.compra),
  };
}

function sanitizeDistribucion(d: any) {
  if (!d) return null;
  return {
    ...d,
    honorarios: toNum(d.honorarios),
    sobreasignaciones: toNum(d.sobreasignaciones),
    gastos: toNum(d.gastos),
  };
}

function sanitizarLiquidacionCabecera(liq: any) {
  if (!liq) return null;
  const details = (liq.details || []).map(sanitizarLiquidacionDetalle);
  const distributions = (liq.distributions || []).map(sanitizeDistribucion);

  // Compute aggregate totals across all hospital rows for UI display
  const totalFacturado = details.reduce((sum: number, d: any) => sum + d.totalFacturado, 0);
  const creditos = details.reduce((sum: number, d: any) => sum + d.creditos, 0);
  const debitos = details.reduce((sum: number, d: any) => sum + d.debitos, 0);
  const ajustesOs = details.reduce((sum: number, d: any) => sum + d.ajustesOs, 0);
  const pendientesCobro = details.reduce((sum: number, d: any) => sum + d.pendientesCobro, 0);
  const pagosParcialesAnteriores = details.reduce((sum: number, d: any) => sum + (d.pagosParcialesAnteriores || 0), 0);
  const brutoAPagar = details.reduce((sum: number, d: any) => sum + d.brutoAPagar, 0);
  const ga = details.reduce((sum: number, d: any) => sum + d.ga, 0);
  const ajusteRecupero = details.reduce((sum: number, d: any) => sum + d.ajusteRecupero, 0);
  const netoAPagar = details.reduce((sum: number, d: any) => sum + d.netoAPagar, 0);

  const personalDistributions = (liq.personalDistributions || []).map((p: any) => ({
    idLiquidacion: p.idLiquidacion,
    idAgente: p.idAgente ? p.idAgente.toString() : (p.cuil ? p.cuil.toString() : ""),
    cuil: p.cuil ? p.cuil.toString() : (p.idAgente ? p.idAgente.toString() : ""),
    idEmpresa: Number(p.idEmpresa || 0),
    honorarios: toNum(p.honorarios),
    sobreasignacion: toNum(p.sobreasignacion),
  }));

  const personalHonorarios = personalDistributions.reduce((sum: number, p: any) => sum + p.honorarios, 0);
  const personalSobreasignacion = personalDistributions.reduce((sum: number, p: any) => sum + p.sobreasignacion, 0);

  const totalHonorarios = personalDistributions.length > 0
    ? personalHonorarios
    : distributions.reduce((sum: number, d: any) => sum + d.honorarios, 0);

  const totalSobreasignaciones = personalDistributions.length > 0
    ? personalSobreasignacion
    : distributions.reduce((sum: number, d: any) => sum + d.sobreasignaciones, 0);

  const totalGastos = Math.max(0, netoAPagar - (totalHonorarios + totalSobreasignaciones));
  const totalDistribuido = totalHonorarios + totalSobreasignaciones + totalGastos;

  const attachments = (liq.attachments || [])
    .filter((a: any) => !a.deletedAt)
    .map((a: any) => ({
      id: a.id,
      liquidationId: a.liquidationId,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      createdAt: a.createdAt,
    }));

  return {
    ...liq,
    rc: sanitizeCbte(liq.rc),
    details,
    distributions,
    personalDistributions,
    attachments,
    totalFacturado,
    creditos,
    debitos,
    ajustesOs,
    pendientesCobro,
    pagosParcialesAnteriores,
    brutoAPagar,
    ga,
    ajusteRecupero,
    netoAPagar,
    totalHonorarios,
    totalSobreasignaciones,
    totalGastos,
    totalDistribuido,
  };
}

// 1. Fetch generated liquidations with nested details and support pagination
export async function fetchLiquidationData(
  page: number = 1,
  limit: number = 10,
  pendingPage: number = 1,
  pendingLimit: number = 5,
  searchQuery?: string,
  pendingSearchQuery?: string
) {
  const skip = (page - 1) * limit;
  const pendingSkip = (pendingPage - 1) * pendingLimit;

  const whereClause: any = {};
  if (searchQuery) {
    const trimmed = searchQuery.trim();
    whereClause.OR = [
      {
        rc: {
          cliente: {
            nombre: {
              contains: trimmed,
            },
          },
        },
      },
      {
        mesCarga: {
          contains: trimmed,
        },
      },
      {
        observaciones: {
          contains: trimmed,
        },
      },
      {
        createdByName: {
          contains: trimmed,
        },
      },
      {
        details: {
          some: {
            OR: [
              { fcHospital: { contains: trimmed } },
              { prestadorNombre: { contains: trimmed } },
              { cuit: { contains: trimmed } },
            ],
          },
        },
      },
    ];

    // Check for pure number or FC string patterns
    const cleanDigits = trimmed.replace(/\D/g, "");
    const cleanNum = cleanDigits ? parseInt(cleanDigits, 10) : NaN;

    if (!isNaN(cleanNum)) {
      // Direct search by Liquidacion ID, RC numero or FC-Venta numero / id
      whereClause.OR.push({ id: cleanNum });
      whereClause.OR.push({
        rc: {
          numero: cleanNum,
        },
      });
      whereClause.OR.push({
        rc: {
          appliedAsRc: {
            some: {
              fc: {
                OR: [
                  { numero: cleanNum },
                  { id: cleanNum },
                ],
              },
            },
          },
        },
      });
    }

    // Check for "PuntoVenta - Numero" pattern (e.g. 0001-00004795, 1-4795, FC-0001-00004795)
    const cleanPtoNro = trimmed.replace(/^[fF][cC][-\s]*/, "");
    if (cleanPtoNro.includes("-")) {
      const parts = cleanPtoNro.split("-");
      if (parts.length >= 2) {
        const pto = parseInt(parts[0], 10);
        const nro = parseInt(parts[1], 10);
        if (!isNaN(pto) && !isNaN(nro)) {
          whereClause.OR.push({
            rc: {
              appliedAsRc: {
                some: {
                  fc: {
                    puntoVenta: pto,
                    numero: nro,
                  },
                },
              },
            },
          });
          whereClause.OR.push({
            rc: {
              puntoVenta: pto,
              numero: nro,
            },
          });
        }
      }
    }
  }

  const pendingWhereClause: any = {
    type: "RC",
    liquidations: { none: {} },
  };

  if (pendingSearchQuery) {
    const trimmed = pendingSearchQuery.trim();
    pendingWhereClause.AND = [
      {
        OR: [
          {
            cliente: {
              nombre: {
                contains: trimmed,
              },
            },
          },
        ],
      },
    ];

    const cleanDigits = trimmed.replace(/\D/g, "");
    const num = cleanDigits ? parseInt(cleanDigits, 10) : NaN;
    if (!isNaN(num)) {
      pendingWhereClause.AND[0].OR.push({
        numero: num,
      });
      pendingWhereClause.AND[0].OR.push({
        appliedAsRc: {
          some: {
            fc: {
              OR: [
                { numero: num },
                { id: num },
              ],
            },
          },
        },
      });
    }

    const cleanPtoNro = trimmed.replace(/^[fF][cC][-\s]*/, "");
    if (cleanPtoNro.includes("-")) {
      const parts = cleanPtoNro.split("-");
      if (parts.length >= 2) {
        const pto = parseInt(parts[0], 10);
        const nro = parseInt(parts[1], 10);
        if (!isNaN(pto) && !isNaN(nro)) {
          pendingWhereClause.AND[0].OR.push({
            appliedAsRc: {
              some: {
                fc: {
                  puntoVenta: pto,
                  numero: nro,
                },
              },
            },
          });
          pendingWhereClause.AND[0].OR.push({
            puntoVenta: pto,
            numero: nro,
          });
        }
      }
    }
  }

  // Load all paginated lists and total counts in parallel to maximize query performance
  const [
    liquidations,
    totalLiquidationsCount,
    pendingRcs,
    totalPendingRcsCount
  ] = await Promise.all([
    prisma.liquidacion.findMany({
      where: whereClause,
      include: {
        period: true,
        rc: {
          include: {
            cliente: true,
            appliedAsRc: {
              include: {
                fc: true,
              },
            },
          },
        },
        details: {
          include: {
            hospital: true,
            cliente: true,
            compra: true,
          },
        },
        distributions: {
          include: {
            agent: true,
          },
        },
        personalDistributions: true,
        attachments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.liquidacion.count({ where: whereClause }),
    prisma.cbte.findMany({
      where: pendingWhereClause,
      include: {
        cliente: true,
        appliedAsRc: {
          include: {
            fc: true,
          },
        },
      },
      orderBy: { fecha: "desc" },
      skip: pendingSkip,
      take: pendingLimit,
    }),
    prisma.cbte.count({
      where: pendingWhereClause,
    }),
  ]);

  // Collect all unique cuils and idEmpresas from all liquidations' personalDistributions
  const allCuils: bigint[] = [];
  const allEmpresaIdsSet = new Set<number>();
  for (const liq of liquidations) {
    for (const p of (liq as any).personalDistributions || []) {
      if (p.cuil) allCuils.push(p.cuil);
      const empId = Number(p.idEmpresa || 0);
      if (empId > 0) allEmpresaIdsSet.add(empId);
    }
  }

  const allEmpresaIds = Array.from(allEmpresaIdsSet);
  const [mspAgents, distEmpresas] = await Promise.all([
    allCuils.length > 0
      ? prisma.imPersonalMsp.findMany({
          where: { cuil: { in: allCuils } },
          include: {
            empresa: {
              select: { id: true, descripcion: true, cuit: true },
            },
          },
        })
      : Promise.resolve([]),
    allEmpresaIds.length > 0
      ? prisma.empresa.findMany({
          where: { id: { in: allEmpresaIds } },
          select: { id: true, descripcion: true, cuit: true },
        })
      : Promise.resolve([]),
  ]);

  const empresaById = new Map<number, { id: number; descripcion: string; cuit: string }>();
  for (const e of distEmpresas) {
    empresaById.set(e.id, {
      id: e.id,
      descripcion: e.descripcion || "",
      cuit: e.cuit ? String(e.cuit) : "",
    });
  }

  const cuilToEmpresas = new Map<string, { id: number; descripcion: string; cuit: string }[]>();
  for (const ag of mspAgents) {
    if (ag.cuil && ag.empresa) {
      const cuilStr = ag.cuil.toString();
      const list = cuilToEmpresas.get(cuilStr) || [];
      list.push({
        id: ag.idEmpresa,
        descripcion: ag.empresa.descripcion || "",
        cuit: ag.empresa.cuit ? String(ag.empresa.cuit) : "",
      });
      cuilToEmpresas.set(cuilStr, list);
    }
  }

  const sanitizedLiquidations = liquidations.map((liq) => {
    const sanitized = sanitizarLiquidacionCabecera(liq);
    if (sanitized && sanitized.personalDistributions) {
      sanitized.personalDistributions = sanitized.personalDistributions.map((p: any) => {
        const empList = cuilToEmpresas.get(String(p.cuil)) || [];
        const match = resolvePersonalDistributionHospital(p, empresaById, empList, sanitized.details || []);
        return {
          ...p,
          hospitalId: match.hospitalId,
          hospitalKey: match.hospitalKey,
          hospitalCuit: match.hospitalCuit,
          hospitalNombre: match.hospitalNombre,
        };
      });
    }
    return sanitized;
  });

  const sanitizedPendingRcs = pendingRcs.map((rc) => ({
    ...sanitizeCbte(rc),
    appliedAsRc: rc.appliedAsRc.map((app) => ({
      ...app,
      importe: toNum(app.importe),
      fc: sanitizeCbte(app.fc),
    })),
  }));

  return serializeData({
    liquidations: sanitizedLiquidations,
    totalLiquidationsCount,
    pendingRcs: sanitizedPendingRcs,
    totalPendingRcsCount,
  });
}

// 2. Generate a new Liquidation header and hospital detail rows from an RC
export async function calculateLiquidation(rcId: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const sessionUser = session?.user as any;
    if (!sessionUser) return { error: "No autorizado. Debe iniciar sesión." };
    if (isUserHospital(sessionUser.role, sessionUser.hospitalId) || isUserReadOnlyAuditor(sessionUser.role)) {
      return { error: "Acceso denegado. Su perfil no tiene permisos para generar liquidaciones." };
    }

    const rc = await prisma.cbte.findUnique({
      where: { id: rcId },
      include: { cliente: true },
    });
    if (!rc) return { error: "Comprobante no encontrado." };

    const activePeriod = await getActivePeriodInfo();

    // Find applied sales invoices (FC / ND)
    const applications = await prisma.cbteAplica.findMany({
      where: { rcId },
      include: { fc: true },
    });

    // Resolve linked hospital purchases via IdTransaccionFacturaVta + fallback/complement via CbtesItems
    const resolved = await resolveHospitalPurchasesForFcs(
      prisma,
      applications.map((a) => ({
        fcId: a.fcId,
        clienteId: a.fc?.clienteId ?? rc.clienteId,
      }))
    );

    const monthStr = `${activePeriod.mes.toString().padStart(2, "0")}/${activePeriod.anio}`;

    const appliedFcNumbers = applications
      .map((a) => (a.fc ? `FC-${String(a.fc.puntoVenta || "0").padStart(4, "0")}-${String(a.fc.numero || a.fc.id).padStart(8, "0")}` : `FC-${a.fcId}`))
      .join(", ");

    const noComprasWarning = resolved.purchases.length === 0
      ? `Sin comprobantes vinculados en el ERP: Las Facturas de Venta aplicadas (${appliedFcNumbers || "N/A"}) no poseen compras de hospitales asociadas (ni en IdTransaccionFacturaVta ni en CbtesItems). Renglones generados vacíos.`
      : "";

    const liquidation = await prisma.$transaction(
      async (tx) => {
        // Create Liquidation Header record (createdByName is null until the liquidador loads and saves values)
        const createdLiq = await tx.liquidacion.create({
          data: {
            periodAnio: activePeriod.anio,
            periodMes: activePeriod.mes,
            rcId,
            mesCarga: monthStr,
            createdByName: null,
            observaciones: noComprasWarning,
            status: "PENDIENTE",
          },
        });

        for (const comp of resolved.purchases) {
          const detailData = buildLiquidacionDetailInputFromCompra(comp, {
            liquidationId: createdLiq.id,
            defaultMonthStr: monthStr,
            fallbackClienteId: rc.clienteId,
            fallbackClienteCuit: rc.cliente?.cuit,
          });
          await tx.liquidacionDetalle.create({ data: detailData });
        }

        return createdLiq;
      },
      { maxWait: 10000, timeout: 25000 }
    );

    revalidatePath("/dashboard/liquidations");

    let warning: string | undefined;
    if (resolved.purchases.length === 0) {
      warning = `La Factura de Venta aplicada (${appliedFcNumbers || "N/A"}) no posee compras de hospitales vinculadas en el ERP (ni en IdTransaccionFacturaVta ni en CbtesItems). La liquidación se generó con los renglones vacíos.`;
    } else if (resolved.unmatchedRefs.length > 0) {
      warning = `Se vincularon ${resolved.purchases.length} facturas de compra, pero ${resolved.unmatchedRefs.length} renglón(es) de CbtesItems no pudieron emparejarse automáticamente con Compras.`;
    }

    return {
      success: true,
      liquidationId: liquidation.id,
      warning,
    };
  } catch (e: any) {
    console.error("Error generating liquidation:", e);
    return { error: e.message || "Error al calcular liquidación." };
  }
}

function buildVoucherMatchKey(cuit?: unknown, fcText?: string | null): string {
  const cleanedCuit = cleanCuit(cuit);
  const nums = (String(fcText || "").match(/\d+/g) || []).map((n) => String(parseInt(n, 10)));
  if (!cleanedCuit || nums.length < 2) return "";
  return `${cleanedCuit}|${nums[nums.length - 2]}|${nums[nums.length - 1]}`;
}

// 2b. Sync missing hospital purchase invoices (Compras) from ERP / CbtesItems into an existing Liquidation
export async function syncLiquidationComprasFromErp(liquidationId: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userRole = (session?.user as any)?.role;
    const userHospitalId = (session?.user as any)?.hospitalId;

    if (isUserHospital(userRole, userHospitalId) || isUserReadOnlyAuditor(userRole)) {
      return {
        error: "Acceso denegado. Su perfil no tiene permisos para sincronizar comprobantes del ERP.",
      };
    }

    const isAdmin = isUserAdmin(userRole);

    const currentLiq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      include: {
        rc: {
          include: {
            cliente: true,
            appliedAsRc: {
              include: {
                fc: true,
              },
            },
          },
        },
        details: {
          include: {
            hospital: true,
            compra: true,
          },
        },
      },
    });

    if (!currentLiq) {
      return { error: "Liquidación no encontrada." };
    }

    const isDistributed = currentLiq.status === "DISTRIBUIDA" || currentLiq.status === "DISTRIBUIDO";
    const isClosed = currentLiq.status === "CERRADA" || currentLiq.status === "CERRADO";
    if (isDistributed || isClosed) {
      return {
        error: `No se puede sincronizar una liquidación que ya se encuentra en estado ${currentLiq.status}.`,
      };
    }

    if (currentLiq.status !== "PENDIENTE" && !isAdmin) {
      return {
        error: "Acceso denegado. Esta liquidación ya fue notificada; solo los Administradores Generales pueden sincronizar renglones posteriormente.",
      };
    }

    const applications = currentLiq.rc?.appliedAsRc || [];
    if (applications.length === 0) {
      return {
        error: "El recibo de cobro asociado no posee Facturas de Venta aplicadas en Cbtes_Aplica.",
      };
    }

    const resolved = await resolveHospitalPurchasesForFcs(
      prisma,
      applications.map((a) => ({
        fcId: a.fcId,
        clienteId: a.fc?.clienteId ?? currentLiq.rc?.clienteId,
      }))
    );

    if (resolved.purchases.length === 0) {
      return {
        error: "No se encontraron facturas de compra vinculadas en el ERP (ni por IdTransaccionFacturaVta ni en CbtesItems) para las facturas de venta aplicadas.",
      };
    }

    const existingCompraIds = new Set<number>(
      currentLiq.details
        .map((d) => d.compraId)
        .filter((id): id is number => typeof id === "number" && id > 0)
    );
    const existingDetailKeys = new Set<string>(
      currentLiq.details
        .map((d) => buildVoucherMatchKey(d.cuit || d.hospital?.cuit, d.fcHospital))
        .filter(Boolean)
    );

    const missingPurchases = resolved.purchases.filter((comp) => {
      if (existingCompraIds.has(comp.id)) return false;
      const voucherStr = formatCompraVoucherNumber(comp);
      const vKey = buildVoucherMatchKey(comp.hospital?.cuit, voucherStr);
      if (vKey && existingDetailKeys.has(vKey)) return false;
      return true;
    });

    const fallbackMonthStr =
      currentLiq.mesCarga ||
      `${currentLiq.periodMes.toString().padStart(2, "0")}/${currentLiq.periodAnio}`;

    await prisma.$transaction(
      async (tx) => {
        for (const comp of missingPurchases) {
          const detailData = buildLiquidacionDetailInputFromCompra(comp, {
            liquidationId,
            defaultMonthStr: fallbackMonthStr,
            fallbackClienteId: currentLiq.rc.clienteId,
            fallbackClienteCuit: currentLiq.rc.cliente?.cuit,
          });
          await tx.liquidacionDetalle.create({ data: detailData });
        }

        if (missingPurchases.length > 0) {
          const rawObs = currentLiq.observaciones || "";
          const hasAutoEmptyWarning = rawObs.startsWith("Sin comprobantes vinculados en el ERP:");
          const nextObservaciones = hasAutoEmptyWarning ? "" : undefined;
          const nextStatus = currentLiq.status !== "PENDIENTE" ? "RECTIFICADA_PENDIENTE" : undefined;

          if (nextObservaciones !== undefined || nextStatus !== undefined) {
            await tx.liquidacion.update({
              where: { id: liquidationId },
              data: {
                ...(nextObservaciones !== undefined ? { observaciones: nextObservaciones } : {}),
                ...(nextStatus !== undefined ? { status: nextStatus } : {}),
              },
            });
          }
        }
      },
      { maxWait: 10000, timeout: 25000 }
    );

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);

    const updatedLiquidation = await fetchLiquidationById(liquidationId);

    return {
      success: true,
      addedCount: missingPurchases.length,
      alreadySynced: missingPurchases.length === 0,
      fromCbtesItemsCount: resolved.cbtesItemsCount,
      totalResolvedCount: resolved.purchases.length,
      unmatchedCount: resolved.unmatchedRefs.length,
      liquidation: updatedLiquidation,
    };
  } catch (e: any) {
    console.error("Error syncing liquidation compras from ERP:", e);
    return { error: e.message || "Error al sincronizar comprobantes desde el ERP." };
  }
}

// 3. Batch update operator detail rows for a liquidation
export async function updateLiquidationDetails(
  liquidationId: number,
  details: Array<{
    id: string;
    creditos: number;
    debitos: number;
    ajustesOs: number;
    pendientesCobro: number;
    pagosParcialesAnteriores?: number;
    ga: number;
    ajusteRecupero: number;
    totalFacturado?: number;
    hospitalId?: number | null;
    clienteId?: number | null;
    prestadorNombre?: string;
    cuit?: string;
    localidad?: string;
    fcHospital?: string;
    periodo?: string;
    isNew?: boolean;
  }>,
  status?: string,
  mesCarga?: string,
  observaciones?: string,
  deletedDetailIds?: string[],
  expediente?: string,
  normaLegal?: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const currentUserName = session?.user?.name || session?.user?.email || (session?.user as any)?.operador;
    const userRole = (session?.user as any)?.role;
    const isAdmin = isUserAdmin(userRole);
    if (!session?.user || isUserReadOnlyAuditor(userRole)) {
      return { error: "Acceso denegado. El perfil Auditor / Contable es de solo lectura y no puede modificar liquidaciones." };
    }

    const currentLiq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      select: { status: true, createdByName: true },
    });

    const isDistributed = currentLiq?.status === "DISTRIBUIDA" || currentLiq?.status === "DISTRIBUIDO";
    const isClosed = currentLiq?.status === "CERRADA" || currentLiq?.status === "CERRADO";

    if (isDistributed || isClosed) {
      return {
        error: `No se puede modificar una liquidación que ya se encuentra en estado ${currentLiq?.status}.`,
      };
    }

    if (currentLiq && currentLiq.status !== "PENDIENTE" && !isAdmin) {
      return {
        error: "Acceso denegado. Esta liquidación ya fue notificada. Las modificaciones y rectificaciones posteriores están reservadas exclusivamente para los Administradores Generales.",
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete any detail rows requested for deletion
      if (deletedDetailIds && deletedDetailIds.length > 0) {
        const cleanDeleteIds = deletedDetailIds.filter((id) => !id.startsWith("manual-"));
        if (cleanDeleteIds.length > 0) {
          await tx.liquidacionDetalle.deleteMany({
            where: {
              id: { in: cleanDeleteIds },
              liquidationId,
            },
          });
        }
      }

      // 2. Fetch existing details for this liquidation
      const existingDetails = await tx.liquidacionDetalle.findMany({
        where: { liquidationId },
      });
      const recordsMap = new Map(existingDetails.map((r) => [r.id, r]));

      // 3. Process each detail row (create new or update existing)
      for (const d of details) {
        const isNewRow = d.isNew || d.id.startsWith("manual-") || !recordsMap.has(d.id);
        const record = recordsMap.get(d.id);

        const totalFacturado = Math.max(
          0,
          d.totalFacturado !== undefined ? Number(d.totalFacturado) || 0 : toNum(record?.totalFacturado)
        );
        const creditos = Math.max(0, Number(d.creditos) || 0);
        const debitos = Math.max(0, Number(d.debitos) || 0);
        const ajustesOs = Number(d.ajustesOs) || 0;
        const pendientesCobro = Math.max(0, Number(d.pendientesCobro) || 0);
        const pagosParcialesAnteriores = d.pagosParcialesAnteriores !== undefined
          ? Math.max(0, Number(d.pagosParcialesAnteriores) || 0)
          : Math.max(0, toNum(record?.pagosParcialesAnteriores));
        const ga = Math.max(0, Number(d.ga) || 0);
        const ajusteRecupero = Math.max(0, Number(d.ajusteRecupero) || 0);

        // Control aritmético estricto en servidor:
        // Bruto = Total Facturado + Créditos - Débitos + Ajustes O.S. - Pendientes de Cobro - Pagos Parciales Anteriores
        const brutoAPagar = Math.max(0, totalFacturado + creditos - debitos + ajustesOs - pendientesCobro - pagosParcialesAnteriores);
        // Neto = Bruto - GA - Adelantos (ajusteRecupero)
        const netoAPagar = Math.max(0, brutoAPagar - ga - ajusteRecupero);

        if (isNewRow) {
          await tx.liquidacionDetalle.create({
            data: {
              liquidationId,
              hospitalId: d.hospitalId ? Number(d.hospitalId) : null,
              clienteId: d.clienteId ? Number(d.clienteId) : null,
              prestadorNombre: d.prestadorNombre || "Hospital Prestador",
              cuit: d.cuit ? String(d.cuit).trim() : null,
              localidad: d.localidad || "CAPITAL",
              fcHospital: d.fcHospital || "FC-MANUAL",
              periodo: d.periodo || mesCarga || "N/A",
              totalFacturado,
              creditos,
              debitos,
              ajustesOs,
              pendientesCobro,
              pagosParcialesAnteriores,
              brutoAPagar,
              ga,
              ajusteRecupero,
              netoAPagar,
            },
          });
        } else {
          await tx.liquidacionDetalle.update({
            where: { id: d.id },
            data: {
              ...(d.prestadorNombre ? { prestadorNombre: d.prestadorNombre } : {}),
              ...(d.cuit !== undefined ? { cuit: d.cuit } : {}),
              ...(d.localidad ? { localidad: d.localidad } : {}),
              ...(d.fcHospital ? { fcHospital: d.fcHospital } : {}),
              ...(d.periodo ? { periodo: d.periodo } : {}),
              ...(d.hospitalId !== undefined ? { hospitalId: d.hospitalId ? Number(d.hospitalId) : null } : {}),
              totalFacturado,
              creditos,
              debitos,
              ajustesOs,
              pendientesCobro,
              pagosParcialesAnteriores,
              brutoAPagar,
              ga,
              ajusteRecupero,
              netoAPagar,
            },
          });
        }
      }

      // If it was already notified and modified, mark as RECTIFICADA_PENDIENTE so rectification notification is pending
      const targetStatus =
        status ||
        (currentLiq && currentLiq.status !== "PENDIENTE" ? "RECTIFICADA_PENDIENTE" : undefined);

      await tx.liquidacion.update({
        where: { id: liquidationId },
        data: {
          ...(targetStatus ? { status: targetStatus } : {}),
          ...(mesCarga !== undefined ? { mesCarga } : {}),
          ...(observaciones !== undefined ? { observaciones } : {}),
          ...(expediente !== undefined ? { expediente: expediente?.trim() || null } : {}),
          ...(normaLegal !== undefined ? { normaLegal: normaLegal?.trim() || null } : {}),
          ...(currentUserName && !currentLiq?.createdByName?.trim()
            ? { createdByName: currentUserName }
            : {}),
        },
      });
    });

    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating liquidation details:", e);
    return { error: e.message || "Error al guardar ajustes de liquidación." };
  }
}

export async function updateLiquidationExpediente(
  liquidationId: number,
  expediente: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado. Debe iniciar sesión." };
    }

    const isHospitalUser = !!(session.user as any)?.hospitalId;
    if (isHospitalUser || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { error: "Acceso denegado. Su perfil no tiene permisos para modificar el expediente." };
    }

    await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: {
        expediente: expediente?.trim() || null,
      },
    });

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error updating liquidation expediente:", error);
    return { error: "Error al guardar el número de expediente." };
  }
}

export async function updateLiquidationNormaLegal(
  liquidationId: number,
  normaLegal: string
): Promise<{ success: boolean; normaLegal?: string; snapshotUrl?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "No autorizado. Debe iniciar sesión." };
    }

    const isHospitalUser = !!(session.user as any)?.hospitalId;
    if (isHospitalUser || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { success: false, error: "Acceso denegado. Su perfil no tiene permisos para modificar la norma legal." };
    }

    let formatted = normaLegal?.trim() || "";
    if (formatted) {
      if (/^disp\s*n[°º]?\s*/i.test(formatted)) {
        formatted = formatted.replace(/^disp\s*n[°º]?\s*/i, "Disp N° ");
      } else {
        formatted = `Disp N° ${formatted}`;
      }
    }

    const updated = await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: {
        normaLegal: formatted || null,
      },
    });

    // Si está en estado DISTRIBUIDA, regeneramos el snapshot del reporte en el almacenamiento
    let snapshotUrl: string | undefined = undefined;
    if (updated.status === "DISTRIBUIDA" || updated.status === "DISTRIBUIDO") {
      try {
        const snapshot = await uploadLiquidationSnapshotToCloud(liquidationId, "DISTRIBUIDA");
        if (snapshot) {
          snapshotUrl = snapshot.url;
          await prisma.liquidacion.update({
            where: { id: liquidationId },
            data: {
              reporteDistribuidoUrl: snapshot.url,
              reporteDistribuidoFileName: snapshot.fileName,
            },
          });
        }
      } catch (distSnapErr) {
        console.error("Error actualizando snapshot DISTRIBUIDA con nueva norma legal:", distSnapErr);
      }
    }

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true, normaLegal: formatted, snapshotUrl };
  } catch (error: any) {
    console.error("Error updating liquidation norma legal:", error);
    return { success: false, error: error.message || "Error al guardar el número de norma legal." };
  }
}

export async function updateLiquidationObservaciones(
  liquidationId: number,
  observaciones: string
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado. Debe iniciar sesión." };
    }

    const isHospitalUser = !!(session.user as any)?.hospitalId;
    if (isHospitalUser || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { error: "Acceso denegado. Su perfil no tiene permisos para modificar observaciones." };
    }

    await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: {
        observaciones: observaciones?.trim() || null,
      },
    });

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error updating liquidation observaciones:", error);
    return { error: "Error al guardar las observaciones de la liquidación." };
  }
}

/**
 * Asigna una liquidación libre al operador liquidador o administrador actual de forma atómica.
 * Si ya está asignada a otra persona, rechaza la operación hasta que su titular la desasigne.
 */
export async function assignLiquidationToSelfAction(liquidationId: number): Promise<{
  success?: boolean;
  createdByName?: string;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado. Debe iniciar sesión." };
    }

    const sessionUser = session.user as any;
    const rawRole = String(sessionUser?.role || "");
    const roleIds = parseUserRoleIds(rawRole);
    const isAdmin = isUserAdmin(rawRole);
    const resolvedEmpresaId = await resolveUserEmpresaId({
      id: Number(sessionUser.id),
      hospitalId: sessionUser.hospitalId,
      cuit: sessionUser.cuit,
    });
    const isHospitalUser = !isAdmin && isUserHospital(rawRole, resolvedEmpresaId ?? sessionUser?.hospitalId);
    const isReadOnlyAuditorOnly = isUserReadOnlyAuditor(rawRole);

    if (isHospitalUser || isReadOnlyAuditorOnly) {
      return {
        error: "Acceso denegado. Solo los Liquidadores y Administradores de UEP pueden asignarse liquidaciones.",
      };
    }

    const assigneeName =
      String(sessionUser?.name || "").trim() ||
      String(sessionUser?.email || "").trim() ||
      String(sessionUser?.operador || "").trim();

    if (!assigneeName) {
      return { error: "No se pudo identificar el nombre del operador actual." };
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const currentLiq = await tx.liquidacion.findUnique({
        where: { id: liquidationId },
        select: { id: true, status: true, createdByName: true },
      });

      if (!currentLiq) {
        return { error: "La liquidación seleccionada no existe." };
      }

      const isDistributed = currentLiq.status === "DISTRIBUIDA" || currentLiq.status === "DISTRIBUIDO";
      const isClosed = currentLiq.status === "CERRADA" || currentLiq.status === "CERRADO";
      if (isDistributed || isClosed) {
        return {
          error: `No se puede asignar una liquidación en estado ${currentLiq.status}.`,
        };
      }

      if (currentLiq.status !== "PENDIENTE" && !isAdmin) {
        return {
          error: "Esta liquidación ya fue notificada. Solo un Administrador puede modificar su asignación.",
        };
      }

      const currentOwner = String(currentLiq.createdByName || "").trim();
      if (currentOwner) {
        if (currentOwner.toLowerCase() === assigneeName.toLowerCase()) {
          return { success: true, createdByName: currentOwner };
        }
        return {
          error: `Esta liquidación ya está asignada a ${currentOwner}. Debe desasignarla primero para que quede libre.`,
        };
      }

      // Actualización condicional atómica (evita condición de carrera si dos operadores hacen clic al mismo tiempo)
      const updated = await tx.liquidacion.updateMany({
        where: {
          id: liquidationId,
          OR: [{ createdByName: null }, { createdByName: "" }],
        },
        data: { createdByName: assigneeName },
      });

      if (updated.count === 0) {
        const fresh = await tx.liquidacion.findUnique({
          where: { id: liquidationId },
          select: { createdByName: true },
        });
        const freshOwner = String(fresh?.createdByName || "").trim() || "otro operador";
        return {
          error: `Esta liquidación acaba de ser asignada a ${freshOwner}. Debe desasignarla primero para que quede libre.`,
        };
      }

      return { success: true, createdByName: assigneeName };
    });

    if (txResult.error) {
      return { error: txResult.error };
    }

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true, createdByName: txResult.createdByName };
  } catch (error: any) {
    console.error("Error assigning liquidation to self:", error);
    return { error: error?.message || "Error al asignar la liquidación." };
  }
}

/**
 * Desasigna (libera) una liquidación de forma atómica.
 * Únicamente la persona actualmente asignada puede liberarla para que otro operador pueda tomarla.
 */
export async function unassignLiquidationSelfAction(liquidationId: number): Promise<{
  success?: boolean;
  createdByName?: null;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado. Debe iniciar sesión." };
    }

    const sessionUser = session.user as any;
    const rawRole = String(sessionUser?.role || "");
    const roleIds = parseUserRoleIds(rawRole);
    const isAdmin = isUserAdmin(rawRole);
    const resolvedEmpresaId = await resolveUserEmpresaId({
      id: Number(sessionUser.id),
      hospitalId: sessionUser.hospitalId,
      cuit: sessionUser.cuit,
    });
    const isHospitalUser = !isAdmin && isUserHospital(rawRole, resolvedEmpresaId ?? sessionUser?.hospitalId);
    const isReadOnlyAuditorOnly = isUserReadOnlyAuditor(rawRole);

    if (isHospitalUser || isReadOnlyAuditorOnly) {
      return {
        error: "Acceso denegado. Solo los Liquidadores y Administradores de UEP pueden desasignar liquidaciones.",
      };
    }

    const currentOperatorName =
      String(sessionUser?.name || "").trim() ||
      String(sessionUser?.email || "").trim() ||
      String(sessionUser?.operador || "").trim();

    if (!currentOperatorName) {
      return { error: "No se pudo identificar el nombre del operador actual." };
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const currentLiq = await tx.liquidacion.findUnique({
        where: { id: liquidationId },
        select: { id: true, status: true, createdByName: true },
      });

      if (!currentLiq) {
        return { error: "La liquidación seleccionada no existe." };
      }

      const isDistributed = currentLiq.status === "DISTRIBUIDA" || currentLiq.status === "DISTRIBUIDO";
      const isClosed = currentLiq.status === "CERRADA" || currentLiq.status === "CERRADO";
      if (isDistributed || isClosed) {
        return {
          error: `No se puede desasignar una liquidación en estado ${currentLiq.status}.`,
        };
      }

      if (currentLiq.status !== "PENDIENTE" && !isAdmin) {
        return {
          error: "Esta liquidación ya fue notificada y no puede desasignarse.",
        };
      }

      const currentOwner = String(currentLiq.createdByName || "").trim();
      if (!currentOwner) {
        return { success: true };
      }

      if (currentOwner.toLowerCase() !== currentOperatorName.toLowerCase()) {
        return {
          error: `Solo ${currentOwner} puede desasignar esta liquidación para dejarla libre.`,
        };
      }

      const updated = await tx.liquidacion.updateMany({
        where: {
          id: liquidationId,
          createdByName: currentLiq.createdByName,
        },
        data: { createdByName: null },
      });

      if (updated.count === 0) {
        return { error: "La asignación cambió mientras se procesaba. Actualizá e intentá nuevamente." };
      }

      return { success: true };
    });

    if (txResult.error) {
      return { error: txResult.error };
    }

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true, createdByName: null };
  } catch (error: any) {
    console.error("Error unassigning liquidation:", error);
    return { error: error?.message || "Error al desasignar la liquidación." };
  }
}

// 4. Upload file(s) with debit breakdown sent by Obra Social (PDF, Excel, Images)
export async function uploadDebitsFile(formData: FormData) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { error: "Acceso denegado. El perfil Auditor / Contable no puede adjuntar ni modificar comprobantes." };
    }

    const liquidationIdStr = formData.get("liquidationId") as string;
    const rawFiles = formData.getAll("files");
    const singleFile = formData.get("file") as File | null;
    const files: File[] = [];

    if (rawFiles && rawFiles.length > 0) {
      for (const item of rawFiles) {
        if (item instanceof File && item.size > 0) {
          files.push(item);
        }
      }
    }
    if (files.length === 0 && singleFile instanceof File && singleFile.size > 0) {
      files.push(singleFile);
    }

    if (!liquidationIdStr || files.length === 0) {
      return { error: "Faltan parámetros requeridos para la carga de comprobantes." };
    }

    const liquidationId = parseInt(liquidationIdStr, 10);
    const uploadedResults: { fileName: string; fileUrl: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = `debits-liq-${liquidationId}-${Date.now()}-${i}${path.extname(file.name)}`;
      const storageRes = await uploadToStorage({
        file,
        fileName: file.name,
        customFileName: filename,
      });
      uploadedResults.push({
        fileName: file.name,
        fileUrl: storageRes.url,
      });
    }

    // Atomic transaction for database persistence
    const createdAttachments = await prisma.$transaction(async (tx) => {
      const createdList: any[] = [];
      for (const res of uploadedResults) {
        const item = await tx.adjunto.create({
          data: {
            liquidationId,
            fileName: res.fileName,
            fileUrl: res.fileUrl,
          },
        });
        createdList.push(item);
      }

      return createdList;
    });

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return {
      success: true,
      fileUrl: uploadedResults[uploadedResults.length - 1].fileUrl,
      fileName: uploadedResults[uploadedResults.length - 1].fileName,
      attachments: createdAttachments,
    };
  } catch (e: any) {
    console.error("Error uploading debits file(s):", e);
    return { error: e.message || "Error al guardar el comprobante de débitos." };
  }
}

export async function deleteDebitAttachment(attachmentId: string, liquidationId: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { success: false, error: "Acceso denegado. El perfil Auditor / Contable no puede eliminar comprobantes.", remaining: [] as any[] };
    }

    const attachment = await prisma.adjunto.findUnique({
      where: { id: attachmentId },
    });

    if (attachment?.fileUrl) {
      await deleteFromStorage(attachment.fileUrl).catch((err) =>
        console.warn("Failed to delete file from storage:", err)
      );
    }

    const remainingAttachments = await prisma.$transaction(async (tx) => {
      // Borrado lógico: se preserva el registro y link en la BD asignando deletedAt
      await tx.adjunto.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });

      const remaining = await tx.adjunto.findMany({
        where: { liquidationId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });

      return remaining;
    });

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true, remaining: remainingAttachments };
  } catch (e: any) {
    console.error("Error deleting debit attachment:", e);
    return { success: false, error: e.message || "Error al eliminar el archivo adjunto.", remaining: [] as any[] };
  }
}

export async function deleteDebitsFile(liquidationId: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || isUserReadOnlyAuditor((session.user as any)?.role)) {
      return { success: false, error: "Acceso denegado. El perfil Auditor / Contable no puede eliminar comprobantes.", remaining: [] as any[] };
    }

    const attachments = await prisma.adjunto.findMany({
      where: { liquidationId, deletedAt: null },
    });

    for (const att of attachments) {
      if (att.fileUrl) {
        await deleteFromStorage(att.fileUrl).catch((err) =>
          console.warn("Failed to delete attachment from storage:", err)
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // Borrado lógico masivo: se preservan los registros y links en la BD asignando deletedAt
      await tx.adjunto.updateMany({
        where: { liquidationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    return { success: true, remaining: [] as any[] };
  } catch (e: any) {
    console.error("Error deleting debits files:", e);
    return { success: false, error: e.message || "Error al borrar los comprobantes escaneados.", remaining: [] as any[] };
  }
}

export interface NotifyHospitalOptions {
  recipients?: string[];
  subject?: string;
  message?: string;
}

// Helper to upload Excel snapshot to physical server storage via Cloudflare Tunnel
async function uploadLiquidationSnapshotToCloud(
  liquidationId: number,
  tipo: "PENDIENTE" | "DISTRIBUIDA"
): Promise<{ url: string; fileName: string } | null> {
  try {
    const reportData = await getFullLiquidationExcelReportDataInternal(liquidationId);
    if (!reportData || !reportData.liquidation) return null;

    const { buffer, fileName } = await generateLiquidationExcelBuffer(
      reportData.liquidation,
      reportData.mspAgentsMap || {}
    );

    const cleanClient = (reportData.liquidation.rc?.cliente?.nombre || "ObraSocial")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .slice(0, 20);

    const prefix = tipo === "PENDIENTE" ? "Reporte_Pendiente" : "Reporte_Distribuido";
    const customFileName = `${prefix}_LIQ_${String(liquidationId).padStart(4, "0")}_${cleanClient}_${Date.now()}.xlsx`;

    const storageRes = await uploadToStorage({
      file: buffer,
      fileName,
      customFileName,
    });
    return { url: storageRes.url, fileName };
  } catch (err) {
    console.error(`Error uploading ${tipo} liquidation snapshot:`, err);
    return null;
  }
}

export async function getHospitalNotificationRecipients(liquidationId: number): Promise<{
  recipients?: HospitalNotificationRecipient[];
  missingHospitals?: { nombre: string; cuit: string }[];
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado." };
    }

    const userRole = (session.user as any)?.role;
    const isAdmin = isUserAdmin(userRole);
    const resolvedEmpresaId = await resolveUserEmpresaId(session.user as any);
    if (!isAdmin && isUserHospital(userRole, resolvedEmpresaId)) {
      return { error: "Acceso denegado." };
    }

    const liq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      select: {
        id: true,
        details: {
          select: {
            cuit: true,
            prestadorNombre: true,
            hospitalId: true,
            hospital: { select: { cuit: true, nombre: true } },
          },
        },
      },
    });

    if (!liq) return { error: "Liquidación no encontrada." };

    const hospitalByCuit = new Map<string, string>();
    const hospitalsWithoutCuit: { nombre: string; cuit: string }[] = [];

    for (const d of liq.details) {
      const cuit = cleanCuit(d.cuit) || cleanCuit(d.hospital?.cuit);
      const nombre = d.prestadorNombre?.trim() || d.hospital?.nombre?.trim() || "Establecimiento";
      if (!cuit) {
        if (!hospitalsWithoutCuit.some((h) => h.nombre === nombre)) {
          hospitalsWithoutCuit.push({ nombre, cuit: "" });
        }
        continue;
      }
      if (!hospitalByCuit.has(cuit)) {
        hospitalByCuit.set(cuit, nombre);
      }
    }

    const recipients = await resolveHospitalRecipientsByCuits(Array.from(hospitalByCuit.keys()));
    const coveredCuits = new Set(recipients.map((r) => cleanCuit(r.cuit)).filter(Boolean));

    const missingHospitals: { nombre: string; cuit: string }[] = [];
    for (const [cuit, nombre] of hospitalByCuit.entries()) {
      if (!coveredCuits.has(cuit)) {
        missingHospitals.push({ nombre, cuit });
      }
    }
    missingHospitals.push(...hospitalsWithoutCuit);

    return { recipients, missingHospitals };
  } catch (e: any) {
    console.error("Error resolving hospital notification recipients:", e);
    return { error: e.message || "Error al obtener destinatarios del hospital." };
  }
}

// 5. Notify hospital by updating liquidation status to NOTIFICADO (or RECTIFICADA), persisting Notificacion and sending real SMTP email
export async function notifyHospital(
  liquidationId: number,
  customOptions?: NotifyHospitalOptions
) {
  try {
    const reqHeaders = await headers();
    const forwardedHost = reqHeaders.get("x-forwarded-host") || reqHeaders.get("host") || "";
    const forwardedProto =
      reqHeaders.get("x-forwarded-proto") ||
      (forwardedHost.includes("localhost") || forwardedHost.includes("127.0.0.1") ? "http" : "https");
    const requestOrigin =
      reqHeaders.get("origin") || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : undefined);

    const session = await auth.api.getSession({ headers: reqHeaders });
    const sessionUser = session?.user as any;
    const userRole = sessionUser?.role;
    if (!sessionUser || isUserReadOnlyAuditor(userRole)) {
      return { error: "Acceso denegado. El perfil Auditor / Contable no puede notificar ni modificar liquidaciones." };
    }
    const isAdmin = isUserAdmin(userRole);
    const parsedEmisorId = sessionUser?.id ? parseInt(String(sessionUser.id), 10) : NaN;
    const emisorId = !isNaN(parsedEmisorId) ? parsedEmisorId : null;
    const emisorNombre =
      sessionUser?.name?.trim() || sessionUser?.email?.trim() || "Operador UEP";

    const liq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      include: {
        period: true,
        rc: {
          include: {
            cliente: true,
          },
        },
        details: {
          include: {
            hospital: true,
            compra: true,
          },
        },
      },
    });

    if (!liq) return { error: "Liquidación no encontrada." };

    const isDistributed = liq.status === "DISTRIBUIDA" || liq.status === "DISTRIBUIDO";
    const isClosed = liq.status === "CERRADA" || liq.status === "CERRADO";

    if (isDistributed || isClosed) {
      return {
        error: `No se puede notificar una liquidación que ya se encuentra en estado ${liq.status}.`,
      };
    }

    const wasNotifiedBefore = liq.status !== "PENDIENTE";

    // Si ya fue notificada previamente, solo los administradores pueden rectificar/re-notificar
    if (wasNotifiedBefore && !isAdmin) {
      return {
        error: "Acceso denegado. Solo los Administradores Generales pueden notificar rectificaciones de liquidaciones al hospital.",
      };
    }

    // Once notification is dispatched, status transitions to RECTIFICADA (if it was a rectification) or NOTIFICADO (initial)
    const nextStatus = wasNotifiedBefore ? "RECTIFICADA" : "NOTIFICADO";

    // Subir instantánea histórica a la nube (solo en la primera notificación PENDIENTE o si no existía)
    let reportePendienteUrl: string | undefined = undefined;
    let reportePendienteFileName: string | undefined = undefined;

    if (!wasNotifiedBefore || !liq.reportePendienteUrl) {
      try {
        const snapshot = await uploadLiquidationSnapshotToCloud(liquidationId, "PENDIENTE");
        if (snapshot) {
          reportePendienteUrl = snapshot.url;
          reportePendienteFileName = snapshot.fileName;
        }
      } catch (snapErr) {
        console.error("Error creating PENDIENTE snapshot on notification:", snapErr);
      }
    }

    // Resolve real hospital names & corporate emails from EMPRESAS strictly by CUIT
    const details = liq.details;
    const detailCuits = Array.from(
      new Set(
        details
          .map((d) => cleanCuit(d.cuit) || cleanCuit(d.hospital?.cuit))
          .filter(Boolean)
      )
    );
    const resolvedHospitalRecipients = await resolveHospitalRecipientsByCuits(detailCuits);

    const hospitalEmails = resolvedHospitalRecipients.map((r) => r.email);

    const hospitalNames = details
      .map((d) => d.prestadorNombre?.trim() || d.hospital?.nombre?.trim() || "Hospital Prestador")
      .filter((name, index, self) => self.indexOf(name) === index);

    // Determine final recipients before transitioning status
    const finalRecipients =
      customOptions?.recipients && customOptions.recipients.length > 0
        ? customOptions.recipients
        : hospitalEmails;

    if (finalRecipients.length === 0) {
      return {
        error:
          "No se encontraron correos corporativos registrados en EMPRESAS para los hospitales de esta liquidación. Cárguelos en Gestión de Hospitales o agregue al menos un destinatario manual.",
      };
    }

    const liqCode = `LIQ-${String(liq.id).padStart(4, "0")}`;
    const obraSocialName = (liq.rc?.cliente?.nombre || "Obra Social").trim();
    const MONTH_NAMES = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const periodLabel =
      liq.mesCarga?.trim() ||
      (liq.period ? `${MONTH_NAMES[liq.period.mes - 1] || liq.period.mes} ${liq.period.anio}` : "Sin período");
    const notifTipo = wasNotifiedBefore ? "RECTIFICACION" : "NUEVA_LIQUIDACION";
    const notifTitulo = wasNotifiedBefore ? "Liquidación rectificada" : "Nueva liquidación disponible";
    const notifMeta = wasNotifiedBefore
      ? "Revisar comprobantes actualizados y revalidar distribución"
      : "Disponible para cargar distribución de personal";
    const notifMensaje = `${liqCode} · ${obraSocialName} (${periodLabel}) — ${notifMeta}`;
    const notifHref = `/dashboard/hospital-portal?highlight=${liquidationId}`;

    const emailSubject = customOptions?.subject?.trim() || (
      wasNotifiedBefore
        ? `[RECTIFICACIÓN] Liquidación Rectificada Disponible - Período: ${periodLabel} - ${liqCode}`
        : `Nueva Liquidación Disponible - Período: ${periodLabel} - ${liqCode}`
    );

    const emailBody = customOptions?.message?.trim() || (
      wasNotifiedBefore
        ? `Nos comunicamos de la Unidad Ejecutora Provincial (UEP) para informarle que se ha emitido una RECTIFICACIÓN sobre la liquidación de fondos de Obra Social para su hospital correspondiente al período ${periodLabel}. Por favor, ingrese al Portal de Hospitales (UEP) para consultar los comprobantes actualizados y revalidar su distribución.`
        : `Nos comunicamos de la Unidad Ejecutora Provincial (UEP) para informarle que se ha generado y procesado una nueva liquidación de fondos de Obra Social para su hospital correspondiente al período ${periodLabel}. Por favor, ingrese al Portal de Hospitales (UEP) antes de la fecha límite para realizar la distribución de fondos.`
    );

    // Identificar correos manuales agregados en el modal que no pertenecen a ningún efector resuelto por CUIT
    const finalRecipientsNormalized = Array.from(
      new Set(finalRecipients.map((e) => e.trim()).filter(Boolean))
    );
    const finalRecipientsLowerSet = new Set(finalRecipientsNormalized.map((e) => e.toLowerCase()));
    const knownHospitalEmailLowerSet = new Set(
      resolvedHospitalRecipients.map((r) => r.email.trim().toLowerCase())
    );
    const manualExtraEmails = finalRecipientsNormalized.filter(
      (e) => !knownHospitalEmailLowerSet.has(e.toLowerCase())
    );

    const createdNotifJobs: {
      id: string;
      targetCuit: string | null;
      hospitalName?: string;
      recipients: string[];
    }[] = [];

    // Transacción atómica: actualizar estado + persistir evento(s) en tabla Notificacion
    await prisma.$transaction(async (tx) => {
      await tx.liquidacion.update({
        where: { id: liquidationId },
        data: {
          status: nextStatus,
          ...(!liq.createdByName && emisorNombre ? { createdByName: emisorNombre } : {}),
          ...(reportePendienteUrl ? { reportePendienteUrl, reportePendienteFileName } : {}),
        },
      });

      if (detailCuits.length > 0) {
        for (const targetCuit of detailCuits) {
          const matchingResolved = resolvedHospitalRecipients.filter(
            (r) => cleanCuit(r.cuit) === targetCuit
          );
          const emailsForCuit = matchingResolved
            .map((r) => r.email.trim())
            .filter((e) => finalRecipientsLowerSet.has(e.toLowerCase()));

          const destinatariosCuit = Array.from(
            new Set([
              ...emailsForCuit,
              ...manualExtraEmails,
              ...(emailsForCuit.length === 0 && manualExtraEmails.length === 0 && detailCuits.length === 1
                ? finalRecipientsNormalized
                : []),
            ])
          );

          const detailForCuit = details.find(
            (d) => (cleanCuit(d.cuit) || cleanCuit(d.hospital?.cuit)) === targetCuit
          );
          const hospName =
            matchingResolved[0]?.hospitalName?.trim() ||
            detailForCuit?.prestadorNombre?.trim() ||
            detailForCuit?.hospital?.nombre?.trim() ||
            undefined;

          const created = await tx.notificacion.create({
            data: {
              liquidationId,
              tipo: notifTipo,
              audiencia: "HOSPITAL",
              targetCuit,
              titulo: notifTitulo,
              mensaje: notifMensaje,
              href: notifHref,
              emisorId,
              emisorNombre,
              emailEnviado: false,
              emailDestinatarios:
                destinatariosCuit.length > 0 ? JSON.stringify(destinatariosCuit) : null,
            },
            select: { id: true },
          });

          createdNotifJobs.push({
            id: created.id,
            targetCuit,
            hospitalName: hospName,
            recipients: destinatariosCuit,
          });
        }
      } else {
        const created = await tx.notificacion.create({
          data: {
            liquidationId,
            tipo: notifTipo,
            audiencia: "HOSPITAL",
            targetCuit: null,
            titulo: notifTitulo,
            mensaje: notifMensaje,
            href: notifHref,
            emisorId,
            emisorNombre,
            emailEnviado: false,
            emailDestinatarios: JSON.stringify(finalRecipientsNormalized),
          },
          select: { id: true },
        });

        createdNotifJobs.push({
          id: created.id,
          targetCuit: null,
          hospitalName: hospitalNames.length === 1 ? hospitalNames[0] : undefined,
          recipients: finalRecipientsNormalized,
        });
      }
    });

    // Despacho real de correos electrónicos (uno por hospital/grupo para resguardar privacidad entre efectores)
    const emailResults: { id: string; sent: boolean; error: string | null }[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const job of createdNotifJobs) {
      if (job.recipients.length === 0) {
        emailResults.push({
          id: job.id,
          sent: false,
          error: "Sin casilla de correo seleccionada para este establecimiento.",
        });
        continue;
      }

      const sendRes = await sendLiquidationNotificationEmail({
        to: job.recipients,
        liquidationId,
        liquidationCode: liqCode,
        obraSocial: obraSocialName,
        periodLabel,
        hospitalName: job.hospitalName,
        isRectification: wasNotifiedBefore,
        subject: emailSubject,
        bodyMessage: emailBody,
        portalBaseUrl: requestOrigin,
      });

      if (sendRes.success) {
        sentCount++;
        emailResults.push({ id: job.id, sent: true, error: null });
      } else {
        failedCount++;
        emailResults.push({
          id: job.id,
          sent: false,
          error: (sendRes.error || "Error desconocido al enviar correo.").slice(0, 480),
        });
      }
    }

    // Persistir resultado real de cada envío de correo en auditoría (transacción atómica)
    if (emailResults.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const r of emailResults) {
          await tx.notificacion.update({
            where: { id: r.id },
            data: {
              emailEnviado: r.sent,
              emailError: r.error,
            },
          });
        }
      });
    }

    revalidatePath("/dashboard/liquidations");
    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    revalidatePath("/dashboard/hospital-portal");
    revalidatePath("/dashboard");

    if (failedCount > 0) {
      const firstErr = emailResults.find((r) => !r.sent && r.error)?.error || "Error SMTP";
      return {
        success: true,
        warning:
          sentCount > 0
            ? `Liquidación notificada en el portal (${sentCount} correo(s) enviado(s), ${failedCount} con error: ${firstErr}). Revise la Auditoría de Notificaciones.`
            : `Liquidación notificada en el portal, pero falló el envío de correo electrónico (${firstErr}). Revise la Auditoría de Notificaciones.`,
      };
    }

    return { success: true };
  } catch (e: any) {
    console.error("Error notifying hospital:", e);
    return { error: e.message || "Error al notificar al hospital." };
  }
}

export async function fetchLiquidationById(id: number) {
  try {
    const [liq, personalDistributions] = await Promise.all([
      prisma.liquidacion.findUnique({
        where: { id },
        include: {
          period: true,
          rc: {
            include: {
              cliente: true,
              appliedAsRc: {
                include: {
                  fc: true,
                },
              },
            },
          },
          details: {
            include: {
              hospital: true,
              cliente: true,
              compra: true,
            },
          },
          distributions: {
            include: {
              agent: {
                include: { hospital: true },
              },
            },
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.liquidacionPersonal.findMany({
        where: { idLiquidacion: id },
      }),
    ]);

    if (!liq) return null;

    const allCuils = personalDistributions.map((p) => p.cuil).filter((c): c is bigint => c !== null);
    const allEmpresaIds = Array.from(
      new Set(personalDistributions.map((p) => Number(p.idEmpresa || 0)).filter((id) => id > 0))
    );

    const [mspAgents, distEmpresas] = await Promise.all([
      allCuils.length > 0
        ? prisma.imPersonalMsp.findMany({
            where: { cuil: { in: allCuils } },
            include: {
              empresa: {
                select: { id: true, descripcion: true, cuit: true },
              },
            },
          })
        : Promise.resolve([]),
      allEmpresaIds.length > 0
        ? prisma.empresa.findMany({
            where: { id: { in: allEmpresaIds } },
            select: { id: true, descripcion: true, cuit: true },
          })
        : Promise.resolve([]),
    ]);

    const empresaById = new Map<number, { id: number; descripcion: string; cuit: string }>();
    for (const e of distEmpresas) {
      empresaById.set(e.id, {
        id: e.id,
        descripcion: e.descripcion || "",
        cuit: e.cuit ? String(e.cuit) : "",
      });
    }

    const cuilToEmpresas = new Map<string, { id: number; descripcion: string; cuit: string }[]>();
    for (const ag of mspAgents) {
      if (ag.cuil && ag.empresa) {
        const cuilStr = ag.cuil.toString();
        const list = cuilToEmpresas.get(cuilStr) || [];
        list.push({
          id: ag.idEmpresa,
          descripcion: ag.empresa.descripcion || "",
          cuit: ag.empresa.cuit ? String(ag.empresa.cuit) : "",
        });
        cuilToEmpresas.set(cuilStr, list);
      }
    }

    const sanitized = sanitizarLiquidacionCabecera({ ...liq, personalDistributions });
    if (sanitized && sanitized.personalDistributions) {
      sanitized.personalDistributions = sanitized.personalDistributions.map((p: any) => {
        const empList = cuilToEmpresas.get(String(p.cuil)) || [];
        const match = resolvePersonalDistributionHospital(p, empresaById, empList, sanitized.details || []);
        return {
          ...p,
          hospitalId: match.hospitalId,
          hospitalKey: match.hospitalKey,
          hospitalCuit: match.hospitalCuit,
          hospitalNombre: match.hospitalNombre,
        };
      });
    }

    return serializeData(sanitized);
  } catch (e) {
    console.error("Error fetching liquidation by id:", e);
    return null;
  }
}

export async function saveLiquidacionPersonalDistributions(
  liquidationId: number,
  distributions: {
    idAgente?: string | number;
    cuil?: string | number;
    honorarios: number;
    sobreasignacion: number;
  }[],
  hospitalId?: number
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const sessionUser = session?.user as any;
    if (!sessionUser || isUserReadOnlyAuditor(sessionUser?.role)) {
      return { error: "Acceso denegado. El perfil Auditor / Contable no puede modificar distribuciones." };
    }
    const parsedEmisorId = sessionUser?.id ? parseInt(String(sessionUser.id), 10) : NaN;
    const emisorId = !isNaN(parsedEmisorId) ? parsedEmisorId : null;
    const emisorNombre =
      sessionUser?.name?.trim() || sessionUser?.email?.trim() || "Establecimiento Hospital";

    // Validation: An agent can receive EITHER Honorarios OR Sobreasignacion, but NOT both
    const invalidExclusivity = distributions.find(
      (d) => Number(d.honorarios || 0) > 0 && Number(d.sobreasignacion || 0) > 0
    );

    if (invalidExclusivity) {
      return {
        error: "Regla de validación: Un profesional solo puede percibir Honorarios o Sobreasignación, no ambos conceptos simultáneamente.",
      };
    }

    const resolvedUserEmpresaId = sessionUser
      ? await resolveUserEmpresaId({
          id: !isNaN(parsedEmisorId) ? parsedEmisorId : 0,
          hospitalId: sessionUser.hospitalId,
          cuit: sessionUser.cuit,
        })
      : undefined;
    const effectiveEmpresaId =
      resolvedUserEmpresaId && resolvedUserEmpresaId > 0
        ? resolvedUserEmpresaId
        : hospitalId && Number(hospitalId) > 0
        ? Number(hospitalId)
        : 0;

    // Validar agentes nuevos contra el Periodo SISPER vigente (mes actual o 1 mes de gracia;
    // los agentes ya guardados previamente en esta liquidación se preservan para no afectar históricos).
    const incomingNonZeroCuils = Array.from(
      new Set(
        distributions
          .filter((d) => Number(d.honorarios || 0) > 0 || Number(d.sobreasignacion || 0) > 0)
          .map((d) => String(d.cuil || d.idAgente || "").replace(/\D/g, ""))
          .filter(Boolean)
      )
    );

    if (incomingNonZeroCuils.length > 0) {
      const existingSavedRows = await prisma.liquidacionPersonal.findMany({
        where:
          effectiveEmpresaId > 0
            ? { idLiquidacion: liquidationId, idEmpresa: { in: [effectiveEmpresaId, 0] } }
            : { idLiquidacion: liquidationId },
        select: { cuil: true, idAgente: true },
      });
      const existingCuilSet = new Set(
        existingSavedRows
          .map((r) => (r.cuil ? r.cuil.toString() : r.idAgente ? r.idAgente.toString() : ""))
          .filter(Boolean)
      );

      const newlyAddedCuils = incomingNonZeroCuils.filter((c) => !existingCuilSet.has(c));
      if (newlyAddedCuils.length > 0) {
        const { periodDate, info } = await getActiveSisperPeriodFilter();
        if (!info.canLoadAgents || !periodDate) {
          return { error: info.statusMessage };
        }

        const activeCuilSet = new Set<string>();
        const CHUNK = 200;
        for (let i = 0; i < newlyAddedCuils.length; i += CHUNK) {
          const chunkBig = newlyAddedCuils
            .slice(i, i + CHUNK)
            .map((c) => {
              try {
                return BigInt(c);
              } catch {
                return null;
              }
            })
            .filter((b): b is bigint => b !== null);

          if (chunkBig.length === 0) continue;
          const activeMatches = await prisma.imPersonalMsp.findMany({
            where: {
              periodo: periodDate,
              OR: [{ cuil: { in: chunkBig } }, { idAgente: { in: chunkBig } }],
            },
            select: { cuil: true, idAgente: true },
          });
          for (const m of activeMatches) {
            if (m.cuil) activeCuilSet.add(m.cuil.toString());
            if (m.idAgente) activeCuilSet.add(m.idAgente.toString());
          }
        }

        const inactiveCuils = newlyAddedCuils.filter((c) => !activeCuilSet.has(c));
        if (inactiveCuils.length > 0) {
          return {
            error: `Hay ${inactiveCuils.length} agente(s) que no figuran activos en la nómina SISPER vigente (${info.sisperLabel || "actual"}): ${inactiveCuils.slice(0, 5).join(", ")}${inactiveCuils.length > 5 ? "..." : ""}.`,
          };
        }
      }
    }

    // Atomic transaction: cleans previous and inserts new rows safely scoped by IdEmpresa
    await prisma.$transaction(async (tx) => {
      // 1. Clean previous distribution rows for this hospital in this liquidation
      if (effectiveEmpresaId > 0) {
        await tx.liquidacionPersonal.deleteMany({
          where: {
            idLiquidacion: liquidationId,
            idEmpresa: effectiveEmpresaId,
          },
        });

        // Limpiar también posibles registros legados (idEmpresa = 0) pertenecientes al personal de este hospital
        const hospitalAgents = await tx.imPersonalMsp.findMany({
          where: { idEmpresa: effectiveEmpresaId },
          select: { cuil: true },
        });
        const cuils = hospitalAgents.map((a) => a.cuil).filter((c): c is bigint => c !== null);
        if (cuils.length > 0) {
          await tx.liquidacionPersonal.deleteMany({
            where: {
              idLiquidacion: liquidationId,
              idEmpresa: 0,
              cuil: { in: cuils },
            },
          });
        }
      } else {
        await tx.liquidacionPersonal.deleteMany({
          where: { idLiquidacion: liquidationId },
        });
      }

      // 2. Insert valid distribution rows (deduplicado por CUIL dentro del mismo hospital)
      const validRowsMap = new Map<
        string,
        {
          idLiquidacion: number;
          idAgente: bigint;
          cuil: bigint;
          idEmpresa: number;
          honorarios: number;
          sobreasignacion: number;
        }
      >();

      const round2 = (num: any) => Math.round((Number(num) || 0) * 100) / 100;

      for (const d of distributions) {
        const rawId = d.cuil || d.idAgente;
        if (!rawId) continue;
        const cleanDigits = String(rawId).replace(/[^\d]/g, "");
        if (!cleanDigits) continue;

        const cuilBigInt = BigInt(cleanDigits);
        const honNum = round2(d.honorarios);
        const sobrNum = round2(d.sobreasignacion);

        if (honNum > 0 || sobrNum > 0) {
          validRowsMap.set(cleanDigits, {
            idLiquidacion: liquidationId,
            idAgente: cuilBigInt,
            cuil: cuilBigInt,
            idEmpresa: effectiveEmpresaId,
            honorarios: honNum,
            sobreasignacion: sobrNum,
          });
        }
      }

      const validRows = Array.from(validRowsMap.values());
      if (validRows.length > 0) {
        await tx.liquidacionPersonal.createMany({
          data: validRows,
        });
      }

      // 3. Automatically evaluate and update liquidation status
      const allDetails = await tx.liquidacionDetalle.findMany({
        where: { liquidationId },
        include: { compra: true, hospital: true },
      });

      const allPersonalDist = await tx.liquidacionPersonal.findMany({
        where: { idLiquidacion: liquidationId },
      });

      const allCuils = allPersonalDist.map((p) => p.cuil);
      const allEmpIds = Array.from(
        new Set(allPersonalDist.map((p) => Number(p.idEmpresa || 0)).filter((id) => id > 0))
      );

      const [mspAgents, distEmpresas] = await Promise.all([
        allCuils.length > 0
          ? tx.imPersonalMsp.findMany({
              where: { cuil: { in: allCuils } },
              include: {
                empresa: {
                  select: { id: true, descripcion: true, cuit: true },
                },
              },
            })
          : Promise.resolve([]),
        allEmpIds.length > 0
          ? tx.empresa.findMany({
              where: { id: { in: allEmpIds } },
              select: { id: true, descripcion: true, cuit: true },
            })
          : Promise.resolve([]),
      ]);

      const empresaById = new Map<number, { id: number; descripcion: string; cuit: string }>();
      for (const e of distEmpresas) {
        empresaById.set(e.id, {
          id: e.id,
          descripcion: e.descripcion || "",
          cuit: e.cuit ? String(e.cuit) : "",
        });
      }

      const cuilToEmpresas = new Map<string, { id: number; descripcion: string; cuit: string }[]>();
      for (const ag of mspAgents) {
        if (ag.cuil && ag.empresa) {
          const cuilStr = ag.cuil.toString();
          const list = cuilToEmpresas.get(cuilStr) || [];
          list.push({
            id: ag.idEmpresa,
            descripcion: ag.empresa.descripcion || "",
            cuit: ag.empresa.cuit ? String(ag.empresa.cuit) : "",
          });
          cuilToEmpresas.set(cuilStr, list);
        }
      }

      const hospitalTotals = new Map<string, { netoAPagar: number; distributed: number }>();
      for (const d of allDetails) {
        const hid = d.hospitalId || d.compra?.hospitalId;
        const detCuit = cleanCuit(d.cuit || d.hospital?.cuit);
        const key = hid ? `id-${hid}` : detCuit ? `cuit-${detCuit}` : `name-${d.prestadorNombre}`;
        const current = hospitalTotals.get(key) || { netoAPagar: 0, distributed: 0 };
        current.netoAPagar = round2(current.netoAPagar + Number(d.netoAPagar || 0));
        hospitalTotals.set(key, current);
      }

      for (const p of allPersonalDist) {
        const total = round2(Number(p.honorarios || 0) + Number(p.sobreasignacion || 0));
        if (total <= 0) continue;

        const empList = cuilToEmpresas.get(p.cuil.toString()) || [];
        const match = resolvePersonalDistributionHospital(p, empresaById, empList, allDetails);

        if (match.hospitalKey && hospitalTotals.has(match.hospitalKey)) {
          const current = hospitalTotals.get(match.hospitalKey)!;
          current.distributed = round2(current.distributed + total);
        } else if (hospitalTotals.size === 1) {
          const first = Array.from(hospitalTotals.values())[0];
          first.distributed = round2(first.distributed + total);
        }
      }

      const totalHospitals = hospitalTotals.size;
      let completedHospitals = 0;
      let totalDistributed = 0;

      for (const [, hData] of hospitalTotals.entries()) {
        totalDistributed = round2(totalDistributed + hData.distributed);
        if (hData.netoAPagar > 0 && hData.distributed >= hData.netoAPagar) {
          completedHospitals++;
        }
      }

      const currentLiq = await tx.liquidacion.findUnique({
        where: { id: liquidationId },
        select: {
          status: true,
          mesCarga: true,
          periodAnio: true,
          periodMes: true,
          rc: {
            select: {
              cliente: { select: { nombre: true } },
            },
          },
        },
      });

      if (currentLiq && currentLiq.status !== "CERRADA") {
        let newStatus = currentLiq.status;
        if (totalHospitals > 0 && completedHospitals >= totalHospitals) {
          newStatus = "DISTRIBUIDA";
        } else if (totalDistributed > 0) {
          newStatus = "EN PROCESO";
        } else if (currentLiq.status === "DISTRIBUIDA" || currentLiq.status === "EN PROCESO" || currentLiq.status === "EN_PROCESO") {
          newStatus = "NOTIFICADO";
        }

        if (newStatus !== currentLiq.status) {
          await tx.liquidacion.update({
            where: { id: liquidationId },
            data: { status: newStatus },
          });

          if (newStatus === "DISTRIBUIDA") {
            const MONTH_NAMES = [
              "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
              "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
            ];
            const liqCode = `LIQ-${String(liquidationId).padStart(4, "0")}`;
            const obraSocial = currentLiq.rc?.cliente?.nombre?.trim() || "Obra Social";
            const periodLabel =
              currentLiq.mesCarga?.trim() ||
              `${MONTH_NAMES[currentLiq.periodMes - 1] || currentLiq.periodMes} ${currentLiq.periodAnio}`;

            const uniqueHospNames = Array.from(
              new Set(allDetails.map((d) => (d.prestadorNombre || "").trim()).filter(Boolean))
            );
            const resumenEfectores =
              uniqueHospNames.length === 1
                ? uniqueHospNames[0]
                : uniqueHospNames.length > 1
                ? `${uniqueHospNames[0]} y ${uniqueHospNames.length - 1} efector(es) más`
                : `${totalHospitals} efector(es)`;

            await tx.notificacion.create({
              data: {
                liquidationId,
                tipo: "DISTRIBUCION_COMPLETA",
                audiencia: "UEP",
                targetCuit: null,
                titulo: "Distribución completa de liquidación",
                mensaje: `${liqCode} · ${obraSocial} (${periodLabel}) — Todos los efectores (${totalHospitals}) completaron: ${resumenEfectores}`,
                href: `/dashboard/liquidations?highlight=${liquidationId}`,
                emisorId,
                emisorNombre,
                emailEnviado: false,
              },
            });
          }
        }
      }
    });

    // Upload snapshot for DISTRIBUIDA state if fully completed
    const updatedLiq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      select: { status: true },
    });

    if (updatedLiq && (updatedLiq.status === "DISTRIBUIDA" || updatedLiq.status === "DISTRIBUIDO")) {
      try {
        const snapshot = await uploadLiquidationSnapshotToCloud(liquidationId, "DISTRIBUIDA");
        if (snapshot) {
          await prisma.liquidacion.update({
            where: { id: liquidationId },
            data: {
              reporteDistribuidoUrl: snapshot.url,
              reporteDistribuidoFileName: snapshot.fileName,
            },
          });
        }
      } catch (distSnapErr) {
        console.error("Error creating DISTRIBUIDA snapshot:", distSnapErr);
      }
    }

    revalidatePath(`/dashboard/liquidations/${liquidationId}`);
    revalidatePath("/dashboard/liquidations");
    revalidatePath("/dashboard/hospital-portal");
    revalidatePath("/dashboard/consolidation");

    return { success: true };
  } catch (e: any) {
    console.error("Error saving liquidacion personal distributions:", e);
    return { error: e.message || "Error al guardar los honorarios y sobreasignaciones." };
  }
}

async function getFullLiquidationExcelReportDataInternal(id: number) {
  try {
    const liq = await fetchLiquidationById(id);
    if (!liq) return { error: "Liquidación no encontrada" };

    const personalDistributions = liq.personalDistributions || [];
    const cuils = personalDistributions
      .map((p: any) => p.cuil)
      .filter((c: any): c is string | number => c !== null && c !== undefined && String(c).trim() !== "");

    const mspAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> = {};

    if (cuils.length > 0) {
      const bigintCuils = cuils
        .map((c: any) => {
          try {
            return BigInt(String(c).replace(/\D/g, ""));
          } catch {
            return null;
          }
        })
        .filter((c: any): c is bigint => c !== null);

      if (bigintCuils.length > 0) {
        const mspAgents = await prisma.imPersonalMsp.findMany({
          where: { cuil: { in: bigintCuils } },
          include: {
            empresa: {
              select: { id: true, descripcion: true },
            },
          },
        });

        for (const ag of mspAgents) {
          if (ag.cuil) {
            mspAgentsMap[ag.cuil.toString()] = {
              apellidoyNombre: ag.apellidoyNombre || "",
              idAgente: ag.idAgente ? ag.idAgente.toString() : ag.legajo || "",
              hospitalNombre: ag.empresa?.descripcion || "",
            };
          }
        }
      }
    }

    return { success: true, liquidation: liq, mspAgentsMap };
  } catch (e: any) {
    console.error("Error fetching liquidation report data:", e);
    return { error: e.message || "Error al obtener datos para el reporte." };
  }
}

export async function getLiquidationExcelReportData(id: number) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado para descargar reportes." };
    }

    const user = session.user as any;
    const userRole = String(user?.role || "");
    const isAdmin = isUserAdmin(userRole);
    const resolvedEmpresaId = await resolveUserEmpresaId({
      id: Number(user.id),
      hospitalId: user.hospitalId,
      cuit: user.cuit,
    });
    const isHospitalUser = !isAdmin && isUserHospital(userRole, resolvedEmpresaId ?? user?.hospitalId);

    const fullData = await getFullLiquidationExcelReportDataInternal(id);
    if (!fullData || fullData.error || !fullData.liquidation) {
      return fullData;
    }

    if (!isHospitalUser) {
      return fullData;
    }

    // Usuario Hospital (aislamiento estricto por CUIT): nunca exponer renglones, distribuciones ni totales de otros efectores
    if (!resolvedEmpresaId) {
      return { error: "No se pudo identificar el establecimiento sanitario asignado a su usuario." };
    }

    const targetEmpresa = await prisma.empresa.findUnique({
      where: { id: resolvedEmpresaId },
      select: { id: true, descripcion: true, cuit: true },
    });

    const hospitalCuit = cleanCuit(targetEmpresa?.cuit);
    if (!hospitalCuit) {
      return { error: "Su establecimiento no posee un CUIT configurado para generar reportes." };
    }

    const empresaAgents = await prisma.imPersonalMsp.findMany({
      where: { empresa: { cuit: Number(hospitalCuit) } },
      select: { cuil: true },
    });
    const hospitalCuilSet = new Set(
      empresaAgents.map((a) => (a.cuil ? a.cuil.toString() : "")).filter(Boolean)
    );

    const scopedLiquidation = filterLiquidationForHospital(fullData.liquidation, hospitalCuit, {
      hospitalCuilSet,
      hospitalName: targetEmpresa?.descripcion?.trim() || undefined,
      hospitalEmpresaId: resolvedEmpresaId,
    });

    if (!scopedLiquidation.details || scopedLiquidation.details.length === 0) {
      return { error: "Su establecimiento no posee comprobantes incluidos en esta liquidación." };
    }

    const allowedCuils = new Set(
      (scopedLiquidation.personalDistributions || [])
        .map((p: any) => String(p.cuil || p.idAgente || "").replace(/\D/g, ""))
        .filter(Boolean)
    );

    const scopedAgentsMap: Record<string, { apellidoyNombre: string; idAgente: string; hospitalNombre: string }> = {};
    for (const [cuilKey, agentMeta] of Object.entries(fullData.mspAgentsMap || {})) {
      if (allowedCuils.has(cuilKey.replace(/\D/g, ""))) {
        scopedAgentsMap[cuilKey] = agentMeta;
      }
    }

    return {
      success: true,
      liquidation: serializeData(scopedLiquidation),
      mspAgentsMap: scopedAgentsMap,
    };
  } catch (e: any) {
    console.error("Error fetching liquidation report data:", e);
    return { error: e.message || "Error al obtener datos para el reporte." };
  }
}

export async function searchAgentsForLiquidationAction(query: string, _hospitalId?: number) {
  try {
    const clean = query.trim();
    if (!clean || clean.length < 2) return [];

    // Regla estricta de período vigente: solo agentes presentes en el último Periodo SISPER (0-1 mes de gracia)
    const { periodDate, info } = await getActiveSisperPeriodFilter();
    if (!info.canLoadAgents || !periodDate) {
      return [];
    }

    const cleanDigits = clean.replace(/[^\d]/g, "");
    let cuilBigInt: bigint | null = null;
    if (cleanDigits.length >= 6) {
      try {
        cuilBigInt = BigInt(cleanDigits);
      } catch {}
    }

    // Búsqueda abierta en todo el padrón SISPER del período vigente (los agentes pueden desempeñarse en múltiples establecimientos)
    const where: any = {
      periodo: periodDate,
      OR: [
        { apellidoyNombre: { contains: clean } },
        { legajo: { contains: clean } },
        ...(cuilBigInt !== null ? [{ cuil: cuilBigInt }, { idAgente: cuilBigInt }] : []),
      ],
    };

    const mspAgents = await prisma.imPersonalMsp.findMany({
      where,
      include: {
        empresa: {
          select: { id: true, descripcion: true },
        },
      },
      orderBy: [{ apellidoyNombre: "asc" }],
      take: 150,
    });

    const seen = new Set<string>();
    const results: any[] = [];
    for (const ag of mspAgents) {
      const rawCuil = ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ag.legajo.trim());
      if (!seen.has(rawCuil)) {
        seen.add(rawCuil);
        results.push({
          id: rawCuil,
          idAgente: rawCuil,
          cuil: ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ""),
          legajo: ag.legajo.trim(),
          nombre: ag.apellidoyNombre?.trim() || "",
          cargo: "PROFESIONAL",
          hospitalId: ag.idEmpresa,
          hospitalNombre: ag.empresa?.descripcion?.trim() || "",
        });
      }
    }

    return serializeData(results);
  } catch (err) {
    console.error("Error searching agents:", err);
    return [];
  }
}

export async function searchBatchAgentsForLiquidationAction(terms: string[], _hospitalId?: number) {
  try {
    if (!terms || terms.length === 0) return [];

    const cuils: bigint[] = [];
    const textTerms: string[] = [];

    for (const t of terms) {
      const clean = t.trim();
      const cleanDigits = clean.replace(/[^\d]/g, "");
      if (cleanDigits.length >= 6) {
        try {
          cuils.push(BigInt(cleanDigits));
        } catch {}
      } else if (clean.length >= 3) {
        textTerms.push(clean);
      }
    }

    const orClauses: any[] = [];
    if (cuils.length > 0) {
      orClauses.push({ cuil: { in: cuils } });
      orClauses.push({ idAgente: { in: cuils } });
    }
    for (const text of textTerms.slice(0, 30)) {
      orClauses.push({ apellidoyNombre: { contains: text } });
    }

    if (orClauses.length === 0) return [];

    // Búsqueda por lote abierta sobre todo el padrón SISPER
    const where: any = { OR: orClauses };

    const mspAgents = await prisma.imPersonalMsp.findMany({
      where,
      include: {
        empresa: {
          select: { id: true, descripcion: true },
        },
      },
      take: 400,
    });

    const seen = new Set<string>();
    const results: any[] = [];
    for (const ag of mspAgents) {
      const rawCuil = ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ag.legajo.trim());
      if (!seen.has(rawCuil)) {
        seen.add(rawCuil);
        results.push({
          id: rawCuil,
          idAgente: rawCuil,
          cuil: ag.cuil ? ag.cuil.toString() : (ag.idAgente ? ag.idAgente.toString() : ""),
          legajo: ag.legajo.trim(),
          nombre: ag.apellidoyNombre?.trim() || "",
          cargo: "PROFESIONAL",
          hospitalId: ag.idEmpresa,
          hospitalNombre: ag.empresa?.descripcion?.trim() || "",
        });
      }
    }

    return serializeData(results);
  } catch (err) {
    console.error("Error searching batch agents:", err);
    return [];
  }
}

export interface ResolvedBulkAgent {
  id: string;
  idAgente: string;
  cuil: string;
  legajo: string;
  nombre: string;
  cargo: string;
  hospitalId: number;
  hospitalNombre: string;
}

export interface BulkIdentifierResolution {
  status: "FOUND" | "AMBIGUOUS" | "NOT_FOUND";
  matches: ResolvedBulkAgent[];
}

/**
 * Resuelve masivamente una lista de DNIs (6-8 dígitos) y/o CUILs (11 dígitos)
 * contra todo el padrón SISPER (`imPersonalMsp`) en bloques parametrizados seguros.
 */
export async function resolveBulkAgentsByIdentifiersAction(
  identifiers: string[],
  preferredEmpresaId?: number
): Promise<{
  success?: boolean;
  resolved?: Record<string, BulkIdentifierResolution>;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { error: "No autorizado. Debe iniciar sesión para validar el padrón." };
    }

    // Regla estricta de período vigente: solo agentes presentes en el último Periodo SISPER (0-1 mes de gracia)
    const { periodDate, info } = await getActiveSisperPeriodFilter();
    if (!info.canLoadAgents || !periodDate) {
      return { error: info.statusMessage };
    }

    const uniqueIds = Array.from(
      new Set(
        (identifiers || [])
          .map((raw) => String(raw || "").replace(/\D/g, ""))
          .map((digits) => (digits.length === 11 ? digits : digits.replace(/^0+/, "")))
          .filter((digits) => digits.length === 11 || (digits.length >= 6 && digits.length <= 8))
      )
    ).slice(0, 2000);

    if (uniqueIds.length === 0) {
      return { success: true, resolved: {} };
    }

    const allNums = uniqueIds.map((d) => Number(d)).filter((n) => Number.isSafeInteger(n) && n > 0);
    const dniNums = uniqueIds
      .filter((d) => d.length >= 6 && d.length <= 8)
      .map((d) => Number(d))
      .filter((n) => Number.isSafeInteger(n) && n > 0);

    type RawMspRow = {
      cuil: bigint | number | string | null;
      idAgente: bigint | number | string | null;
      legajo: string | null;
      nombre: string | null;
      idEmpresa: number;
      hospitalNombre: string | null;
    };

    const rawRows: RawMspRow[] = [];
    const CHUNK_SIZE = 150;

    // 1) Búsqueda exacta por Cuil o IdAgente dentro del Periodo SISPER vigente
    for (let i = 0; i < allNums.length; i += CHUNK_SIZE) {
      const chunk = allNums.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const rows = await prisma.$queryRaw<RawMspRow[]>(Prisma.sql`
        SELECT
          m.Cuil AS cuil,
          m.IdAgente AS idAgente,
          m.Legago AS legajo,
          m.ApellidoyNombre AS nombre,
          m.IdEmpresa AS idEmpresa,
          e.Descripcion AS hospitalNombre
        FROM imPersonalMsp m
        LEFT JOIN EMPRESAS e ON e.IdEmpresa = m.IdEmpresa
        WHERE m.Periodo = ${periodDate}
          AND (m.Cuil IN (${Prisma.join(chunk)}) OR m.IdAgente IN (${Prisma.join(chunk)}))
      `);
      rawRows.push(...rows);
    }

    // 2) Búsqueda por los 8 dígitos centrales del CUIL para DNIs de 6-8 dígitos dentro del Periodo SISPER vigente
    for (let i = 0; i < dniNums.length; i += CHUNK_SIZE) {
      const chunk = dniNums.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const rows = await prisma.$queryRaw<RawMspRow[]>(Prisma.sql`
        SELECT
          m.Cuil AS cuil,
          m.IdAgente AS idAgente,
          m.Legago AS legajo,
          m.ApellidoyNombre AS nombre,
          m.IdEmpresa AS idEmpresa,
          e.Descripcion AS hospitalNombre
        FROM imPersonalMsp m
        LEFT JOIN EMPRESAS e ON e.IdEmpresa = m.IdEmpresa
        WHERE m.Periodo = ${periodDate}
          AND m.Cuil IS NOT NULL
          AND ((m.Cuil % CAST(1000000000 AS BIGINT)) / CAST(10 AS BIGINT)) IN (${Prisma.join(chunk)})
      `);
      rawRows.push(...rows);
    }

    // Deduplicar por CUIL único (prefiriendo fila del establecimiento actual si existe, si no el período más reciente)
    const uniqueAgentByCuil = new Map<string, ResolvedBulkAgent>();
    for (const row of rawRows) {
      const cuilStr = row.cuil !== null && row.cuil !== undefined ? String(row.cuil).replace(/\D/g, "") : "";
      const idAgenteStr =
        row.idAgente !== null && row.idAgente !== undefined ? String(row.idAgente).replace(/\D/g, "") : "";
      const canonicalKey = cuilStr || idAgenteStr;
      if (!canonicalKey) continue;

      const candidate: ResolvedBulkAgent = {
        id: canonicalKey,
        idAgente: idAgenteStr || canonicalKey,
        cuil: cuilStr || idAgenteStr,
        legajo: String(row.legajo || "").trim(),
        nombre: String(row.nombre || "").trim() || `Agente #${canonicalKey}`,
        cargo: "PROFESIONAL",
        hospitalId: Number(row.idEmpresa || 0),
        hospitalNombre: String(row.hospitalNombre || "").trim(),
      };

      const existing = uniqueAgentByCuil.get(canonicalKey);
      if (!existing) {
        uniqueAgentByCuil.set(canonicalKey, candidate);
      } else if (
        preferredEmpresaId &&
        candidate.hospitalId === preferredEmpresaId &&
        existing.hospitalId !== preferredEmpresaId
      ) {
        uniqueAgentByCuil.set(canonicalKey, candidate);
      }
    }

    // Construir índices rápidos para resolver cada identificador solicitado
    const byExactCuil = new Map<string, ResolvedBulkAgent>();
    const byIdAgente = new Map<string, ResolvedBulkAgent[]>();
    const byExtractedDni = new Map<string, ResolvedBulkAgent[]>();

    const pushUnique = (map: Map<string, ResolvedBulkAgent[]>, key: string, ag: ResolvedBulkAgent) => {
      if (!key) return;
      const list = map.get(key) || [];
      if (!list.some((item) => item.cuil === ag.cuil)) {
        list.push(ag);
        map.set(key, list);
      }
    };

    for (const ag of uniqueAgentByCuil.values()) {
      if (ag.cuil) {
        byExactCuil.set(ag.cuil, ag);
        if (ag.cuil.length === 11) {
          try {
            const dniPart = ((BigInt(ag.cuil) % BigInt(1000000000)) / BigInt(10)).toString();
            pushUnique(byExtractedDni, dniPart, ag);
          } catch {}
        }
      }
      if (ag.idAgente) {
        const cleanIdAg = ag.idAgente.replace(/^0+/, "");
        pushUnique(byIdAgente, ag.idAgente, ag);
        if (cleanIdAg && cleanIdAg !== ag.idAgente) {
          pushUnique(byIdAgente, cleanIdAg, ag);
        }
      }
    }

    const resolved: Record<string, BulkIdentifierResolution> = {};

    for (const id of uniqueIds) {
      const candidateMap = new Map<string, ResolvedBulkAgent>();

      const exact = byExactCuil.get(id);
      if (exact) candidateMap.set(exact.cuil, exact);

      for (const ag of byIdAgente.get(id) || []) {
        candidateMap.set(ag.cuil, ag);
      }

      if (id.length >= 6 && id.length <= 8) {
        for (const ag of byExtractedDni.get(id) || []) {
          candidateMap.set(ag.cuil, ag);
        }
      }

      const matches = Array.from(candidateMap.values()).sort((a, b) => {
        if (preferredEmpresaId) {
          const aPref = a.hospitalId === preferredEmpresaId ? 0 : 1;
          const bPref = b.hospitalId === preferredEmpresaId ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;
        }
        return a.nombre.localeCompare(b.nombre, "es");
      });

      if (matches.length === 1) {
        resolved[id] = { status: "FOUND", matches };
      } else if (matches.length > 1) {
        resolved[id] = { status: "AMBIGUOUS", matches };
      } else {
        resolved[id] = { status: "NOT_FOUND", matches: [] };
      }
    }

    return { success: true, resolved: serializeData(resolved) };
  } catch (err: any) {
    console.error("Error resolving bulk agents by identifiers:", err);
    return { error: err?.message || "Error al validar los agentes contra el padrón SISPER." };
  }
}

