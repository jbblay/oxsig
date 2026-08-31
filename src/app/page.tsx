"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { LoginForm, RegisterForm } from "@/components/auth";

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading, loginAsDemo } = useAuth();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [demoAvailable, setDemoAvailable] = React.useState(false);
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [demoError, setDemoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch('/api/auth/demo', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (active) setDemoAvailable(data.enabled === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Redirect to /home if already authenticated
  React.useEffect(() => {
    if (user && !authLoading) {
      router.push("/home");
    }
  }, [user, authLoading, router]);

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

  const enterDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await loginAsDemo();
      router.push('/home');
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : 'Demo login failed');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">OxSig</h1>
            <p className="text-sm text-muted-foreground">Private document storage and verified digital signatures</p>
          </div>

          <div className="flex flex-col space-y-4">
            {mode === "login" ? (
              <LoginForm redirectTo="/home" />
            ) : (
              <RegisterForm redirectTo="/home" />
            )}

            {mode === "login" && demoAvailable && (
              <div className="space-y-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => void enterDemo()}
                  disabled={demoLoading}
                >
                  {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  {demoLoading ? 'Opening demo…' : 'Enter demo workspace'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Preview-only · no password · changes are not saved</p>
                {demoError && <p className="text-center text-sm text-destructive">{demoError}</p>}
              </div>
            )}

            <div className="text-center text-sm">
              {mode === "login" ? (
                <p className="text-muted-foreground">
                  Don&apos;t have an account?{" "}
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
