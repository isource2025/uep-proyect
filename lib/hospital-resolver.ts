import { prisma } from "@/lib/prisma";
import { cleanCuit, PROVEEDOR_TO_EMPRESA_MAP } from "@/lib/hospital-mapping";

export const UEP_EMPRESA_ID = 1;
export const UEP_DEFAULT_CUIT = "30707307591";

// Mapa inverso candidato EMPRESA -> PROVEEDOR construido a partir de PROVEEDOR_TO_EMPRESA_MAP.
// Nunca se utiliza sin verificar explícitamente la igualdad de CUIT entre ambas tablas.
const EMPRESA_TO_PROVEEDOR_CANDIDATES = new Map<number, number[]>();
for (const [provIdStr, empId] of Object.entries(PROVEEDOR_TO_EMPRESA_MAP)) {
  const provId = Number(provIdStr);
  const existing = EMPRESA_TO_PROVEEDOR_CANDIDATES.get(empId) ?? [];
  existing.push(provId);
  EMPRESA_TO_PROVEEDOR_CANDIDATES.set(empId, existing);
}

export interface ResolvedEmpresaResult {
  empresaId: number;
  cuit: string;
  empresaNombre: string;
  proveedorNombre: string;
}

export interface ResolvedProveedorResult {
  proveedorId: number;
  cuit: string;
  proveedorNombre: string;
  empresaNombre: string;
}

export interface HospitalWorkAssignment {
  empresaId: number | null;
  proveedorId: number | null;
  cuit: string;
  isSedeCentralUep: boolean;
}

/**
 * Obtiene el CUIT oficial de Sede Central UEP desde EMPRESAS (IDEMPRESA = 1)
 * con respaldo en UEP_DEFAULT_CUIT.
 */
export async function getSedeCentralUepCuit(): Promise<string> {
  const uepEmpresa = await prisma.empresa.findUnique({
    where: { id: UEP_EMPRESA_ID },
    select: { cuit: true },
  });
  return cleanCuit(uepEmpresa?.cuit) || UEP_DEFAULT_CUIT;
}

/**
 * Resuelve la Empresa (EMPRESAS.IDEMPRESA) correspondiente a un Proveedor (PROVEEDORES.IDPROVEEDOR),
 * validando siempre la coincidencia exacta por CUIT normalizado (11 dígitos).
 */
export async function resolveEmpresaFromProveedorId(
  proveedorId: number
): Promise<ResolvedEmpresaResult | null> {
  if (!Number.isFinite(proveedorId) || proveedorId <= 0) return null;

  const proveedor = await prisma.proveedor.findUnique({
    where: { id: proveedorId },
    select: { id: true, cuit: true, nombre: true },
  });

  const provCuit = cleanCuit(proveedor?.cuit);
  if (!proveedor || !provCuit) return null;

  const candidateEmpresaId = PROVEEDOR_TO_EMPRESA_MAP[proveedorId];
  if (candidateEmpresaId && candidateEmpresaId !== UEP_EMPRESA_ID) {
    const candidateEmp = await prisma.empresa.findUnique({
      where: { id: candidateEmpresaId },
      select: { id: true, cuit: true, descripcion: true },
    });
    if (candidateEmp && cleanCuit(candidateEmp.cuit) === provCuit) {
      return {
        empresaId: candidateEmp.id,
        cuit: provCuit,
        empresaNombre: candidateEmp.descripcion?.trim() || "",
        proveedorNombre: proveedor.nombre?.trim() || "",
      };
    }
  }

  const allEmpresas = await prisma.empresa.findMany({
    where: { cuit: { not: null } },
    select: { id: true, cuit: true, descripcion: true },
    orderBy: { id: "asc" },
  });

  const matchedEmp = allEmpresas.find(
    (e) => e.id !== UEP_EMPRESA_ID && cleanCuit(e.cuit) === provCuit
  );
  if (!matchedEmp) return null;

  return {
    empresaId: matchedEmp.id,
    cuit: provCuit,
    empresaNombre: matchedEmp.descripcion?.trim() || "",
    proveedorNombre: proveedor.nombre?.trim() || "",
  };
}

/**
 * Resuelve el Proveedor (PROVEEDORES.IDPROVEEDOR) correspondiente a una Empresa (EMPRESAS.IDEMPRESA),
 * validando siempre la coincidencia exacta por CUIT normalizado (11 dígitos).
 */
export async function resolveProveedorFromEmpresaId(
  empresaId: number
): Promise<ResolvedProveedorResult | null> {
  if (!Number.isFinite(empresaId) || empresaId <= 0 || empresaId === UEP_EMPRESA_ID) {
    return null;
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, cuit: true, descripcion: true },
  });

  const empCuit = cleanCuit(empresa?.cuit);
  if (!empresa || !empCuit) return null;

  const candidateProvIds = EMPRESA_TO_PROVEEDOR_CANDIDATES.get(empresaId) ?? [];
  for (const provId of candidateProvIds) {
    const candidateProv = await prisma.proveedor.findUnique({
      where: { id: provId },
      select: { id: true, cuit: true, nombre: true },
    });
    if (candidateProv && cleanCuit(candidateProv.cuit) === empCuit) {
      return {
        proveedorId: candidateProv.id,
        cuit: empCuit,
        proveedorNombre: candidateProv.nombre?.trim() || "",
        empresaNombre: empresa.descripcion?.trim() || "",
      };
    }
  }

  const allProveedores = await prisma.proveedor.findMany({
    where: { cuit: { not: null } },
    select: { id: true, cuit: true, nombre: true },
    orderBy: { id: "asc" },
  });

  const matchedProv = allProveedores.find((p) => cleanCuit(p.cuit) === empCuit);
  if (!matchedProv) return null;

  return {
    proveedorId: matchedProv.id,
    cuit: empCuit,
    proveedorNombre: matchedProv.nombre?.trim() || "",
    empresaNombre: empresa.descripcion?.trim() || "",
  };
}

/**
 * Resuelve los valores persistibles en imPersonal (hospitalId = IDPROVEEDOR, cuit = CUIT del lugar de trabajo)
 * y en imPersonalEmpresas (idEmpresa = IDEMPRESA) a partir de la sede seleccionada.
 * Para Sede Central UEP (null o IDEMPRESA = 1): hospitalId = null, empresaId = null, cuit = CUIT Sede Central UEP.
 */
export async function resolveHospitalWorkAssignment(
  empresaIdRaw: number | null | undefined
): Promise<HospitalWorkAssignment> {
  if (!empresaIdRaw || !Number.isFinite(empresaIdRaw) || empresaIdRaw === UEP_EMPRESA_ID) {
    return {
      empresaId: null,
      proveedorId: null,
      cuit: await getSedeCentralUepCuit(),
      isSedeCentralUep: true,
    };
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaIdRaw },
    select: { id: true, cuit: true },
  });

  if (!empresa) {
    return {
      empresaId: null,
      proveedorId: null,
      cuit: await getSedeCentralUepCuit(),
      isSedeCentralUep: true,
    };
  }

  const empCuit = cleanCuit(empresa.cuit);
  const proveedorMatch = empCuit ? await resolveProveedorFromEmpresaId(empresa.id) : null;

  return {
    empresaId: empresa.id,
    proveedorId: proveedorMatch?.proveedorId ?? null,
    cuit: proveedorMatch?.cuit || empCuit,
    isSedeCentralUep: false,
  };
}

async function findEmpresaIdByCuit(cuit: string): Promise<number | undefined> {
  const normalized = cleanCuit(cuit);
  if (!normalized || normalized === UEP_DEFAULT_CUIT) return undefined;

  const uepCuit = await getSedeCentralUepCuit();
  if (normalized === uepCuit) return undefined;

  const empresas = await prisma.empresa.findMany({
    where: { cuit: { not: null } },
    select: { id: true, cuit: true },
    orderBy: { id: "asc" },
  });

  return empresas.find((e) => e.id !== UEP_EMPRESA_ID && cleanCuit(e.cuit) === normalized)?.id;
}

/**
 * Resuelve el IDEMPRESA efectivo de un usuario para aislamiento en el Portal del Hospital:
 * 1. Si imPersonal.hospitalId es null y no tiene vínculo válido en imPersonalEmpresas -> Sede Central UEP (undefined).
 * 2. Si tiene vínculo en imPersonalEmpresas, valida coincidencia de CUIT con imPersonal.CUIT (cuando esté informado).
 * 3. Resuelve imPersonal.hospitalId (IDPROVEEDOR) -> EMPRESA validando PROVEEDORES.NRO_CUIT === EMPRESAS.Nro_CUIT
 *    y coherencia con imPersonal.CUIT.
 */
export async function resolveUserEmpresaId(user: {
  id?: unknown;
  hospitalId?: unknown;
  cuit?: unknown;
}): Promise<number | undefined> {
  const userId = user.id != null ? Number(user.id) : NaN;
  const rawHospitalId = user.hospitalId != null ? Number(user.hospitalId) : NaN;
  const userCuit = cleanCuit(typeof user.cuit === "string" ? user.cuit : null);

  if (Number.isFinite(userId) && userId > 0) {
    const link = await prisma.imPersonalEmpresas.findFirst({
      where: { idPersonal: userId },
      select: {
        idEmpresa: true,
        empresa: { select: { id: true, cuit: true } },
      },
      orderBy: { idEmpresa: "asc" },
    });

    if (link && link.idEmpresa !== UEP_EMPRESA_ID) {
      const linkCuit = cleanCuit(link.empresa?.cuit);
      if (!userCuit || (linkCuit && linkCuit === userCuit)) {
        return link.idEmpresa;
      }
      const empByUserCuit = await findEmpresaIdByCuit(userCuit);
      if (empByUserCuit) return empByUserCuit;
    }
  }

  // Sede Central UEP: hospitalId = null y sin vínculo en imPersonalEmpresas => sin restricción hospitalaria
  if (!Number.isFinite(rawHospitalId) || rawHospitalId <= 0) {
    return undefined;
  }

  const resolvedFromProv = await resolveEmpresaFromProveedorId(rawHospitalId);
  if (resolvedFromProv) {
    if (!userCuit || resolvedFromProv.cuit === userCuit) {
      return resolvedFromProv.empresaId;
    }
    // Si imPersonal.CUIT difiere del proveedor guardado (ej. dato legado), priorizar el CUIT validado en EMPRESAS
    const empByUserCuit = await findEmpresaIdByCuit(userCuit);
    if (empByUserCuit) return empByUserCuit;
    return undefined;
  }

  // Fallback seguro si hospitalId aún guardara un IDEMPRESA legado: exigir coincidencia exacta por CUIT
  if (userCuit) {
    const legacyEmpresa = await prisma.empresa.findUnique({
      where: { id: rawHospitalId },
      select: { id: true, cuit: true },
    });
    if (
      legacyEmpresa &&
      legacyEmpresa.id !== UEP_EMPRESA_ID &&
      cleanCuit(legacyEmpresa.cuit) === userCuit
    ) {
      return legacyEmpresa.id;
    }
    return await findEmpresaIdByCuit(userCuit);
  }

  return undefined;
}

export interface HospitalNotificationRecipient {
  id: string;
  name: string;
  email: string;
  cuit: string;
  hospitalName: string;
  source: "empresa";
  userName?: string;
}

/**
 * Resuelve exclusivamente los correos corporativos de hospitales cargados en EMPRESAS.EMail
 * mediante cruce estricto por CUIT normalizado (sin mezclar con imPersonal.email, que se usa
 * únicamente para acceso al sistema).
 */
export async function resolveHospitalRecipientsByCuits(
  targetCuits: string[]
): Promise<HospitalNotificationRecipient[]> {
  const uepCuit = await getSedeCentralUepCuit();
  const targetSet = new Set(
    targetCuits
      .map((c) => cleanCuit(c))
      .filter((c) => Boolean(c) && c !== UEP_DEFAULT_CUIT && c !== uepCuit)
  );

  if (targetSet.size === 0) return [];

  const allEmpresasWithCuit = await prisma.empresa.findMany({
    where: {
      id: { not: UEP_EMPRESA_ID },
      cuit: { not: null },
    },
    select: { id: true, descripcion: true, cuit: true, email: true },
    orderBy: { id: "asc" },
  });

  const results: HospitalNotificationRecipient[] = [];
  const seenEmails = new Set<string>();

  for (const emp of allEmpresasWithCuit) {
    const empCuit = cleanCuit(emp.cuit);
    if (!empCuit || !targetSet.has(empCuit)) continue;

    const empEmail = emp.email?.trim() || "";
    if (!empEmail.includes("@")) continue;

    const emailKey = empEmail.toLowerCase();
    if (seenEmails.has(emailKey)) continue;
    seenEmails.add(emailKey);

    const hospitalName = emp.descripcion?.trim() || `Hospital ${emp.id}`;
    results.push({
      id: `empresa-${emp.id}`,
      name: hospitalName,
      email: empEmail,
      cuit: empCuit,
      hospitalName,
      source: "empresa",
    });
  }

  return results;
}
