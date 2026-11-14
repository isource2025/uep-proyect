import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin } from "@/lib/constants";
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
  const isAdmin = isUserAdmin((session?.user as any)?.role);
  const resolvedParams = searchParams ? await searchParams : undefined;
  const parsedHighlight = resolvedParams?.highlight ? parseInt(resolvedParams.highlight, 10) : NaN;
  const initialHighlightId = !isNaN(parsedHighlight) && parsedHighlight > 0 ? parsedHighlight : null;
  const data = await fetchLiquidationData();

  return (
    <LiquidationsClientPage
      initialData={serializeData(data)}
      isAdmin={isAdmin}
      initialHighlightId={initialHighlightId}
    />
  );
}
