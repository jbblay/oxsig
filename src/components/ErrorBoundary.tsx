"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

/**
 * Default error fallback component
 */
function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-red-900 dark:text-red-100">
            Something went wrong
          </CardTitle>
          <CardDescription>
            The page encountered an unexpected error. You can retry or return home.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDev && (
            <details className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs">
              <summary className="cursor-pointer font-medium mb-2">
                Error Details (Development)
              </summary>
              <pre className="whitespace-pre-wrap text-red-600 dark:text-red-400">
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </details>
          )}
          
          <div className="flex gap-2">
            <Button 
              onClick={resetError} 
              className="flex-1"
              variant="default"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button 
              onClick={() => window.location.href = '/'} 
              variant="outline"
              className="flex-1"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
          
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * React Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}
