/**
 * Auth Layout Component
 * Minimal layout wrapper for authentication pages (Vercel-style)
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div className={cn("min-h-screen flex items-center justify-center p-4", className)}>
      <div className="w-full max-w-[400px] space-y-8">
        {children}
      </div>
    </div>
  );
}

interface AuthLayoutHeaderProps {
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AuthLayoutHeader({ logo, title, subtitle }: AuthLayoutHeaderProps) {
  return (
    <div className="text-center space-y-2">
      {logo && <div className="flex justify-center mb-4">{logo}</div>}
      {title && (
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      )}
      {subtitle && (
        <p className="text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
