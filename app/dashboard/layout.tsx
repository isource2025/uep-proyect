import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950 font-sans">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          user={{
            name: session.user.name,
            email: session.user.email,
            role: (session.user as any).role === "1" ? "ADMIN" : (session.user as any).role === "2" ? "MEDICO" : "OPERATOR",
          }}
        />
        <main className="flex-1 overflow-y-auto bg-background p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
