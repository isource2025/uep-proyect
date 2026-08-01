import { notFound } from "next/navigation";
import { fetchLiquidationById } from "../actions";
import LiquidationDetailClient from "./liquidation-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiquidationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const liqId = parseInt(id, 10);
  if (isNaN(liqId)) {
    notFound();
  }

  const liquidation = await fetchLiquidationById(liqId);
  if (!liquidation) {
    notFound();
  }

  return <LiquidationDetailClient liquidation={liquidation} />;
}
