import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConsolidationClient } from "./consolidation-client";

export const revalidate = 0;

export default async function ConsolidationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as any;

  if (!session || user?.role === "2") {
    // Only Admins (role "1") and Operators can access consolidation reports
    redirect("/dashboard");
  }

  // Fetch all PeriodoIVA entries to populate selector
  const periods = await prisma.periodoIVA.findMany({
    where: { iva: "V" },
    orderBy: [
      { anio: "desc" },
      { mes: "desc" },
    ],
  });

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Consolidación y Cierre</h1>
        <p className="text-sm text-muted-foreground">
          Módulo de consolidación y reportes para envío a SISPER y Tesorería.
        </p>
      </div>

      <ConsolidationClient periods={periods} />
    </div>
  );
}
