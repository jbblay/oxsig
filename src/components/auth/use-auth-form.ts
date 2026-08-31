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
    // Clear error when user types
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
    
    // Validate
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

  return {
    values,
    errors,
    loading,
    message,
    handleChange,
    handleSubmit,
  };
}

// Common validation functions
export const validators = {
  email: (value: string) => {
    if (!value) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
    return "";
  },

  password: (value: string, minLength = 8) => {
    if (!value) return "Password is required";
    if (value.length < minLength) return `Password must be at least ${minLength} characters`;
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
