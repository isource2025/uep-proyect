import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConsolidationClient } from "./consolidation-client";
import { fetchConsolidationWorkspaceAction } from "./actions";
import { isUserAdmin, isUserHospital, isUserReadOnlyAuditor, isUserUepOperator } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { ClientRedirect } from "@/components/client-redirect";

export const revalidate = 0;

export default async function ConsolidationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as any;
  const isAdmin = isUserAdmin(user?.role);
  const resolvedEmpresaId = user ? await resolveUserEmpresaId(user) : undefined;
  const isHospitalUser = !isAdmin && isUserHospital(user?.role, resolvedEmpresaId ?? user?.hospitalId);
  const isUepOperator = isUserUepOperator(user?.role);
  const isReadOnlyAuditor = isUserReadOnlyAuditor(user?.role);

  if (!session) {
    redirect("/dashboard");
  }

  if (isHospitalUser) {
    return (
      <ClientRedirect
        to="/dashboard/hospital-portal"
        label="Redirigiendo al Portal del Hospital..."
      />
    );
  }

  if (!isUepOperator) {
    redirect("/dashboard");
  }

  const workspaceRes = await fetchConsolidationWorkspaceAction();
  const initialWorkspace = workspaceRes.data || {
    pendingLiquidations: [],
    inProgressCounts: {
      pendiente: 0,
      notificado: 0,
      enProceso: 0,
      rectificada: 0,
      total: 0,
    },
    closedBatches: [],
    availableYears: [new Date().getFullYear()],
  };

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Consolidación y Reportes TGP
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Bandeja de liquidaciones distribuidas listas para consolidar, generación de planillas oficiales (TGP 6 hojas, SISPER y Tesorería) e historial de cierres mensuales y acumulados anuales.
        </p>
      </div>

      <ConsolidationClient
        initialWorkspace={initialWorkspace}
        initialError={workspaceRes.error}
        canClosePeriod={!isReadOnlyAuditor}
      />
    </div>
  );
}
