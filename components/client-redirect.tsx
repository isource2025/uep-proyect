"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface ClientRedirectProps {
  to: string;
  label?: string;
}

export function ClientRedirect({ to, label = "Redirigiendo..." }: ClientRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      <p className="text-xs sm:text-sm font-medium break-words">{label}</p>
    </div>
  );
}
