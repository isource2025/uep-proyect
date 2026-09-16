"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  Settings,
  Building2,
  Users,
  UploadCloud,
  FileDown,
  ChevronDown,
} from "lucide-react";

interface DashboardSidebarProps {
  user?: {
    name?: string;
    email?: string;
    role?: string;
    hospitalId?: number | null;
  };
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();

  // An admin (role === "1") is NEVER restricted to a single hospital view
  const isHospitalUser = user?.role !== "1" && user?.hospitalId !== undefined && user?.hospitalId !== null;

  // Submenu items under Configuración
  const configSubItems = [
    {
      name: "Hospitales",
      href: "/dashboard/hospitals",
      icon: Building2,
    },
    {
      name: "Agentes",
      href: "/dashboard/agents",
      icon: Users,
    },
    {
      name: "Importar Datos",
      href: "/dashboard/import",
      icon: UploadCloud,
    },
    {
      name: "Consolidación",
      href: "/dashboard/consolidation",
      icon: FileDown,
    },
  ];

  const isConfigActive = configSubItems.some((sub) => pathname.startsWith(sub.href));
  const [isConfigOpen, setIsConfigOpen] = useState(true);

  // Auto-open submenu if currently on a sub-route
  useEffect(() => {
    if (isConfigActive) {
      setIsConfigOpen(true);
    }
  }, [isConfigActive]);

  if (isHospitalUser) {
    const hospitalMenuItems = [
      {
        name: "Portal Hospital",
        href: "/dashboard/hospital-portal",
        icon: Building2,
      },
      {
        name: "Agentes",
        href: "/dashboard/agents",
        icon: Users,
      },
    ];

    return (
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card text-muted-foreground">
        {/* Brand Header Link to Dashboard */}
        <Link
          href="/dashboard/hospital-portal"
          className="flex h-16 items-center gap-2 border-b border-border px-6 bg-card hover:bg-muted/30 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-zinc-950 font-bold">
            U
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wider text-foreground">UEP PORTAL</span>
            <span className="text-[10px] text-muted-foreground font-medium">HOSPITALES</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {hospitalMenuItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
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

  // Admin Navigation: Dashboard, Liquidaciones, and Configuración with submenu
  const isDashboardActive = pathname === "/dashboard";
  const isLiquidationsActive = pathname.startsWith("/dashboard/liquidations");

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
        {/* 1. Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
            isDashboardActive
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
              : "hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <LayoutDashboard
            className={cn(
              "h-4 w-4 transition-colors",
              isDashboardActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          <span>Dashboard</span>
        </Link>

        {/* 2. Liquidaciones */}
        <Link
          href="/dashboard/liquidations"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
            isLiquidationsActive
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
              : "hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <Receipt
            className={cn(
              "h-4 w-4 transition-colors",
              isLiquidationsActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          <span>Liquidaciones</span>
        </Link>

        {/* 3. Configuración with Submenu */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group cursor-pointer",
              isConfigActive
                ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                : "hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <Settings
                className={cn(
                  "h-4 w-4 transition-colors",
                  isConfigActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span>Configuración</span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isConfigOpen ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>

          {/* Submenu links */}
          {isConfigOpen && (
            <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
              {configSubItems.map((sub) => {
                const isSubActive = pathname.startsWith(sub.href);
                const SubIcon = sub.icon;

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-all duration-150 group",
                      isSubActive
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    <SubIcon
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        isSubActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span>{sub.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
