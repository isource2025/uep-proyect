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
  UserCog,
  UploadCloud,
  FileDown,
  ChevronDown,
  X,
} from "lucide-react";
import { useDashboard } from "./dashboard-context";

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
  const { isDesktopCollapsed, isMobileOpen, closeMobileSidebar } = useDashboard();

  // An admin (role contains "1") is NEVER restricted to a single hospital view
  const userRoles = String(user?.role || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const isAdmin = userRoles.includes("1");
  const isHospitalUser = !isAdmin && user?.hospitalId !== undefined && user?.hospitalId !== null;

  // Submenu items under Configuración
  const configSubItems = [
    {
      name: "Usuarios",
      href: "/dashboard/users",
      icon: UserCog,
    },
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

  const isDashboardActive = pathname === "/dashboard";
  const isLiquidationsActive = pathname.startsWith("/dashboard/liquidations");

  const sidebarNavContent = isHospitalUser ? (
    <nav className="flex-1 space-y-1.5 px-4 py-6 overflow-y-auto">
      {hospitalMenuItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeMobileSidebar}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
              isActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
                : "hover:bg-muted/80 hover:text-foreground text-muted-foreground"
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
  ) : (
    <nav className="flex-1 space-y-1.5 px-4 py-6 overflow-y-auto">
      {/* 1. Dashboard */}
      <Link
        href="/dashboard"
        onClick={closeMobileSidebar}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
          isDashboardActive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
            : "hover:bg-muted/80 hover:text-foreground text-muted-foreground"
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
        onClick={closeMobileSidebar}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative",
          isLiquidationsActive
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
            : "hover:bg-muted/80 hover:text-foreground text-muted-foreground"
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
              : "hover:bg-muted/80 hover:text-foreground text-muted-foreground"
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
                  onClick={closeMobileSidebar}
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
  );

  return (
    <>
      {/* ---------------- MOBILE DRAWER BACKDROP ---------------- */}
      {isMobileOpen && (
        <div
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300 md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* ---------------- MOBILE SIDEBAR DRAWER ---------------- */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card text-card-foreground shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-5 bg-card">
          <Link
            href={isHospitalUser ? "/dashboard/hospital-portal" : "/dashboard"}
            onClick={closeMobileSidebar}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-zinc-950 font-bold shadow-xs">
              U
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider text-foreground">UEP PORTAL</span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {isHospitalUser ? "HOSPITALES" : "LIQUIDACIONES ERP"}
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={closeMobileSidebar}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        {sidebarNavContent}
      </aside>

      {/* ---------------- DESKTOP SIDEBAR ---------------- */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card text-card-foreground transition-all duration-300 ease-in-out shrink-0 overflow-hidden",
          isDesktopCollapsed
            ? "w-0 border-r-0 opacity-0 pointer-events-none"
            : "w-64 opacity-100"
        )}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Brand Header Link to Dashboard */}
          <Link
            href={isHospitalUser ? "/dashboard/hospital-portal" : "/dashboard"}
            className="flex h-16 items-center gap-2.5 border-b border-border px-6 bg-card hover:bg-muted/30 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-zinc-950 font-bold shadow-xs shrink-0">
              U
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold tracking-wider text-foreground">UEP PORTAL</span>
              <span className="text-[10px] text-muted-foreground font-medium truncate">
                {isHospitalUser ? "HOSPITALES" : "LIQUIDACIONES ERP"}
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          {sidebarNavContent}
        </div>
      </aside>
    </>
  );
}
