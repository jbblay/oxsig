/**
 * Auth State Display Component
 * Shows current auth state (for debugging/development)
 */

"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

export function AuthStateDisplay() {
  const { user, isAuthenticated, authMethod, isLoading } = useAuth();

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          Auth State
          {isAuthenticated ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant={isAuthenticated ? "default" : "secondary"}>
            {isLoading ? "Loading..." : isAuthenticated ? "Authenticated" : "Not Authenticated"}
          </Badge>
        </div>
        {authMethod && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method:</span>
            <Badge variant="outline">{authMethod}</Badge>
          </div>
        )}
        {user && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-mono">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID:</span>
              <span className="font-mono text-[10px]">{user.id.substring(0, 12)}...</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
