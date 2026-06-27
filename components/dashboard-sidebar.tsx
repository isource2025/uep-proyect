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
  ShieldAlert,
} from "lucide-react";

export function DashboardSidebar() {
  const pathname = usePathname();

  const menuItems = [
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
  ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-2 border-b border-zinc-800 px-6 bg-zinc-950">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-zinc-950 font-bold">
          U
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wider text-white">UEP PORTAL</span>
          <span className="text-[10px] text-zinc-500 font-medium">LIQUIDACIONES ERP</span>
        </div>
      </div>

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
                  ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5"
                  : "hover:bg-zinc-900/50 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
                )}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div className="border-t border-zinc-800/60 p-4 bg-zinc-950">
        <div className="flex items-center gap-2 rounded-lg bg-zinc-900/40 p-3 border border-zinc-800/40">
          <ShieldAlert className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col text-[10px]">
            <span className="font-semibold text-zinc-300">Conectado a MariaDB</span>
            <span className="text-zinc-500 mt-0.5">uep-proyect @ localhost</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
