"use client";

import { Building2 } from "lucide-react";
import { LiquidationsTable } from "@/components/liquidations-table";

interface HospitalPortalClientProps {
  hospital: any;
  hospitalId: number;
  initialLiquidations: any[];
  agents: any[];
  onAddAttachment: (formData: FormData) => Promise<void>;
}

export default function HospitalPortalClient({
  hospital,
  hospitalId,
  initialLiquidations,
  agents,
  onAddAttachment,
}: HospitalPortalClientProps) {
  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
          <Building2 className="h-7 w-7" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{hospital.nombre}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Portal del Hospital / CAPS. Visualice liquidaciones de su establecimiento, distribuya honorarios y adjunte comprobantes.
        </p>
      </div>

      {/* Dynamic Centralized Liquidations Table */}
      <LiquidationsTable
        liquidations={initialLiquidations}
        isHospitalUser={true}
        hospitalId={hospitalId}
        hospitalName={hospital.nombre}
        agents={agents}
        onAddAttachment={onAddAttachment}
      />
    </div>
  );
}
