"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { LoginForm, RegisterForm } from "@/components/auth";

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [redirectTo, setRedirectTo] = React.useState("/home");

  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("redirect");
    if (requested?.startsWith("/") && !requested.startsWith("//")) {
      setRedirectTo(requested);
    }
  }, []);

  // Redirect to /home if already authenticated
  React.useEffect(() => {
    if (user && !authLoading) {
      router.push(redirectTo);
    }
  }, [user, authLoading, redirectTo, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If user is authenticated, show loading while redirecting
  if (user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-32 sm:px-48 md:px-64 lg:px-96 xl:px-[30rem] bg-background">
      <div className="w-full max-w-[220px]">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">OxSig</h1>
            <p className="text-sm text-muted-foreground">Secure files, canvases, and practical cyber labs</p>
          </div>

          <div className="flex flex-col space-y-4">
            {mode === "login" ? (
              <LoginForm redirectTo={redirectTo} />
            ) : (
              <RegisterForm redirectTo={redirectTo} />
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
