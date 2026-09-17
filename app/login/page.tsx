import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Si el usuario ya está autenticado y activo, redirigir a su panel correspondiente
  if (session && (session.user as any).estado !== 0) {
    const user = session.user as any;
    if (user.role !== "1" && user.hospitalId) {
      redirect("/dashboard/hospital-portal");
    }
    redirect("/dashboard");
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  );
}
