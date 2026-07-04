export default function DashboardLoading() {
  return (
    <div className="space-y-6 text-foreground animate-pulse">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded-md bg-zinc-300 dark:bg-muted/60" />
        <div className="h-4 w-96 rounded-md bg-zinc-200/80 dark:bg-muted/40" />
      </div>

      {/* Metrics Cards Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 rounded bg-zinc-300/80 dark:bg-muted/50" />
              <div className="h-4 w-4 rounded-full bg-emerald-500/20" />
            </div>
            <div className="space-y-1.5">
              <div className="h-7 w-20 rounded bg-zinc-300 dark:bg-muted/70" />
              <div className="h-3 w-36 rounded bg-zinc-200/80 dark:bg-muted/40" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Table Skeleton Layout */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-1.5">
            <div className="h-5 w-48 rounded bg-zinc-300 dark:bg-muted/60" />
            <div className="h-3 w-80 rounded bg-zinc-200/80 dark:bg-muted/40" />
          </div>
          <div className="h-8 w-24 rounded bg-zinc-300/80 dark:bg-muted/50" />
        </div>

        {/* Pulsing Table Rows */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-zinc-300/80 dark:bg-muted/50" />
                <div className="space-y-1">
                  <div className="h-4 w-44 rounded bg-zinc-300 dark:bg-muted/60" />
                  <div className="h-3 w-24 rounded bg-zinc-200/80 dark:bg-muted/40" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="h-4 w-20 rounded bg-zinc-300/80 dark:bg-muted/50" />
                <div className="h-4 w-24 rounded bg-zinc-300 dark:bg-muted/60" />
                <div className="h-6 w-16 rounded-full bg-zinc-200/80 dark:bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
