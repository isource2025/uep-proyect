import { fetchLiquidationData } from "./actions";
import LiquidationsClientPage from "./liquidations-client";

export const revalidate = 0;

export default async function LiquidationsPage() {
  const data = await fetchLiquidationData();
  return <LiquidationsClientPage initialData={data} />;
}
