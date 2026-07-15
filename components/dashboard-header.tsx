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
import { User as UserIcon, LogOut, Shield, ChevronDown, Calendar } from "lucide-react";

interface DashboardHeaderProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7512/ingest/356f6776-4866-47b5-9aec-f04790f78e37", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "86b1be" },
      body: JSON.stringify({
        sessionId: "86b1be",
        runId: "header-bg-fix",
        hypothesisId: "H-HDR",
        location: "dashboard-header.tsx:useEffect",
        message: "Header mounted with dark bg #171717",
        data: {
          isDark: document.documentElement.classList.contains("dark"),
          headerClass: "bg-background dark:bg-[#171717]",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, []);
  // #endregion

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.refresh();
      router.push("/login");
    } catch (error) {
      console.error("Sign out error", error);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6 dark:bg-[#171717]">
      {/* Current Active Period Widget */}
      <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <Calendar className="h-3.5 w-3.5" />
        <span>Período Activo: <strong className="text-foreground">Junio 2026</strong></span>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-4">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 hover:bg-accent text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg text-sm transition-all border border-border bg-card cursor-pointer"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {user.role === "ADMIN" ? (
                  <Shield className="h-3.5 w-3.5" />
                ) : (
                  <UserIcon className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-xs font-semibold leading-none text-foreground">{user.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{user.role}</p>
              </div>
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 border-border bg-card text-card-foreground">
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
              className="flex items-center gap-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-400 cursor-pointer text-xs"
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
