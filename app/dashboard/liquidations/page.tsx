import { fetchLiquidationData } from "./actions";
import { serializeData } from "@/lib/utils";
import LiquidationsClientPage from "./liquidations-client";

export const revalidate = 0;

export default async function LiquidationsPage() {
  const data = await fetchLiquidationData();
  return <LiquidationsClientPage initialData={serializeData(data)} />;
}
