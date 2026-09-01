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
      where.OR = [
        { apellidoyNombre: { contains: q } },
        { legajo: { contains: q } },
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
      idAgente: ag.idAgente,
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
      idAgente: number | null;
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
        // Fallback: If not found, use a default hospital or skip
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

      // 3. Extract Apellido y Nombre
      const nombre = (
        row["Agente"] ||
        row["Agente_1"] ||
        row["APELLIDO Y NOMBRE"] ||
        row["Nombre"] ||
        ""
      ).trim();

      // 4. Extract Puesto Laboral / IdAgente
      const puestoRaw = row["Puesto Laboral"] || row["Puesto laboral"] || row["IdAgente"];
      let idAgente: number | null = null;
      if (puestoRaw !== undefined && puestoRaw !== null) {
        const pNum = parseInt(String(puestoRaw).replace(/[^\d]/g, ""), 10);
        if (!isNaN(pNum)) idAgente = pNum;
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
        apellidoyNombre: nombre.substring(0, 300),
      });

      // Also prepare legacy Agent sync for liquidations
      const rawCuil = row["CUIL"] ? String(row["CUIL"]).replace(/[^\d]/g, "") : "";
      agentsLegacyToSync.push({
        cuil: rawCuil,
        nombre: nombre.substring(0, 200),
        cargo: idAgente ? String(idAgente) : "PROFESIONAL",
        establecimiento: String(lugarPago).substring(0, 200),
        hospitalId: idEmpresa,
      });
    }

    if (recordsToInsert.length === 0) {
      return {
        error: "No se encontraron filas con códigos de empresa válidos para importar.",
      };
    }

    // 1. Fetch existing keys for this period in DB to prevent duplicate primary key collisions
    const existingRows = await prisma.imPersonalMsp.findMany({
      where: {
        periodo: periodDate,
      },
      select: {
        idEmpresa: true,
        legajo: true,
      },
    });

    const existingKeys = new Set(
      existingRows.map((r) => `${r.idEmpresa}_${r.legajo.trim()}`)
    );

    const newRecords = recordsToInsert.filter(
      (r) => !existingKeys.has(`${r.idEmpresa}_${r.legajo}`)
    );

    // 2. High-performance batch insertion in chunks of 1000
    const chunkSize = 1000;
    for (let i = 0; i < newRecords.length; i += chunkSize) {
      const chunk = newRecords.slice(i, i + chunkSize);
      await prisma.imPersonalMsp.createMany({
        data: chunk,
      });
    }

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard/hospital-portal");
    revalidatePath("/dashboard/liquidations");

    return {
      success: true,
      count: newRecords.length > 0 ? newRecords.length : recordsToInsert.length,
      unmatched: unmatchedEmpresasCount,
      period: periodStr,
    };
  } catch (e: any) {
    console.error("Error importing agents from Excel:", e);
    return { error: e.message || "Error al procesar e importar el archivo Excel." };
  }
}
