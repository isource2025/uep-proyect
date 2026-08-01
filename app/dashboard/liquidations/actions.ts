"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import path from "path";
import { put } from "@vercel/blob";

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
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
    const ptoVta = d.compra.grupoCbte ? String(d.compra.grupoCbte).padStart(4, "0") : "0000";
    const nroCbte = d.compra.numero ? String(d.compra.numero).padStart(8, "0") : "";
    fcNumStr = d.compra.numero ? `FC-${ptoVta}-${nroCbte}` : `FC-${d.compra.id}`;
  }

  return {
    ...d,
    totalFacturado: toNum(d.totalFacturado),
    creditos: toNum(d.creditos),
    debitos: toNum(d.debitos),
    ajustesOs: toNum(d.ajustesOs),
    pendientesCobro: toNum(d.pendientesCobro),
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

function sanitizarLiquidacionCabecera(liq: any) {
  if (!liq) return null;
  const details = (liq.details || []).map(sanitizarLiquidacionDetalle);

  // Compute aggregate totals across all hospital rows for UI display
  const totalFacturado = details.reduce((sum: number, d: any) => sum + d.totalFacturado, 0);
  const creditos = details.reduce((sum: number, d: any) => sum + d.creditos, 0);
  const debitos = details.reduce((sum: number, d: any) => sum + d.debitos, 0);
  const ajustesOs = details.reduce((sum: number, d: any) => sum + d.ajustesOs, 0);
  const pendientesCobro = details.reduce((sum: number, d: any) => sum + d.pendientesCobro, 0);
  const brutoAPagar = details.reduce((sum: number, d: any) => sum + d.brutoAPagar, 0);
  const ga = details.reduce((sum: number, d: any) => sum + d.ga, 0);
  const ajusteRecupero = details.reduce((sum: number, d: any) => sum + d.ajusteRecupero, 0);
  const netoAPagar = details.reduce((sum: number, d: any) => sum + d.netoAPagar, 0);

  return {
    ...liq,
    rc: sanitizeCbte(liq.rc),
    details,
    totalFacturado,
    creditos,
    debitos,
    ajustesOs,
    pendientesCobro,
    brutoAPagar,
    ga,
    ajusteRecupero,
    netoAPagar,
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
    ];

    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
      whereClause.OR.push({
        rc: {
          numero: num,
        },
      });
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

    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
      pendingWhereClause.AND[0].OR.push({
        numero: num,
      });
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
          },
        },
        details: {
          include: {
            hospital: true,
            cliente: true,
            compra: true,
          },
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

  const sanitizedLiquidations = liquidations.map(sanitizarLiquidacionCabecera);

  const sanitizedPendingRcs = pendingRcs.map((rc) => ({
    ...sanitizeCbte(rc),
    appliedAsRc: rc.appliedAsRc.map((app) => ({
      ...app,
      importe: toNum(app.importe),
      fc: sanitizeCbte(app.fc),
    })),
  }));

  return {
    liquidations: sanitizedLiquidations,
    totalLiquidationsCount,
    pendingRcs: sanitizedPendingRcs,
    totalPendingRcsCount,
  };
}

function calculateDefaultGA(totalFacturado: number): number {
  return Number((totalFacturado * 0.06).toFixed(2));
}

function calculateDefaultAjustesOs(totalFacturado: number): number {
  return Number((totalFacturado * 0.05).toFixed(2));
}

// 2. Generate a new Liquidation header and hospital detail rows from an RC
export async function calculateLiquidation(rcId: number) {
  try {
    const rc = await prisma.cbte.findUnique({
      where: { id: rcId },
      include: { cliente: true },
    });
    if (!rc) return { error: "Comprobante no encontrado." };

    const activePeriod = await prisma.periodoIVA.findFirst({
      where: { fechaCierre: null },
    });
    if (!activePeriod) return { error: "No hay un período activo abierto en el sistema." };

    // Find applied sales invoices (FC)
    const applications = await prisma.cbteAplica.findMany({
      where: { rcId },
      include: { fc: true },
    });

    const fcIds = applications.map((a) => a.fcId);

    // Find hospital purchase invoices (Compras) linked to these FC sales invoices
    let hospitalPurchases = await prisma.compra.findMany({
      where: {
        fcVentaId: { in: fcIds },
      },
      include: {
        hospital: true,
        cliente: true,
      },
    });

    // Fallback: If no Compras are directly linked via fcVentaId, find Compras for this Obra Social (clienteId)
    if (hospitalPurchases.length === 0 && rc.clienteId) {
      hospitalPurchases = await prisma.compra.findMany({
        where: {
          clienteId: rc.clienteId,
        },
        include: {
          hospital: true,
          cliente: true,
        },
        take: 20,
      });
    }

    const monthStr = `${activePeriod.mes.toString().padStart(2, "0")}/${activePeriod.anio}`;

    // Create Liquidation Header record
    const liquidation = await prisma.liquidacion.create({
      data: {
        periodAnio: activePeriod.anio,
        periodMes: activePeriod.mes,
        rcId,
        mesCarga: monthStr,
        status: "PENDIENTE",
      },
    });

    // Create LiquidationDetail rows for each Hospital in parallel to avoid server timeout
    if (hospitalPurchases.length > 0) {
      const extractLocalidad = (name: string | null | undefined): string => {
        if (!name) return "CAPITAL";
        const parts = name.split("-");
        if (parts.length > 1) {
          return parts[parts.length - 1].trim().toUpperCase();
        }
        return "CAPITAL";
      };

      const detailPromises = hospitalPurchases.map((comp) => {
        const total = toNum(comp.importe);
        const ptoVta = comp.grupoCbte ? String(comp.grupoCbte).padStart(4, "0") : "0000";
        const nroCbte = comp.numero ? String(comp.numero).padStart(8, "0") : "";
        const fcNumStr = comp.numero ? `FC-${ptoVta}-${nroCbte}` : `FC-${comp.id}`;
        
        const defaultAjustesOs = calculateDefaultAjustesOs(total);
        const defaultGa = calculateDefaultGA(total);
        
        // bruto = total + creditos - debitos + ajustesOs - pendientesCobro
        // since creditos, debitos, pendientesCobro are 0 initially:
        const defaultBruto = Math.max(0, total + defaultAjustesOs);
        // neto = bruto - ga + ajusteRecupero
        // since ajusteRecupero is 0 initially:
        const defaultNeto = Math.max(0, defaultBruto - defaultGa);
        
        const compPeriod = comp.fecha
          ? `${(comp.fecha.getMonth() + 1).toString().padStart(2, "0")}/${comp.fecha.getFullYear()}`
          : monthStr;

        return prisma.liquidacionDetalle.create({
          data: {
            liquidationId: liquidation.id,
            compraId: comp.id,
            hospitalId: comp.hospitalId,
            clienteId: comp.clienteId || rc.clienteId,
            periodo: compPeriod,
            cuit: comp.hospital?.cuit ? toNum(comp.hospital.cuit).toString() : rc.cliente?.cuit ? toNum(rc.cliente.cuit).toString() : "",
            prestadorNombre: comp.hospital?.nombre || "Hospital Prestador",
            localidad: extractLocalidad(comp.hospital?.nombre),
            fcHospital: fcNumStr,
            totalFacturado: total,
            creditos: 0,
            debitos: 0,
            ajustesOs: defaultAjustesOs,
            pendientesCobro: 0,
            brutoAPagar: defaultBruto,
            ga: defaultGa,
            ajusteRecupero: 0,
            netoAPagar: defaultNeto,
          },
        });
      });
      await Promise.all(detailPromises);
    } else {
      // Create at least 1 default detail row from RC applied invoice if no Compras
      const total = toNum(rc.importe);
      const defaultAjustesOs = calculateDefaultAjustesOs(total);
      const defaultGa = calculateDefaultGA(total);
      const defaultBruto = Math.max(0, total + defaultAjustesOs);
      const defaultNeto = Math.max(0, defaultBruto - defaultGa);

      await prisma.liquidacionDetalle.create({
        data: {
          liquidationId: liquidation.id,
          clienteId: rc.clienteId,
          periodo: monthStr,
          cuit: rc.cliente?.cuit ? toNum(rc.cliente.cuit).toString() : "",
          prestadorNombre: "Hospital Central",
          localidad: "CAPITAL",
          fcHospital: `FC-UEP-${rc.numero}`,
          totalFacturado: total,
          creditos: 0,
          debitos: 0,
          ajustesOs: defaultAjustesOs,
          pendientesCobro: 0,
          brutoAPagar: defaultBruto,
          ga: defaultGa,
          ajusteRecupero: 0,
          netoAPagar: defaultNeto,
        },
      });
    }

    revalidatePath("/dashboard/liquidations");
    return { success: true, liquidationId: liquidation.id };
  } catch (e: any) {
    console.error("Error generating liquidation:", e);
    return { error: e.message || "Error al calcular liquidación." };
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
    ga: number;
    ajusteRecupero: number;
  }>,
  status?: string,
  mesCarga?: string
) {
  try {
    const detailIds = details.map((d) => d.id);
    // Fetch all current details in a single query
    const currentRecords = await prisma.liquidacionDetalle.findMany({
      where: { id: { in: detailIds } },
    });
    const recordsMap = new Map(currentRecords.map((r) => [r.id, r]));

    // Perform updates in parallel to prevent Vercel execution timeouts
    const updatePromises = details.map((d) => {
      const record = recordsMap.get(d.id);
      if (!record) return Promise.resolve();

      const totalFacturado = toNum(record.totalFacturado);
      const brutoAPagar = Math.max(0, totalFacturado + d.creditos - d.debitos + d.ajustesOs - d.pendientesCobro);
      const netoAPagar = Math.max(0, brutoAPagar - d.ga + d.ajusteRecupero);

      return prisma.liquidacionDetalle.update({
        where: { id: d.id },
        data: {
          creditos: d.creditos,
          debitos: d.debitos,
          ajustesOs: d.ajustesOs,
          pendientesCobro: d.pendientesCobro,
          brutoAPagar,
          ga: d.ga,
          ajusteRecupero: d.ajusteRecupero,
          netoAPagar,
        },
      });
    });

    await Promise.all(updatePromises);

    if (status || mesCarga !== undefined) {
      await prisma.liquidacion.update({
        where: { id: liquidationId },
        data: {
          ...(status ? { status } : {}),
          ...(mesCarga !== undefined ? { mesCarga } : {}),
        },
      });
    }

    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating liquidation details:", e);
    return { error: e.message || "Error al guardar ajustes de liquidación." };
  }
}

// 4. Upload scanned PDF file with debit breakdown sent by Obra Social
export async function uploadDebitsFile(formData: FormData) {
  try {
    const liquidationIdStr = formData.get("liquidationId") as string;
    const file = formData.get("file") as File;

    if (!liquidationIdStr || !file) {
      return { error: "Faltan parámetros requeridos para la carga de débitos." };
    }

    const liquidationId = parseInt(liquidationIdStr, 10);

    const filename = `debits-liq-${liquidationId}-${Date.now()}${path.extname(file.name)}`;
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { error: "La variable BLOB_READ_WRITE_TOKEN no está configurada en las variables de entorno (.env)." };
    }

    const blob = await put(filename, file, { access: "public" });
    const fileUrl = blob.url;

    await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: {
        debitsFileUrl: fileUrl,
        debitsFileName: file.name,
      },
    });

    revalidatePath("/dashboard/liquidations");
    return { success: true, fileUrl, fileName: file.name };
  } catch (e: any) {
    console.error("Error uploading debits file:", e);
    return { error: e.message || "Error al guardar el comprobante escaneado de débitos." };
  }
}

export async function deleteDebitsFile(liquidationId: number) {
  try {
    await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: {
        debitsFileUrl: null,
        debitsFileName: null,
      },
    });

    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error deleting debits file:", e);
    return { error: e.message || "Error al borrar el comprobante escaneado." };
  }
}

// 5. Notify hospital by updating liquidation status to NOTIFICADO and writing mock email logs
export async function notifyHospital(liquidationId: number) {
  try {
    const liq = await prisma.liquidacion.findUnique({
      where: { id: liquidationId },
      include: {
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

    // Get the hospital names & emails involved
    const details = liq.details;
    const hospitalEmails = details
      .map((d) => d.hospital?.nombre ? `${d.hospital.nombre.toLowerCase().replace(/\s+/g, "")}@uep.gov.ar` : null)
      .filter((email, index, self) => email !== null && self.indexOf(email) === index) as string[];

    const hospitalNames = details
      .map((d) => d.hospital?.nombre || "Hospital Prestador")
      .filter((name, index, self) => self.indexOf(name) === index);

    // Update status to NOTIFICADO
    await prisma.liquidacion.update({
      where: { id: liquidationId },
      data: { status: "NOTIFICADO" },
    });

    // Calculate total net final to display in email
    const totalNet = details.reduce((sum, d) => sum + toNum(d.netoAPagar), 0);

    // Format local date
    const formattedDate = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

    // Build the mock email contents
    const emailLog = `
=========================================
📧 NOTIFICACIÓN DE LIQUIDACIÓN DE OBRA SOCIAL
=========================================
Fecha de Envío: ${formattedDate}
De: liquidaciones@uep.gov.ar (Mesa de Liquidaciones UEP)
Para: ${hospitalEmails.length > 0 ? hospitalEmails.join(", ") : "sin-correo@uep.gov.ar"}
Destinatarios: ${hospitalNames.join(", ")}
Asunto: Nueva Liquidación Disponible - Período: ${liq.mesCarga || "N/A"} - LIQ-${String(liq.id).padStart(4, "0")}

Estimado Director / Administrador de Establecimiento de Salud,

Nos comunicamos de la Unidad Ejecutora Provincial (UEP) para informarle que se ha generado y procesado una nueva liquidación de fondos de Obra Social para su hospital correspondiente al período ${liq.mesCarga || "N/A"}.

Detalles de la Liquidación:
- Nro de Liquidación UEP: LIQ-${String(liq.id).padStart(4, "0")}
- Obra Social: ${liq.rc.cliente?.nombre || "N/A"} (CUIT: ${liq.rc.cliente?.cuit ? toNum(liq.rc.cliente.cuit) : "N/A"})
- Recibo UEP de Cobro (RC): ${liq.rc.puntoVenta || "0000"}-${liq.rc.numero || 0}
- Importe Neto Total a Distribuir: $${totalNet.toLocaleString("es-AR", { minimumFractionDigits: 2 })}

Por favor, ingrese al Portal del Hospital antes de la fecha límite establecida para realizar la distribución de fondos obligatoria correspondientes a los conceptos de:
1. Honorarios Médicos
2. Sobreasignaciones al Personal
3. Gastos de Funcionamiento

Para acceder, ingrese con sus credenciales autorizadas a la sección del Portal del Hospital correspondiente.

Atentamente,
Unidad Ejecutora Provincial (UEP)
Provincia de Corrientes
=========================================
`;

    // Ensure directory public/uploads exists
    const fs = require("fs");
    const notificationsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(notificationsDir)) {
      fs.mkdirSync(notificationsDir, { recursive: true });
    }

    const logPath = path.join(notificationsDir, "notifications-log.txt");
    // Append notification log
    await fs.promises.appendFile(logPath, emailLog + "\n\n");
    console.log(`[MOCK EMAIL] Saved email notification in public/uploads/notifications-log.txt for LIQ-${liq.id}`);

    revalidatePath("/dashboard/liquidations");
    return { success: true };
  } catch (e: any) {
    console.error("Error notifying hospital:", e);
    return { error: e.message || "Error al notificar al hospital." };
  }
}

export async function fetchLiquidationById(id: number) {
  try {
    const liq = await prisma.liquidacion.findUnique({
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
      },
    });

    if (!liq) return null;
    return sanitizarLiquidacionCabecera(liq);
  } catch (e) {
    console.error("Error fetching liquidation by id:", e);
    return null;
  }
}

