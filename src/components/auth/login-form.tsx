/**
 * Login Form Component
 * Minimal login form following Vercel design patterns
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { EmailInput, PasswordInput } from "./auth-input";
import { AuthButton } from "./auth-button";
import { AuthMessage } from "./auth-message";
import { useAuthForm, validators } from "./use-auth-form";

interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function LoginForm({ onSuccess, redirectTo = "/" }: LoginFormProps): React.JSX.Element {
  const router = useRouter();
  const { loginWithEmail } = useAuth();

  const {
    values,
    errors,
    loading,
    message,
    handleChange,
    handleSubmit,
  } = useAuthForm({
    onSubmit: async (data) => {
      try {
        await loginWithEmail(data.email, data.password);
        if (onSuccess) onSuccess();
        router.push(redirectTo);
      } catch (error: any) {
        throw new Error(error.message || "Login failed. Please check your credentials.");
      }
    },
    validate: (data) => {
      const newErrors: Record<string, string> = {};
      
      const emailError = validators.email(data.email);
      if (emailError) newErrors.email = emailError;
      
      const passwordError = validators.password(data.password);
      if (passwordError) newErrors.password = passwordError;
      
      return newErrors;
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <AuthMessage type={message.type} message={message.text} />
      )}

      <div className="space-y-3">
        <EmailInput
          value={values.email || ""}
          onChange={(e) => handleChange("email", e.target.value)}
          error={errors.email}
          disabled={loading}
          autoComplete="email"
          autoFocus
        />

        <PasswordInput
          value={values.password || ""}
          onChange={(e) => handleChange("password", e.target.value)}
          error={errors.password}
          disabled={loading}
          autoComplete="current-password"
        />
      </div>

      <AuthButton
        type="submit"
        loading={loading}
        loadingText="Signing in..."
      >
        Sign in
      </AuthButton>
    </form>
  );
}
