"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { LiquidationsTable } from "@/components/liquidations-table";

interface HospitalPortalClientProps {
  hospital: any;
  hospitalId: number;
  initialLiquidations: any[];
  agents: any[];
  onAddAttachment: (formData: FormData) => Promise<void>;
  initialHighlightId?: number | null;
}

export default function HospitalPortalClient({
  hospital,
  hospitalId,
  initialLiquidations,
  agents,
  onAddAttachment,
  initialHighlightId = null,
}: HospitalPortalClientProps) {
  const hospitalDisplayName = hospital?.descripcion?.trim() || hospital?.nombre?.trim() || `Hospital ${hospitalId}`;
  const [highlightedId, setHighlightedId] = useState<number | null>(initialHighlightId);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusLiquidationRow = useCallback((targetId: number) => {
    setHighlightedId(targetId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setTimeout(() => {
      const rowEl = document.getElementById(`liquidation-row-${targetId}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedId((prev) => (prev === targetId ? null : prev));
    }, 4500);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get("highlight");
    const parsedFromUrl = paramId ? parseInt(paramId, 10) : NaN;
    const targetId = initialHighlightId ?? (!isNaN(parsedFromUrl) && parsedFromUrl > 0 ? parsedFromUrl : null);

    if (targetId) {
      focusLiquidationRow(targetId);
      if (params.has("highlight")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [initialHighlightId, focusLiquidationRow]);

  useEffect(() => {
    const onHighlightEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ liquidationId?: number }>;
      const targetId = customEvent.detail?.liquidationId;
      if (typeof targetId === "number" && targetId > 0) {
        focusLiquidationRow(targetId);
        if (window.location.search.includes("highlight=")) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    };

    window.addEventListener("uep:highlight-liquidation", onHighlightEvent);
    return () => {
      window.removeEventListener("uep:highlight-liquidation", onHighlightEvent);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [focusLiquidationRow]);

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
          <Building2 className="h-7 w-7" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{hospitalDisplayName}</h1>
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
        hospitalName={hospitalDisplayName}
        hospitalCuit={hospital?.cuit ? String(hospital.cuit) : undefined}
        agents={agents}
        onAddAttachment={onAddAttachment}
        highlightedId={highlightedId}
      />
    </div>
  );
}
