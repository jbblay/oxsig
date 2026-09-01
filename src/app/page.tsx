"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Github, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { LoginForm, OAuthButton, RegisterForm } from "@/components/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [redirectTo, setRedirectTo] = React.useState("/home");
  const [providers, setProviders] = React.useState<Array<"google" | "github">>([]);
  const [authError, setAuthError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("redirect");
    setAuthError(new URLSearchParams(window.location.search).get("auth_error"));
    if (requested?.startsWith("/") && !requested.startsWith("//")) {
      setRedirectTo(requested);
    }
  }, []);

  React.useEffect(() => {
    fetch("/api/auth/oauth/providers", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { providers: [] })
      .then((body) => setProviders(body.providers || []))
      .catch(() => setProviders([]));
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
    <div className="min-h-screen flex items-center justify-center bg-background px-5 py-10">
      <main className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">OxSig</h1>
            <p className="text-sm text-muted-foreground">Secure files, canvases, and practical cyber labs</p>
          </div>

          <div className="flex flex-col space-y-4">
            {authError && <Alert variant="destructive"><AlertDescription>{authError}</AlertDescription></Alert>}
            {providers.length > 0 && <div className="space-y-2">
              {providers.includes("google") && <OAuthButton provider="google" type="button" onClick={() => { window.location.href = "/api/auth/oauth/google"; }} icon={<span className="font-bold">G</span>} />}
              {providers.includes("github") && <OAuthButton provider="github" type="button" onClick={() => { window.location.href = "/api/auth/oauth/github"; }} icon={<Github className="h-4 w-4" />} />}
              <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or use email</span><span className="h-px flex-1 bg-border" /></div>
            </div>}
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
      </main>
    </div>
  );
}
