"use client";

import { Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  isLoading?: boolean;
  className?: string;
}

export function SearchBar({
  placeholder = "Buscar...",
  value,
  onChange,
  onSubmit,
  isLoading = false,
  className = "",
}: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`flex max-w-md items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9 h-9 border-border bg-background text-foreground placeholder-muted-foreground text-xs rounded-lg focus-visible:ring-emerald-500"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={isLoading}
        className="bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold h-9 px-4 cursor-pointer gap-1"
      >
        {isLoading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        Buscar
      </Button>
    </form>
  );
}
