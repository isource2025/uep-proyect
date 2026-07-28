import { fetchPendingUnifications, fetchUnifiedInvoices } from "./actions";
import InvoicesClientPage from "./invoices-client";

export const revalidate = 0;

export default async function InvoicesPage() {
  const [pending, unifiedResult] = await Promise.all([
    fetchPendingUnifications(),
    fetchUnifiedInvoices(undefined, 1, 10),
  ]);

  return (
    <InvoicesClientPage
      initialPending={pending}
      initialUnified={unifiedResult.invoices}
      initialUnifiedCount={unifiedResult.totalCount}
    />
  );
}
