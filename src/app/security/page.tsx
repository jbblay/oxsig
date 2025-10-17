"use client";

import * as React from "react";
import { 
  Shield, Key, Lock, Unlock, AlertTriangle, CheckCircle2, 
  Eye, Clock, Download, RefreshCw, Settings, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DynamicSecurityScore } from "@/components/app/DynamicSecurityScore";

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Security</h1>
          <p className="text-sm text-muted-foreground">Key management and threat monitoring</p>
        </div>
        <Badge variant="default" className="gap-1 bg-green-600">
          <Shield className="h-3 w-3" />
          Secure
        </Badge>
      </div>

      <DynamicSecurityScore />

      {/* Active Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600" />
            Cryptographic Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { name: "Primary Signing", type: "Ed25519", status: "active" },
              { name: "Encryption Key", type: "X25519", status: "active" },
              { name: "PQ Recovery", type: "Dilithium-3", status: "active" },
            ].map((key, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-sm font-medium">{key.name}</div>
                    <div className="text-xs text-muted-foreground">{key.type}</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {key.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { action: "Key rotation completed", time: "2 hours ago", type: "success" },
              { action: "Security scan passed", time: "5 hours ago", type: "success" },
              { action: "New device authorized", time: "1 day ago", type: "info" },
            ].map((log, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                <div className={`h-2 w-2 rounded-full mt-2 ${
                  log.type === 'success' ? 'bg-green-500' : 
                  log.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{log.action}</div>
                  <div className="text-xs text-muted-foreground">{log.time}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Threat Monitor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5 text-orange-600" />
            Threat Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">No threats detected</span>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-600">Safe</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <div className="text-lg font-bold text-green-600">0</div>
                <div className="text-xs text-muted-foreground">Blocked Attempts</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <div className="text-lg font-bold text-blue-600">24/7</div>
                <div className="text-xs text-muted-foreground">Monitoring</div>
              </div>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    );
  }
