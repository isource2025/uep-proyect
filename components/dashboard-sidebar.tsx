"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  CalendarRange,
  UploadCloud,
  Receipt,
  Users,
  Settings,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const user = session?.user as any;

  // An admin (role === "1") is NEVER restricted to a single hospital view
  const isHospitalUser = user?.role !== "1" && user?.hospitalId !== undefined && user?.hospitalId !== null;

  const menuItems = isHospitalUser
    ? [
        {
          name: "Portal Hospital",
          href: "/dashboard/hospital-portal",
          icon: Building2,
        },
      ]
    : [
        {
          name: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          name: "Hospitales",
          href: "/dashboard/hospitals",
          icon: Building2,
        },
        {
          name: "Períodos",
          href: "/dashboard/periods",
          icon: CalendarRange,
        },
        {
          name: "Importar Datos",
          href: "/dashboard/import",
          icon: UploadCloud,
        },
        {
          name: "Liquidaciones",
          href: "/dashboard/liquidations",
          icon: Receipt,
        },
        {
          name: "Usuarios",
          href: "/dashboard/users",
          icon: Users,
        },
        {
          name: "Configuración",
          href: "/dashboard/settings",
          icon: Settings,
        },
      ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card text-muted-foreground">
      {/* Brand Header Link to Dashboard */}
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b border-border px-6 bg-card hover:bg-muted/30 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-zinc-950 font-bold">
          U
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wider text-foreground">UEP PORTAL</span>
          <span className="text-[10px] text-muted-foreground font-medium">LIQUIDACIONES ERP</span>
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
                  : "hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
