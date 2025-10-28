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
  onClick,
  ...props
}: AuthButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("w-full h-11 font-medium", className)}
      disabled={loading || disabled}
      onClick={onClick as any}
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

interface OAuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  provider: "google" | "github" | "microsoft" | "did";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function OAuthButton({
  provider,
  loading = false,
  icon,
  className,
  children,
  onClick,
  ...props
}: OAuthButtonProps) {
  const providerConfig = {
    google: {
      label: "Continue with Google",
      className: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
    },
    github: {
      label: "Continue with GitHub",
      className: "bg-gray-900 text-white hover:bg-gray-800",
    },
    microsoft: {
      label: "Continue with Microsoft",
      className: "bg-[#2f2f2f] text-white hover:bg-[#1f1f1f]",
    },
    did: {
      label: "Continue with Internet Identity",
      className: "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700",
    },
  };

  const config = providerConfig[provider];

  return (
    <Button
      variant="outline"
      className={cn("w-full", config.className, className)}
      disabled={loading}
      onClick={onClick as any}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children || config.label}
        </>
      )}
    </Button>
  );
}
