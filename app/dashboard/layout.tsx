import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardProvider } from "@/components/dashboard-context";
import { getActivePeriodInfo } from "@/lib/periods";

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

  const userId = parseInt(String(session.user.id), 10);
  const [activePeriod, personalEmpresa] = await Promise.all([
    getActivePeriodInfo(),
    !isNaN(userId)
      ? prisma.imPersonalEmpresas.findFirst({
          where: { idPersonal: userId },
          select: { idEmpresa: true },
        })
      : null,
  ]);

  const resolvedHospitalId = personalEmpresa?.idEmpresa ?? (session.user as any).hospitalId;

  const userRoles = String((session.user as any).role || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const isAdmin = userRoles.includes("1");
  const isMedico = userRoles.includes("2");
  const isHospital = userRoles.includes("4") || Boolean(resolvedHospitalId);

  const displayRole = isAdmin
    ? "ADMIN"
    : isMedico
    ? "MEDICO"
    : isHospital
    ? "HOSPITAL"
    : "OPERADOR";

  return (
    <DashboardProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground selection:bg-emerald-500 selection:text-zinc-950 font-sans">
        <DashboardSidebar
          user={{
            ...(session.user as any),
            hospitalId: resolvedHospitalId,
          }}
        />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <DashboardHeader
            user={{
              name: session.user.name,
              email: session.user.email,
              role: displayRole,
            }}
            activePeriodLabel={activePeriod.label}
          />
          <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 md:p-8 dark:bg-[#171717]">
            {children}
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}
