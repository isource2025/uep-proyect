import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardProvider } from "@/components/dashboard-context";

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

  if ((session.user as any).estado === 0) {
    redirect("/login?error=inactive");
  }

  return (
    <DashboardProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950 font-sans">
        <DashboardSidebar user={session.user as any} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <DashboardHeader
            user={{
              name: session.user.name,
              email: session.user.email,
              role:
                (session.user as any).role === "1"
                  ? "ADMIN"
                  : (session.user as any).role === "2"
                  ? "MEDICO"
                  : (session.user as any).role === "4" || (session.user as any).hospitalId
                  ? "HOSPITAL"
                  : "OPERATOR",
            }}
          />
          <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 md:p-8 dark:bg-[#171717]">
            {children}
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}
