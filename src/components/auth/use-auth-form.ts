/**
 * Auth Form Hook
 * Handles form validation and state management
 */

"use client";

import * as React from "react";

interface UseAuthFormOptions {
  onSubmit: (data: Record<string, string>) => Promise<void>;
  validate?: (data: Record<string, string>) => Record<string, string>;
}

export function useAuthForm({ onSubmit, validate }: UseAuthFormOptions) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (validate) {
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
    }

    setLoading(true);
    setErrors({});

    try {
      await onSubmit(values);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.message || "An error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setValues({});
    setErrors({});
    setLoading(false);
    setMessage(null);
  };

  const setSuccess = (text: string) => {
    setMessage({ type: "success", text });
  };

  const setError = (text: string) => {
    setMessage({ type: "error", text });
  };

  return {
    values,
    errors,
    loading,
    message,
    handleChange,
    handleSubmit,
    reset,
    setSuccess,
    setError,
  };
}

export const validators = {
  email: (value: string) => {
    if (!value) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
    return "";
  },

  // Login should validate presence, not impose today's signup policy on an
  // account that may have been created under an older password policy.
  password: (value: string) => {
    if (!value) return "Password is required";
    return "";
  },

  strongPassword: (value: string) => {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
    if (!/[a-z]/.test(value)) return "Password must contain a lowercase letter";
    if (!/[A-Z]/.test(value)) return "Password must contain an uppercase letter";
    if (!/[0-9]/.test(value)) return "Password must contain a number";
    if (!/[^a-zA-Z0-9]/.test(value)) return "Password must contain a special character";
    return "";
  },

  confirmPassword: (value: string, password: string) => {
    if (!value) return "Please confirm your password";
    if (value !== password) return "Passwords do not match";
    return "";
  },

  required: (value: string, fieldName = "This field") => {
    if (!value) return `${fieldName} is required`;
    return "";
  },
};
