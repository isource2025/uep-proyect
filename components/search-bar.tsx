"use client";

import React from "react";
import { Search, RefreshCw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  onClear?: () => void;
  isLoading?: boolean;
  showSubmitButton?: boolean;
  submitButtonText?: string;
  className?: string;
  inputClassName?: string;
  name?: string;
  defaultValue?: string;
  size?: "sm" | "default";
}

export function SearchBar({
  placeholder = "Buscar...",
  value,
  onChange,
  onSubmit,
  onClear,
  isLoading = false,
  showSubmitButton,
  submitButtonText = "Buscar",
  className = "",
  inputClassName = "",
  name,
  defaultValue,
  size = "default",
}: SearchBarProps) {
  const isSubmitVisible = showSubmitButton !== undefined ? showSubmitButton : !!onSubmit;
  const isSmall = size === "sm";

  const handleSubmit = (e: React.FormEvent) => {
    if (onSubmit) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange("");
    }
  };

  const hasValue = value !== undefined ? Boolean(value.length > 0) : false;

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative flex items-center gap-2 ${className}`}
    >
      <div className="relative flex-1">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${
            isSmall ? "h-3.5 w-3.5" : "h-4 w-4"
          }`}
        />
        <Input
          type="text"
          name={name}
          defaultValue={defaultValue}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          placeholder={placeholder}
          className={`${isSmall ? "h-8 text-xs pl-8.5 pr-8" : "h-9 text-xs pl-9 pr-8"} border-border bg-background text-foreground placeholder:text-muted-foreground rounded-lg focus-visible:ring-emerald-500 ${inputClassName}`}
        />
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-0.5 rounded-full hover:bg-muted transition-colors cursor-pointer"
            title="Limpiar búsqueda"
          >
            <X className={isSmall ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        )}
      </div>

      {isSubmitVisible && (
        <Button
          type="submit"
          size="sm"
          disabled={isLoading}
          className={`bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold cursor-pointer gap-1.5 shrink-0 ${
            isSmall ? "h-8 px-3 text-xs" : "h-9 px-4 text-xs"
          }`}
        >
          {isLoading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {submitButtonText}
        </Button>
      )}
    </form>
  );
}
