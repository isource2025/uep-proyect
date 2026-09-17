"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { User as UserIcon, LogOut, Shield, ChevronDown, Calendar, Menu, PanelLeft } from "lucide-react";
import { useDashboard } from "./dashboard-context";

interface DashboardHeaderProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();
  const { isDesktopCollapsed, toggleDesktopSidebar, toggleMobileSidebar } = useDashboard();

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("Sign out error", error);
      window.location.href = "/login";
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 dark:bg-[#171717] transition-colors">
      {/* Left side: Sidebar Toggle & Period Widget */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Mobile Toggle Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleMobileSidebar}
          className="flex md:hidden h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded-lg border border-border"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop Collapse / Expand Toggle Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleDesktopSidebar}
          className="hidden md:flex h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded-lg border border-border transition-colors"
          title={isDesktopCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral"}
          aria-label="Alternar barra lateral"
        >
          <PanelLeft className={`h-4.5 w-4.5 transition-transform duration-200 ${isDesktopCollapsed ? "rotate-180 text-emerald-500" : ""}`} />
        </Button>

        {/* Current Active Period Widget */}
        <div className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 sm:px-3 py-1 text-2xs sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-none">
            <span className="hidden sm:inline text-muted-foreground">Período Activo: </span>
            <strong className="text-foreground">Junio 2026</strong>
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </div>
      </div>

      {/* Right side: User Actions & Theme Toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 hover:bg-accent text-muted-foreground hover:text-foreground px-2 sm:px-3 py-1.5 rounded-lg text-sm transition-all border border-border bg-card cursor-pointer h-9"
            >
              <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {user.role === "ADMIN" ? (
                  <Shield className="h-3.5 w-3.5" />
                ) : (
                  <UserIcon className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-xs font-semibold leading-none text-foreground truncate max-w-[120px]">{user.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{user.role}</p>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-border bg-card text-card-foreground shadow-lg">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-medium px-3 py-2">
              Mi Cuenta
            </DropdownMenuLabel>
            <div className="px-3 py-1.5">
              <p className="text-xs font-medium text-foreground">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{user.email}</p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:text-rose-600 cursor-pointer text-xs"
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar Sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
