"use client";

import * as React from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AppHero({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-background/70 backdrop-blur",
        "p-5 md:p-6 animate-in fade-in-0 slide-in-from-top-2 duration-300",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card shadow-sm">
          <Shield className="h-4 w-4" />
        </div>
        <h1 className="text-lg md:text-xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
          {title}
        </h1>
      </div>
      {subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}