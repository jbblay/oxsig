'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checkBackendHealth, createWebSocketConnection, apiFetch, backendConfig } from '@/lib/backend-config';

interface ServiceStatus {
  name: string;
  status: 'checking' | 'online' | 'offline' | 'error';
  message?: string;
}

export default function BackendStatusTest() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'WebSocket Gateway', status: 'checking' },
    { name: 'Health API', status: 'checking' },
    { name: 'Database', status: 'checking' },
  ]);
  const [wsMessage, setWsMessage] = useState<string>('Not connected');

  useEffect(() => {
    checkServices();
  }, []);

  const checkServices = async () => {
    // Check Health API
    try {
      const healthy = await checkBackendHealth();
      updateServiceStatus('Health API', healthy ? 'online' : 'offline');
    } catch (error) {
      updateServiceStatus('Health API', 'error', error instanceof Error ? error.message : 'Unknown error');
    }

    // Check WebSocket
    try {
      const ws = createWebSocketConnection((data) => {
        setWsMessage(`Received: ${JSON.stringify(data)}`);
      });
      
      ws.onopen = () => {
        updateServiceStatus('WebSocket Gateway', 'online');
        // Send test message
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      };

      ws.onerror = () => {
        updateServiceStatus('WebSocket Gateway', 'error', 'Connection failed');
      };
    } catch (error) {
      updateServiceStatus('WebSocket Gateway', 'error', error instanceof Error ? error.message : 'Unknown error');
    }

    // Check Database (via API)
    try {
      const response = await fetch(`${backendConfig.apiUrl.replace('/api', '')}/health`);
      if (response.ok) {
        const data = await response.json();
        updateServiceStatus('Database', 'online', `Service: ${data.service}`);
      } else {
        updateServiceStatus('Database', 'offline');
      }
    } catch (error) {
      updateServiceStatus('Database', 'error', 'API not available');
    }
  };

  const updateServiceStatus = (name: string, status: ServiceStatus['status'], message?: string) => {
    setServices(prev => 
      prev.map(s => s.name === name ? { ...s, status, message } : s)
    );
  };

  const getStatusBadge = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500">Online</Badge>;
      case 'offline':
        return <Badge variant="secondary">Offline</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'checking':
        return <Badge variant="outline">Checking...</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backend Services Status</CardTitle>
          <CardDescription>
            Testing connection to OxSig backend infrastructure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">{service.name}</p>
                {service.message && (
                  <p className="text-sm text-muted-foreground">{service.message}</p>
                )}
              </div>
              {getStatusBadge(service.status)}
            </div>
          ))}

          <Button onClick={checkServices} className="w-full">
            Recheck Services
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WebSocket Messages</CardTitle>
          <CardDescription>Real-time messages from backend</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
            {wsMessage}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backend Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            <div className="flex justify-between py-2 border-b">
              <dt className="text-sm font-medium">WebSocket URL:</dt>
              <dd className="text-sm text-muted-foreground font-mono">{backendConfig.wsUrl}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-sm font-medium">API URL:</dt>
              <dd className="text-sm text-muted-foreground font-mono">{backendConfig.apiUrl}</dd>
            </div>
            <div className="flex justify-between py-2 border-b">
              <dt className="text-sm font-medium">Storage URL:</dt>
              <dd className="text-sm text-muted-foreground font-mono">{backendConfig.storageUrl}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-sm font-medium">Search URL:</dt>
              <dd className="text-sm text-muted-foreground font-mono">{backendConfig.searchUrl}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="border-orange-500">
        <CardHeader>
          <CardTitle className="text-orange-600">⚠️ Backend Not Running?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Start the backend services with:</p>
          <pre className="bg-muted p-3 rounded text-sm">
            {`# Windows PowerShell
.\\backend.ps1 start

# Linux/macOS
make start

# Or direct Docker
docker compose up -d`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
