import { cleanCuit } from "@/lib/hospital-mapping";

export interface FilterHospitalLiquidationOptions {
  hospitalCuilSet?: Set<string>;
  hospitalName?: string;
  hospitalEmpresaId?: number;
}

/**
 * Filtra una liquidación completa para exponer exclusivamente los comprobantes,
 * distribuciones y totales correspondientes al hospital identificado por su CUIT.
 * Opera en modo fail-closed: si el CUIT es inválido o vacío, vacía detalles y totales.
 */
export function filterLiquidationForHospital<T extends Record<string, any>>(
  liq: T,
  hospitalCuit: string,
  options: FilterHospitalLiquidationOptions = {}
): T & {
  hospitalScopeName?: string;
  hospitalScopeCuit: string;
} {
  const targetCuit = cleanCuit(hospitalCuit);
  const { hospitalCuilSet, hospitalName, hospitalEmpresaId } = options;

  const matchesTargetCuit = (raw: any): boolean => {
    const c = cleanCuit(raw);
    return Boolean(targetCuit && c && c === targetCuit);
  };

  const filteredDetails = (liq.details || []).filter((d: any) =>
    matchesTargetCuit(d.cuit || d.hospital?.cuit || d.compra?.hospital?.cuit)
  );

  const filteredPersonalDistributions = (liq.personalDistributions || []).filter((p: any) => {
    const pEmpresaId = Number(p.idEmpresa || 0);
    if (pEmpresaId > 0) {
      if (hospitalEmpresaId && pEmpresaId === hospitalEmpresaId) return true;
      return matchesTargetCuit(p.hospitalCuit);
    }
    // Registros legados sin IdEmpresa: cruce por hospitalCuit o nómina del efector
    if (matchesTargetCuit(p.hospitalCuit)) return true;
    if (hospitalCuilSet && hospitalCuilSet.size > 0) {
      const cleanAgentCuil = String(p.cuil || p.idAgente || "").replace(/\D/g, "");
      return Boolean(cleanAgentCuil && hospitalCuilSet.has(cleanAgentCuil));
    }
    return false;
  });

  const filteredDistributions = (liq.distributions || []).filter((d: any) =>
    matchesTargetCuit(d.agent?.hospital?.cuit)
  );

  const sumDetails = (field: string): number =>
    filteredDetails.reduce((sum: number, d: any) => sum + (Number(d[field]) || 0), 0);

  const totalFacturado = sumDetails("totalFacturado");
  const creditos = sumDetails("creditos");
  const debitos = sumDetails("debitos");
  const ajustesOs = sumDetails("ajustesOs");
  const pendientesCobro = sumDetails("pendientesCobro");
  const pagosParcialesAnteriores = sumDetails("pagosParcialesAnteriores");
  const brutoAPagar = sumDetails("brutoAPagar");
  const ga = sumDetails("ga");
  const ajusteRecupero = sumDetails("ajusteRecupero");
  const netoAPagar = sumDetails("netoAPagar");

  const personalHonorarios = filteredPersonalDistributions.reduce(
    (sum: number, p: any) => sum + (Number(p.honorarios) || 0),
    0
  );
  const personalSobreasignacion = filteredPersonalDistributions.reduce(
    (sum: number, p: any) => sum + (Number(p.sobreasignacion) || 0),
    0
  );

  const totalHonorarios =
    filteredPersonalDistributions.length > 0
      ? personalHonorarios
      : filteredDistributions.reduce((sum: number, d: any) => sum + (Number(d.honorarios) || 0), 0);

  const totalSobreasignaciones =
    filteredPersonalDistributions.length > 0
      ? personalSobreasignacion
      : filteredDistributions.reduce((sum: number, d: any) => sum + (Number(d.sobreasignaciones) || 0), 0);

  const totalGastos = Math.max(0, netoAPagar - (totalHonorarios + totalSobreasignaciones));
  const totalDistribuido = totalHonorarios + totalSobreasignaciones + totalGastos;

  const resolvedHospitalName =
    hospitalName?.trim() ||
    filteredDetails[0]?.prestadorNombre?.trim() ||
    filteredDetails[0]?.hospital?.nombre?.trim() ||
    undefined;

  return {
    ...liq,
    details: filteredDetails,
    personalDistributions: filteredPersonalDistributions,
    distributions: filteredDistributions,
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
    // Nunca exponer snapshots globales (contienen todos los hospitales de la liquidación)
    reportePendienteUrl: null,
    reportePendienteFileName: null,
    reporteDistribuidoUrl: null,
    reporteDistribuidoFileName: null,
    // Nunca exponer operador liquidador ni observaciones internas de UEP a usuarios de hospitales
    createdByName: null,
    observaciones: null,
    hospitalScopeName: resolvedHospitalName,
    hospitalScopeCuit: targetCuit,
  };
}
