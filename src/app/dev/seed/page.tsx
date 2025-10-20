"use client";

import * as React from "react";
import { Sprout, Trash2, Database, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { seedAllData, clearAllData, seedAuditEvents, seedVaults, seedDevices } from "@/lib/dev/seed-data";

export default function DevSeedPage() {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'seeding' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [progress, setProgress] = React.useState(0);

  const handleSeedAll = async () => {
    setLoading(true);
    setStatus('seeding');
    setMessage('Seeding sample data...');
    setProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      await seedAllData();
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatus('success');
      setMessage('✨ All sample data seeded successfully! Refresh the app to see changes.');
    } catch (error: any) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedAudit = async () => {
    setLoading(true);
    setStatus('seeding');
    setMessage('Seeding audit events...');
    
    try {
      await seedAuditEvents(50);
      setStatus('success');
      setMessage('Created 50 audit events!');
    } catch (error: any) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedVaults = async () => {
    setLoading(true);
    setStatus('seeding');
    setMessage('Seeding vaults...');
    
    try {
      await seedVaults(3);
      setStatus('success');
      setMessage('Created 3 sample vaults! Password: Demo123!@#');
    } catch (error: any) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDevices = async () => {
    setLoading(true);
    setStatus('seeding');
    setMessage('Seeding devices...');
    
    try {
      await seedDevices(3);
      setStatus('success');
      setMessage('Created 3 paired devices!');
    } catch (error: any) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ This will delete all development data. Continue?')) {
      return;
    }

    setLoading(true);
    setStatus('seeding');
    setMessage('Clearing data...');
    
    try {
      await clearAllData();
      setStatus('success');
      setMessage('Data cleared! You may need to manually clear IndexedDB for complete reset.');
    } catch (error: any) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Warning Banner */}
        <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            <strong>Development Only:</strong> This page is for seeding sample data during development. 
            Remove before production deployment!
          </AlertDescription>
        </Alert>

        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
              <Sprout className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Dev Data Seeder
              </h1>
              <p className="text-muted-foreground mt-1">
                Generate realistic sample data for testing and demos
              </p>
            </div>
          </div>
        </div>

        {/* Status Alert */}
        {status !== 'idle' && (
          <Alert className={`mb-6 ${
            status === 'success' ? 'border-green-500/50 bg-green-500/10' :
            status === 'error' ? 'border-red-500/50 bg-red-500/10' :
            'border-blue-500/50 bg-blue-500/10'
          }`}>
            {status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
             status === 'error' ? <AlertCircle className="h-4 w-4 text-red-600" /> :
             <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />}
            <AlertDescription className={
              status === 'success' ? 'text-green-800 dark:text-green-200' :
              status === 'error' ? 'text-red-800 dark:text-red-200' :
              'text-blue-800 dark:text-blue-200'
            }>
              {message}
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        {status === 'seeding' && progress > 0 && (
          <div className="mb-6">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {progress}% complete
            </p>
          </div>
        )}

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-green-600" />
                Seed All Data
              </CardTitle>
              <CardDescription>
                Generate complete sample dataset
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Audit Events:</span>
                  <Badge variant="outline">50 events</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Seed Vaults:</span>
                  <Badge variant="outline">3 vaults</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Paired Devices:</span>
                  <Badge variant="outline">3 devices</Badge>
                </div>
              </div>
              <Button 
                onClick={handleSeedAll} 
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Seeding...
                  </>
                ) : (
                  <>
                    <Sprout className="mr-2 h-4 w-4" />
                    Seed All Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                Clear All Data
              </CardTitle>
              <CardDescription>
                Delete all development data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertCircle className="h-3 w-3 text-red-600" />
                  <AlertDescription className="text-xs text-red-800 dark:text-red-200">
                    This action cannot be undone
                  </AlertDescription>
                </Alert>
              </div>
              <Button 
                onClick={handleClearAll} 
                disabled={loading}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear All Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Individual Seeders */}
        <Card>
          <CardHeader>
            <CardTitle>Individual Seeders</CardTitle>
            <CardDescription>Seed specific data types separately</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                onClick={handleSeedAudit} 
                disabled={loading}
                variant="outline"
              >
                Audit Events (50)
              </Button>
              <Button 
                onClick={handleSeedVaults} 
                disabled={loading}
                variant="outline"
              >
                Vaults (3)
              </Button>
              <Button 
                onClick={handleSeedDevices} 
                disabled={loading}
                variant="outline"
              >
                Devices (3)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Sample Data Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5">Vaults</Badge>
                <div>
                  <p className="font-medium">Demo Password: Demo123!@#</p>
                  <p className="text-muted-foreground text-xs">Use this password to unlock sample vaults</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5">DID</Badge>
                <div>
                  <p className="font-mono text-xs break-all">did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK</p>
                  <p className="text-muted-foreground text-xs">Sample user DID for all seeded data</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5">Time</Badge>
                <div>
                  <p className="text-muted-foreground text-xs">Events distributed over last 30-90 days</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
