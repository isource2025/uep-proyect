import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isUserAdmin } from "@/lib/constants";
import { fetchLiquidationData } from "./actions";
import { serializeData } from "@/lib/utils";
import LiquidationsClientPage from "./liquidations-client";

export const revalidate = 0;

export default async function LiquidationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAdmin = isUserAdmin((session?.user as any)?.role);
  const data = await fetchLiquidationData();

  return (
    <LiquidationsClientPage
      initialData={serializeData(data)}
      isAdmin={isAdmin}
    />
  );
}
