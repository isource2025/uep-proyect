import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin, isUserHospital, isUserReadOnlyAuditor, isUserUepOperator } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
import { fetchLiquidationData } from "./actions";
import { serializeData } from "@/lib/utils";
import LiquidationsClientPage from "./liquidations-client";

export const revalidate = 0;

export default async function LiquidationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ highlight?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionUser = session?.user as any;
  const rawRole = String(sessionUser?.role || "");
  const isAdmin = isUserAdmin(rawRole);
  const resolvedEmpresaId = sessionUser ? await resolveUserEmpresaId(sessionUser) : undefined;
  const isHospitalUser = !isAdmin && isUserHospital(rawRole, resolvedEmpresaId ?? sessionUser?.hospitalId);
  const isReadOnlyAuditorOnly = isUserReadOnlyAuditor(rawRole);
  const canDownloadResumen = Boolean(sessionUser && !isHospitalUser && isUserUepOperator(rawRole));
  const canAssign = Boolean(sessionUser && !isReadOnlyAuditorOnly);
  const currentUserName =
    String(sessionUser?.name || "").trim() ||
    String(sessionUser?.email || "").trim() ||
    String(sessionUser?.operador || "").trim();
  const resolvedParams = searchParams ? await searchParams : undefined;
  const parsedHighlight = resolvedParams?.highlight ? parseInt(resolvedParams.highlight, 10) : NaN;
  const initialHighlightId = !isNaN(parsedHighlight) && parsedHighlight > 0 ? parsedHighlight : null;
  const data = await fetchLiquidationData();

  return (
    <LiquidationsClientPage
      initialData={serializeData(data)}
      isAdmin={isAdmin}
      isReadOnlyAuditor={isReadOnlyAuditorOnly}
      canAssign={canAssign}
      canDownloadResumen={canDownloadResumen}
      currentUserName={currentUserName}
      initialHighlightId={initialHighlightId}
    />
  );
}
