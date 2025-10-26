"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { LoginForm, RegisterForm } from "@/components/auth";

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  const [mode, setMode] = React.useState<"login" | "register">("login");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="container py-12">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              Welcome back, {user.displayName || user.email}!
            </h1>
            <p className="text-muted-foreground text-lg">
              You're signed in and ready to go
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-32 sm:px-48 md:px-64 lg:px-96 xl:px-[30rem] bg-background">
      <div className="w-full max-w-[220px]">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">OxSig</h1>
            <p className="text-sm text-muted-foreground">Quantum-safe document signing</p>
          </div>

          <div className="flex flex-col space-y-4">
            {mode === "login" ? (
              <LoginForm redirectTo="/" />
            ) : (
              <RegisterForm redirectTo="/" />
            )}

            <div className="text-center text-sm">
              {mode === "login" ? (
                <p className="text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}