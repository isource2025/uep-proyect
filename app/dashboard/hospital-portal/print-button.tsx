"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <Button
      onClick={() => window.print()}
      size="sm"
      className="bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-white font-semibold gap-1.5 h-8 text-xs cursor-pointer"
    >
      <Download className="h-3.5 w-3.5" />
      Imprimir Reporte
    </Button>
  );
}
