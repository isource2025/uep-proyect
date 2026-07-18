import { fetchPendingUnifications, fetchUnifiedInvoices } from "./actions";
import InvoicesClientPage from "./invoices-client";

export const revalidate = 0;

export default async function InvoicesPage() {
  const pending = await fetchPendingUnifications();
  const unified = await fetchUnifiedInvoices();

  return <InvoicesClientPage initialPending={pending} initialUnified={unified} />;
}
