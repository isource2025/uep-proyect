import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session && (session.user as any).estado !== 0) {
    const user = session.user as any;
    const userRoles = String(user?.role || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const isAdmin = userRoles.includes("1");
    if (!isAdmin && user.hospitalId) {
      redirect("/dashboard/hospital-portal");
    }
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
