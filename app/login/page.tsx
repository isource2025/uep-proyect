import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    const user = session.user as any;
    if (user.role !== "1" && user.hospitalId) {
      redirect("/dashboard/hospital-portal");
    }
    redirect("/dashboard");
  }

  return <LoginForm />;
}
