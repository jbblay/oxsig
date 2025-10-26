/**
 * Auth Link Component
 * Minimal link styling for auth pages
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AuthLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthLink({ href, children, className }: AuthLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "text-sm font-medium text-primary hover:underline underline-offset-4",
        className
      )}
    >
      {children}
    </Link>
  );
}

interface ForgotPasswordLinkProps {
  className?: string;
}

export function ForgotPasswordLink({ className }: ForgotPasswordLinkProps) {
  return (
    <div className={cn("text-right", className)}>
      <AuthLink href="/auth/forgot-password">
        Forgot password?
      </AuthLink>
    </div>
  );
}
