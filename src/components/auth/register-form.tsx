/**
 * Register Form Component
 * Minimal registration form following Vercel design patterns
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { EmailInput, PasswordInput } from "./auth-input";
import { AuthButton } from "./auth-button";
import { AuthMessage } from "./auth-message";
import { useAuthForm, validators } from "./use-auth-form";

interface RegisterFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function RegisterForm({
  onSuccess,
  redirectTo = "/",
}: RegisterFormProps): React.JSX.Element {
  const router = useRouter();
  const { registerWithEmail } = useAuth();

  const {
    values,
    errors,
    loading,
    message,
    handleChange,
    handleSubmit,
    setSuccess,
  } = useAuthForm({
    onSubmit: async (data) => {
      try {
        await registerWithEmail(data.email, data.password);
        setSuccess("Account created successfully! Redirecting...");
        setTimeout(() => {
          if (onSuccess) onSuccess();
          router.push(redirectTo);
        }, 1000);
      } catch (error: any) {
        throw new Error(error.message || "Registration failed. Please try again.");
      }
    },
    validate: (data) => {
      const newErrors: Record<string, string> = {};

      const emailError = validators.email(data.email);
      if (emailError) newErrors.email = emailError;

      const passwordError = validators.strongPassword(data.password);
      if (passwordError) newErrors.password = passwordError;

      const confirmError = validators.confirmPassword(data.confirmPassword, data.password);
      if (confirmError) newErrors.confirmPassword = confirmError;

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
          id="password"
          label="Password"
          value={values.password || ""}
          onChange={(e) => handleChange("password", e.target.value)}
          error={errors.password}
          disabled={loading}
          autoComplete="new-password"
        />

        <PasswordInput
          id="confirmPassword"
          label="Confirm Password"
          value={values.confirmPassword || ""}
          onChange={(e) => handleChange("confirmPassword", e.target.value)}
          error={errors.confirmPassword}
          disabled={loading}
          autoComplete="new-password"
        />
      </div>

      <AuthButton
        type="submit"
        loading={loading}
        loadingText="Creating account..."
      >
        Create account
      </AuthButton>
    </form>
  );
}
