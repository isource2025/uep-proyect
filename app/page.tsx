import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    const user = session.user as any;
    if (user && user.role !== "1" && user.hospitalId) {
      redirect("/dashboard/hospital-portal");
    }
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
