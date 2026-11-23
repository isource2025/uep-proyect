export type ConvenioTgp = "IOSCOR" | "PAMI" | "RGA" | "OBRAS SOCIALES VARIAS";
export type CtaCteTgp = "131441002" | "131441004";

export interface ConsolidationHospitalSummary {
  key: string;
  hospitalId: number | null;
  cuit: string;
  nombre: string;
  localidad: string;
  totalFacturado: number;
  debitos: number;
  brutoAPagar: number;
  ga: number;
  netoAPagar: number;
  honorarios: number;
  sobreasignacion: number;
  sueldos: number;
  gastosDisponible: number;
}

export interface ConsolidationAgentRow {
  liquidationId: number;
  liquidationLabel: string;
  expediente: string;
  obraSocialSigla: string;
  obraSocialNombre: string;
  dni: string;
  cuil: string;
  nombre: string;
  establecimiento: string;
  establecimientoCuit: string;
  concepto: "Honorarios Médicos" | "Sobreasignación al Personal";
  importe: number;
}

export interface ConsolidationLiquidationItem {
  id: number;
  code: string;
  displayLabel: string;
  status: string;
  mesCarga: string;
  periodAnio: number;
  periodMes: number;
  expediente: string;
  normaLegal: string;
  createdByName: string;
  updatedAt: string;
  rcNumber: string;
  rcGrupoCbte: number | null;
  clienteId: number | null;
  clienteNombre: string;
  clienteSigla: string;
  convenio: ConvenioTgp;
  ctaCteTgp: CtaCteTgp;
  detailsCount: number;
  totalFacturado: number;
  debitos: number;
  brutoAPagar: number;
  ga: number;
  netoAPagar: number;
  totalHonorarios: number;
  totalSobreasignaciones: number;
  totalSueldos: number;
  totalGastosDisponible: number;
  hospitals: ConsolidationHospitalSummary[];
  agentRows: ConsolidationAgentRow[];
  warnings: string[];
}

export interface ConsolidationBatchData {
  id: number | null; // null cuando es borrador en curso
  anio: number;
  mes: number;
  descripcion: string;
  observaciones: string | null;
  cerradaPorNombre: string | null;
  cerradaAt: string | null;
  liquidacionesCount: number;
  totalFacturado: number;
  totalBruto: number;
  totalGa: number;
  totalNeto: number;
  totalHonorarios: number;
  totalSobreasignaciones: number;
  totalSueldos: number;
  totalGastosDisponible: number;
  cta131441002Sueldos: number;
  cta131441004Sueldos: number;
  liquidaciones: ConsolidationLiquidationItem[];
}

export interface ConsolidationWorkspaceData {
  pendingLiquidations: ConsolidationLiquidationItem[];
  inProgressCounts: {
    pendiente: number;
    notificado: number;
    enProceso: number;
    rectificada: number;
    total: number;
  };
  closedBatches: ConsolidationBatchData[];
  availableYears: number[];
}
