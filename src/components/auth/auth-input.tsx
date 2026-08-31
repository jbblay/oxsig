/**
 * Auth Input Components
 * Minimal form inputs for authentication
 */

"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function EmailInput({ label = "Email", error, className, ...props }: AuthInputProps) {
  const { value, ...restProps } = props;
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id || "email"} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={props.id || "email"}
        type="email"
        placeholder="name@example.com"
        className={cn("h-11", error && "border-destructive focus-visible:ring-destructive", className)}
        value={value as string | undefined}
        {...restProps}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

interface PasswordInputProps extends AuthInputProps {
  showToggle?: boolean;
}

export function PasswordInput({
  label = "Password",
  error,
  className,
  showToggle = true,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const { value, ...restProps } = props;

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id || "password"} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={props.id || "password"}
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          className={cn("h-11", showToggle && "pr-10", error && "border-destructive focus-visible:ring-destructive", className)}
          value={value as string | undefined}
          {...restProps}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function TextInput({ label, error, className, ...props }: AuthInputProps) {
  const { value, ...restProps } = props;
  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={props.id} className="text-sm font-medium">
          {label}
        </Label>
      )}
      <Input
        className={cn("h-11", error && "border-destructive focus-visible:ring-destructive", className)}
        value={value as string | undefined}
        {...restProps}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
