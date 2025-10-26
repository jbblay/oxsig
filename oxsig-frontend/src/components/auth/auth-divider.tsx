/**
 * Auth Divider Component
 * Minimal divider for separating auth methods (e.g., "or continue with")
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuthDividerProps {
  text?: string;
  className?: string;
}

export function AuthDivider({ text = "or", className }: AuthDividerProps) {
  return (
    <div className={cn("relative my-6", className)}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
