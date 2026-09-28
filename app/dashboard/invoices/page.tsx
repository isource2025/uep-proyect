import { fetchPendingUnifications, fetchUnifiedInvoices } from "./actions";
import { serializeData } from "@/lib/utils";
import InvoicesClientPage from "./invoices-client";

export const revalidate = 0;

export default async function InvoicesPage() {
  const [pending, unifiedResult] = await Promise.all([
    fetchPendingUnifications(),
    fetchUnifiedInvoices(undefined, 1, 10),
  ]);

  return (
    <InvoicesClientPage
      initialPending={serializeData(pending)}
      initialUnified={serializeData(unifiedResult.invoices)}
      initialUnifiedCount={unifiedResult.totalCount}
    />
  );
}
