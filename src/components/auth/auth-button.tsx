/**
 * Auth Button Components
 * Minimal buttons for authentication actions
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
}

export function AuthButton({
  loading = false,
  loadingText = "Loading...",
  children,
  variant = "default",
  className,
  disabled,
  ...props
}: AuthButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("w-full h-11 font-medium", className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
