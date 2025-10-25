"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Mail, Lock, User, Shield, Fingerprint, Loader2,
  Eye, EyeOff, CheckCircle2, AlertCircle, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth/use-auth";

export default function Home() {
  const router = useRouter();
  const { loginWithEmail, registerWithEmail, user, isLoading: authLoading } = useAuth();
  
  const [activeTab, setActiveTab] = React.useState<"login" | "register">("login");
  const [authMethod, setAuthMethod] = React.useState<"email" | "did">("email");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  // Login form
  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");

  // Register form
  const [registerEmail, setRegisterEmail] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [registerDisplayName, setRegisterDisplayName] = React.useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = React.useState("");

  // Redirect if already authenticated
  React.useEffect(() => {
    if (user && !authLoading) {
      router.push('/home');
    }
  }, [user, authLoading, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      await loginWithEmail(loginEmail, loginPassword);
      setSuccess("Login successful! Redirecting...");
      setTimeout(() => router.push('/home'), 1000);
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (registerPassword !== registerConfirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (registerPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await registerWithEmail(registerEmail, registerPassword, registerDisplayName || undefined);
      setSuccess("Registration successful! Redirecting...");
      setTimeout(() => router.push('/home'), 1000);
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDIDLogin = () => {
    setError("Internet Identity integration coming soon!");
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to OxSig
          </h1>
          <p className="text-muted-foreground text-lg">
            Quantum-safe document signing and collaboration
          </p>
        </div>

        {/* Auth Method Selection */}
        <div className="flex justify-center gap-4">
          <Button
            variant={authMethod === "email" ? "default" : "outline"}
            onClick={() => setAuthMethod("email")}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Email & Password
          </Button>
          <Button
            variant={authMethod === "did" ? "default" : "outline"}
            onClick={() => setAuthMethod("did")}
            className="gap-2"
          >
            <Fingerprint className="h-4 w-4" />
            Internet Identity
          </Button>
        </div>

        {/* Main Auth Card */}
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {authMethod === "email" ? (
                <>
                  <Mail className="h-5 w-5" />
                  Email Authentication
                </>
              ) : (
                <>
                  <Fingerprint className="h-5 w-5" />
                  Internet Identity
                </>
              )}
            </CardTitle>
            <CardDescription>
              {authMethod === "email"
                ? "Sign in with your email and password"
                : "Decentralized authentication with Internet Identity"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authMethod === "email" ? (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>

                {/* Login Tab */}
                <TabsContent value="login" className="space-y-4 mt-6">
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                          disabled={isLoading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {success && (
                      <Alert className="bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                      </Alert>
                    )}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        <>
                          <Lock className="mr-2 h-4 w-4" />
                          Login
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                {/* Register Tab */}
                <TabsContent value="register" className="space-y-4 mt-6">
                  <form onSubmit={handleEmailRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Display Name (Optional)</Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        value={registerDisplayName}
                        onChange={(e) => setRegisterDisplayName(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-confirm-password">Confirm Password</Label>
                      <Input
                        id="register-confirm-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {success && (
                      <Alert className="bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                      </Alert>
                    )}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          <User className="mr-2 h-4 w-4" />
                          Create Account
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            ) : (
              // Internet Identity Section
              <div className="space-y-6 py-6">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Decentralized Authentication</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Login with Internet Identity for maximum privacy and security
                    </p>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleDIDLogin}
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="mr-2 h-5 w-5" />
                      Login with Internet Identity
                    </>
                  )}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  <p>Coming soon: Full Internet Identity integration</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Features */}
        <div className="max-w-3xl mx-auto">
          <div className="grid gap-4 md:grid-cols-3 text-center">
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="font-semibold">Quantum-Safe</h3>
              <p className="text-sm text-muted-foreground">
                Post-quantum cryptography
              </p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="font-semibold">End-to-End Encrypted</h3>
              <p className="text-sm text-muted-foreground">
                Your data stays private
              </p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center">
                <Fingerprint className="h-6 w-6 text-teal-500" />
              </div>
              <h3 className="font-semibold">Decentralized</h3>
              <p className="text-sm text-muted-foreground">
                You own your identity
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
