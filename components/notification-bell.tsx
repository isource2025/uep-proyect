"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileWarning,
  RefreshCw,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  fetchInAppNotificationsAction,
  markAllNotificationsAsReadAction,
  markNotificationAsReadAction,
} from "@/app/dashboard/notifications/actions";
import type { InAppNotificationItem } from "@/lib/notification-types";

interface NotificationBellProps {
  userId: number;
  initialNotifications?: InAppNotificationItem[];
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell({
  userId: _userId,
  initialNotifications = [],
}: NotificationBellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotificationItem[]>(initialNotifications);
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const refreshNotifications = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchInAppNotificationsAction();
      setNotifications(fresh);
      setOptimisticReadIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set<string>();
        for (const item of fresh) {
          if (!item.read && prev.has(item.id)) next.add(item.id);
        }
        return next;
      });
    } catch {
      // Silencioso en sondeo de fondo
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refrescar al navegar entre secciones, al enfocar ventana y cada 60s
  useEffect(() => {
    refreshNotifications();
  }, [pathname, refreshNotifications]);

  useEffect(() => {
    const onFocus = () => refreshNotifications();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(refreshNotifications, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refreshNotifications]);

  const isNotificationUnread = useCallback(
    (item: InAppNotificationItem) => !item.read && !optimisticReadIds.has(item.id),
    [optimisticReadIds]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => isNotificationUnread(n)).length,
    [notifications, isNotificationUnread]
  );

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => isNotificationUnread(n)).map((n) => n.id);
    if (unreadIds.length === 0) return;

    // Feedback optimista inmediato mientras se persiste en BD
    setOptimisticReadIds((prev) => {
      const next = new Set(prev);
      for (const id of unreadIds) next.add(id);
      return next;
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    await markAllNotificationsAsReadAction(unreadIds);
  };

  const handleClickNotification = (item: InAppNotificationItem) => {
    if (isNotificationUnread(item)) {
      setOptimisticReadIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
      void markNotificationAsReadAction(item.id);
    }

    setOpen(false);

    const targetPath = item.href.split("?")[0];
    if (pathname === targetPath) {
      window.dispatchEvent(
        new CustomEvent("uep:highlight-liquidation", {
          detail: { liquidationId: item.liquidationId },
        })
      );
    }
    router.push(item.href);
  };

  const renderIcon = (item: InAppNotificationItem) => {
    if (item.type === "DISTRIBUCION_COMPLETA") {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      );
    }
    if (item.type === "RECTIFICACION") {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
          <FileWarning className="h-4 w-4" />
        </div>
      );
    }
    if (item.type === "EN_PROCESO") {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
          <Clock className="h-4 w-4" />
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
        <Receipt className="h-4 w-4" />
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) refreshNotifications();
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Notificaciones"
          title="Centro de Notificaciones"
          className="relative shrink-0 h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
        >
          {unreadCount > 0 ? (
            <BellRing className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-zinc-950 ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(calc(100vw-1.5rem),24rem)] max-w-[calc(100vw-1.5rem)] p-0 border-border bg-card text-card-foreground shadow-xl rounded-xl overflow-hidden"
      >
        {/* Header del Popover */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-foreground">Notificaciones</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {unreadCount} sin leer
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={refreshNotifications}
              disabled={refreshing}
              title="Actualizar notificaciones"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </Button>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 px-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Marcar todas</span>
              </Button>
            )}
          </div>
        </div>

        {/* Lista scrolleable */}
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-border/70">
          {notifications.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center gap-2 text-muted-foreground">
              <Bell className="h-7 w-7 opacity-40" />
              <p className="text-xs font-medium text-foreground">Sin notificaciones por el momento</p>
              <p className="text-[11px] leading-relaxed break-words whitespace-normal">
                Aquí aparecerán los avisos de nuevas liquidaciones, rectificaciones o distribuciones completadas.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = isNotificationUnread(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClickNotification(item)}
                  className={cn(
                    "w-full text-left px-3.5 py-3 flex items-start gap-3 transition-colors cursor-pointer hover:bg-muted/60 focus:outline-none focus:bg-muted/60",
                    isUnread && "bg-emerald-500/5 dark:bg-emerald-500/10"
                  )}
                >
                  {renderIcon(item)}

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <span
                        className={cn(
                          "text-xs leading-snug break-words whitespace-normal",
                          isUnread ? "font-bold text-foreground" : "font-semibold text-muted-foreground"
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap pt-0.5">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-foreground/90 leading-snug break-words whitespace-normal">
                      {item.subtitle}
                    </p>

                    {item.meta && (
                      <p className="text-[11px] text-muted-foreground leading-snug break-words whitespace-normal">
                        {item.meta}
                      </p>
                    )}
                  </div>

                  {isUnread && (
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1.5"
                      title="No leída"
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
