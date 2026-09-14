"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const clean = val.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === "object" && val !== null) {
    if ("toNumber" in val && typeof val.toNumber === "function") {
      return val.toNumber();
    }
    if ("d" in val && "s" in val && "e" in val) {
      return Number(val.toString());
    }
  }
  return Number(val) || 0;
}

export async function fetchAgentsData(
  periodStr?: string,
  hospitalId?: number,
  searchQuery?: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    const skip = (page - 1) * limit;

    // 1. Fetch available periods in imPersonalMsp
    const distinctPeriods = await prisma.imPersonalMsp.findMany({
      select: { periodo: true },
      distinct: ["periodo"],
      orderBy: { periodo: "desc" },
    });

    const periods = distinctPeriods.map((p) => {
      const d = new Date(p.periodo);
      return d.toISOString().split("T")[0]; // "YYYY-MM-DD"
    });

    // Default to the first period or current month
    const activePeriod = periodStr || (periods.length > 0 ? periods[0] : new Date().toISOString().split("T")[0]);
    const periodDate = new Date(activePeriod);

    // 2. Fetch list of empresas (hospitales)
    const empresas = await prisma.empresa.findMany({
      select: {
        id: true,
        descripcion: true,
        localidad: true,
        cuit: true,
      },
      orderBy: { descripcion: "asc" },
    });

    // 3. Build where clause
    const where: any = {};

    if (activePeriod) {
      where.periodo = periodDate;
    }

    if (hospitalId) {
      where.idEmpresa = hospitalId;
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      const cleanDigits = q.replace(/[^\d]/g, "");
      let cuilSearchBigInt: bigint | null = null;
      let idAgenteSearchNum: number | null = null;

      if (cleanDigits.length >= 6) {
        try {
          cuilSearchBigInt = BigInt(cleanDigits);
        } catch {}
      }
      if (cleanDigits.length > 0 && cleanDigits.length <= 9) {
        try {
          const parsed = parseInt(cleanDigits, 10);
          if (!isNaN(parsed) && parsed < 2147483647) {
            idAgenteSearchNum = parsed;
          }
        } catch {}
      }

      where.OR = [
        { apellidoyNombre: { contains: q } },
        { legajo: { contains: q } },
        ...(cuilSearchBigInt !== null ? [{ cuil: { equals: cuilSearchBigInt } }] : []),
        ...(idAgenteSearchNum !== null ? [{ idAgente: { equals: idAgenteSearchNum } }] : []),
      ];
    }

    // 4. Fetch paginated agents and total count
    const [rawAgents, totalCount] = await Promise.all([
      prisma.imPersonalMsp.findMany({
        where,
        include: {
          empresa: {
            select: {
              id: true,
              descripcion: true,
              localidad: true,
              cuit: true,
            },
          },
        },
        orderBy: [{ idEmpresa: "asc" }, { apellidoyNombre: "asc" }],
        skip,
        take: limit,
      }),
      prisma.imPersonalMsp.count({ where }),
    ]);

    const agents = rawAgents.map((ag) => ({
      periodo: ag.periodo.toISOString().split("T")[0],
      idEmpresa: ag.idEmpresa,
      legajo: ag.legajo.trim(),
      idAgente: ag.idAgente !== null && ag.idAgente !== undefined ? ag.idAgente.toString() : null,
      cuil: ag.cuil ? ag.cuil.toString() : null,
      apellidoyNombre: ag.apellidoyNombre?.trim() || "",
      empresa: ag.empresa
        ? {
            id: ag.empresa.id,
            descripcion: ag.empresa.descripcion?.trim() || "",
            localidad: ag.empresa.localidad?.trim() || "",
            cuit: ag.empresa.cuit ? toNum(ag.empresa.cuit) : null,
          }
        : null,
    }));

    return {
      success: true,
      agents,
      totalCount,
      periods,
      activePeriod,
      empresas: empresas.map((e) => ({
        id: e.id,
        descripcion: e.descripcion?.trim() || `Empresa ${e.id}`,
        localidad: e.localidad?.trim() || "",
        cuit: e.cuit ? toNum(e.cuit) : null,
      })),
    };
  } catch (e: any) {
    console.error("Error fetching agents data:", e);
    return {
      success: false,
      error: e.message || "Error al obtener la nómina de agentes.",
      agents: [],
      totalCount: 0,
      periods: [],
      activePeriod: "",
      empresas: [],
    };
  }
}

export async function importAgentsFromExcel(formData: FormData) {
  try {
    const file = formData.get("file") as File;
    const replaceExisting = formData.get("replaceExisting") === "true";
    let rawPeriod = (formData.get("period") as string)?.trim() || new Date().toISOString().substring(0, 7);
    let periodDate: Date;

    if (rawPeriod.includes("/")) {
      const [m, y] = rawPeriod.split("/");
      periodDate = new Date(`${y}-${m.padStart(2, "0")}-01T00:00:00.000Z`);
    } else if (rawPeriod.length === 7) {
      // "YYYY-MM"
      periodDate = new Date(`${rawPeriod}-01T00:00:00.000Z`);
    } else {
      periodDate = new Date(rawPeriod);
    }

    const periodStr = `${String(periodDate.getUTCMonth() + 1).padStart(2, "0")}/${periodDate.getUTCFullYear()}`;

    if (!file) {
      return { error: "No se seleccionó ningún archivo." };
    }

    // Check if there are already records in DB for this period
    const existingCount = await prisma.imPersonalMsp.count({
      where: { periodo: periodDate },
    });

    if (existingCount > 0 && !replaceExisting) {
      return {
        exists: true,
        existingCount,
        period: periodStr,
        message: `Ya existen ${existingCount.toLocaleString("es-AR")} agentes registrados para el período ${periodStr}. ¿Desea reemplazar la nómina existente con los datos de esta nueva planilla?`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return { error: "La planilla Excel está vacía o no contiene filas válidas." };
    }

    // Fetch existing empresas in DB to match IDs
    const dbEmpresas = await prisma.empresa.findMany({
      select: { id: true },
    });
    const validEmpresaIds = new Set(dbEmpresas.map((e) => e.id));

    // Prepare records for batch insertion
    const recordsToInsert: {
      periodo: Date;
      idEmpresa: number;
      legajo: string;
      idAgente: number;
      cuil: bigint | null;
      apellidoyNombre: string;
    }[] = [];

    const agentsLegacyToSync: {
      cuil: string;
      nombre: string;
      cargo: string;
      establecimiento: string;
      hospitalId: number;
    }[] = [];

    const seenKeys = new Set<string>();
    let unmatchedEmpresasCount = 0;

    for (const row of rows) {
      // 1. Extract Lugar de Pago / Empresa Code (Column M or similar)
      const lugarPago =
        row["Lugar de Pago_1"] ||
        row["Lugar de Pago"] ||
        row["Establecimiento"] ||
        row["LUGAR DE PAGO"] ||
        "";

      let idEmpresa: number | null = null;

      // Extract number prefix if present, e.g. "3728 - CAPITAL - HOSP..."
      const match = String(lugarPago).match(/^(\d+)/);
      if (match) {
        idEmpresa = parseInt(match[1], 10);
      } else if (typeof row["IdEmpresa"] === "number") {
        idEmpresa = row["IdEmpresa"];
      }

      if (!idEmpresa || !validEmpresaIds.has(idEmpresa)) {
        unmatchedEmpresasCount++;
        continue;
      }

      // 2. Extract Legajo
      const rawLegajo =
        row["Nro. Legajo"] ||
        row["Legajo"] ||
        row["LEGAJO"] ||
        row["Nro_Legajo"] ||
        "";
      const legajo = String(rawLegajo).trim().substring(0, 10);
      if (!legajo) continue;

      // 3. Extract IdAgente & Apellido y Nombre from "Agente" column (structure: "id - nombre agente")
      const rawAgente = String(
        row["Agente"] ||
        row["Agente_1"] ||
        row["APELLIDO Y NOMBRE"] ||
        row["Nombre"] ||
        ""
      ).trim();

      let idAgente: number = 0;
      let nombre = rawAgente;

      const matchAgentePrefix = rawAgente.match(/^\(?\s*(\d+)\s*\)?\s*[-–—:]\s*(.*)$/);
      if (matchAgentePrefix) {
        idAgente = parseInt(matchAgentePrefix[1], 10);
        nombre = (matchAgentePrefix[2] || "").trim() || rawAgente;
      } else {
        const matchLeadingDigits = rawAgente.match(/^(\d+)\s+(.+)$/);
        if (matchLeadingDigits) {
          idAgente = parseInt(matchLeadingDigits[1], 10);
          nombre = matchLeadingDigits[2].trim();
        } else if (typeof row["IdAgente"] === "number") {
          idAgente = row["IdAgente"];
        } else if (row["Puesto Laboral"] && !isNaN(parseInt(row["Puesto Laboral"], 10))) {
          idAgente = parseInt(row["Puesto Laboral"], 10);
        } else if (legajo && !isNaN(parseInt(legajo, 10))) {
          idAgente = parseInt(legajo, 10);
        }
      }

      // Validate 32-bit integer boundary for SQL Server 'int'
      if (isNaN(idAgente) || idAgente > 2147483647 || idAgente < 0) {
        idAgente = 0;
      }

      // 4. Extract CUIL (11 digits, stored as BigInt)
      let rawCuil =
        row["CUIL"] ||
        row["Cuil"] ||
        row["cuil"] ||
        row["C.U.I.L."] ||
        row["C.U.I.L"] ||
        row["DNI"] ||
        row["Dni"] ||
        row["Nro. Documento"] ||
        row["Documento"] ||
        "";

      if (!rawCuil) {
        // Case-insensitive fallback for column key containing cuil
        const cuilKey = Object.keys(row).find((k) => {
          const lk = k.toLowerCase().trim();
          return lk.includes("cuil") || lk.includes("c.u.i.l");
        });
        if (cuilKey) {
          rawCuil = row[cuilKey];
        }
      }
      
      const cleanCuil = String(rawCuil || "").replace(/[^\d]/g, "");
      let cuilBigInt: bigint | null = null;

      if (cleanCuil.length > 0) {
        try {
          cuilBigInt = BigInt(cleanCuil);
        } catch {
          cuilBigInt = null;
        }
      }

      // Avoid duplicates for composite primary key (Periodo, IdEmpresa, Legago)
      const key = `${idEmpresa}_${legajo}_${periodDate.toISOString().split("T")[0]}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      recordsToInsert.push({
        periodo: periodDate,
        idEmpresa,
        legajo,
        idAgente,
        cuil: cuilBigInt,
        apellidoyNombre: nombre.substring(0, 300),
      });

      // Also prepare legacy Agent sync for liquidations
      agentsLegacyToSync.push({
        cuil: cleanCuil,
        nombre: nombre.substring(0, 200),
        cargo: cleanCuil ? `CUIL ${cleanCuil}` : `ID ${idAgente}`,
        establecimiento: String(lugarPago).substring(0, 200),
        hospitalId: idEmpresa,
      });
    }

    if (recordsToInsert.length === 0) {
      return {
        error: "No se encontraron filas con códigos de empresa válidos para importar.",
      };
    }

    // Atomic transaction: if insertion fails, the deletion is rolled back
    await prisma.$transaction(async (tx) => {
      if (replaceExisting && existingCount > 0) {
        await tx.imPersonalMsp.deleteMany({
          where: { periodo: periodDate },
        });
      }

      const chunkSize = 1000;
      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize);
        await tx.imPersonalMsp.createMany({
          data: chunk,
        });
      }
    });

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard/hospital-portal");
    revalidatePath("/dashboard/liquidations");

    return {
      success: true,
      count: recordsToInsert.length,
      unmatched: unmatchedEmpresasCount,
      period: periodStr,
      replaced: replaceExisting && existingCount > 0,
    };
  } catch (e: any) {
    console.error("Error importing agents from Excel:", e);
    return { error: e.message || "Error al procesar e importar el archivo Excel." };
  }
}
