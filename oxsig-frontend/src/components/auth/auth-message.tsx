/**
 * Auth Message Component
 * Displays success, error, and info messages
 */

import * as React from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthMessageProps {
  type: "success" | "error" | "info";
  message: string;
  className?: string;
}

export function AuthMessage({ type, message, className }: AuthMessageProps) {
  const styles = {
    success: "bg-green-50 text-green-900 border-green-200 dark:bg-green-950/30 dark:text-green-100 dark:border-green-900",
    error: "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-100 dark:border-red-900",
    info: "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/30 dark:text-blue-100 dark:border-blue-900",
  };

  const Icon = type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-4 text-sm",
        styles[type],
        className
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <p className="flex-1">{message}</p>
    </div>
  );
}
