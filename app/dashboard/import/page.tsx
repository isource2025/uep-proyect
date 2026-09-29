import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isUserAdmin } from "@/lib/constants";
import ImportClient from "./import-client";

export const revalidate = 0;

export default async function ImportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isUserAdmin((session.user as any).role)) {
    redirect("/dashboard");
  }

  return <ImportClient />;
}
