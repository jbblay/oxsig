/**
 * Auth Card Component
 * Minimal card wrapper for authentication forms
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[400px] rounded-lg border border-border bg-card p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

interface AuthCardHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function AuthCardHeader({ title, description, className }: AuthCardHeaderProps) {
  return (
    <div className={cn("space-y-2 text-center mb-8", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface AuthCardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCardFooter({ children, className }: AuthCardFooterProps) {
  return (
    <div className={cn("mt-6 text-center text-sm", className)}>
      {children}
    </div>
  );
}
