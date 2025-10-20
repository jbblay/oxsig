"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { WifiOff, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  if (isOnline) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="text-center max-w-md">
            <CardHeader>
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <RefreshCcw className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle>Back Online!</CardTitle>
              <CardDescription>Your connection has been restored</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleRefresh} className="w-full">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh Page
              </Button>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md px-4"
      >
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mx-auto w-24 h-24 rounded-full bg-orange-500/20 flex items-center justify-center mb-6"
        >
          <WifiOff className="h-12 w-12 text-orange-500" />
        </motion.div>

        <h1 className="text-3xl font-bold mb-2">You're Offline</h1>
        <p className="text-muted-foreground mb-6">
          It looks like you've lost your internet connection. Don't worry, you can still access cached content.
        </p>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Available Offline Features</CardTitle>
          </CardHeader>
          <CardContent className="text-left space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>View previously loaded pages</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Access cached documents</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Create drafts (syncs when online)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">Real-time features unavailable</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button onClick={handleRefresh} className="w-full" variant="default">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" className="w-full">
              <Home className="mr-2 h-4 w-4" />
              Go to Home
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Check your internet connection and try again
        </p>
      </motion.div>
    </div>
  );
}
