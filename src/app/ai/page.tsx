"use client";

import * as React from "react";
import { 
  Brain, Shield, Zap, AlertTriangle, CheckCircle2, 
  TrendingUp, Eye, Activity, Cpu, Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AISecurityPage() {
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const trustScore = 94;
  const threatsDetected = 3;
  const anomaliesBlocked = 127;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600">
            AI Security oxsigAI
          </h1>
          <p className="text-muted-foreground mt-1">
            Federated AI for threat detection and predictive security
          </p>
        </div>
        <Badge variant="default" className="gap-1 bg-violet-600">
          <Brain className="h-3 w-3" />
          {aiEnabled ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* AI Stats Dashboard */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Trust Score", value: `${trustScore}%`, icon: Shield, color: "text-green-600" },
          { label: "Threats Detected", value: threatsDetected, icon: AlertTriangle, color: "text-red-600" },
          { label: "Anomalies Blocked", value: anomaliesBlocked, icon: Eye, color: "text-blue-600" },
          { label: "Model Accuracy", value: "99.7%", icon: Target, color: "text-purple-600" },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <span className="text-2xl font-bold">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - AI Models & Threats */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Models */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Active AI Models
              </CardTitle>
              <CardDescription>
                Federated learning models monitoring your security
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="threat" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="threat">Threat Detection</TabsTrigger>
                  <TabsTrigger value="trust">Trust Engine</TabsTrigger>
                  <TabsTrigger value="anomaly">Anomaly</TabsTrigger>
                </TabsList>
                <TabsContent value="threat" className="space-y-3 mt-4">
                  {[
                    { name: "Phishing Detector", accuracy: 99.8, status: "active", threats: 12 },
                    { name: "Malware Scanner", accuracy: 99.5, status: "active", threats: 8 },
                    { name: "Intrusion Prevention", accuracy: 98.9, status: "active", threats: 5 },
                  ].map((model, i) => (
                    <div key={i} className="p-4 rounded-lg border bg-accent/50">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold">{model.name}</p>
                            <Badge variant="default" className="text-xs">
                              {model.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {model.accuracy}% accuracy • {model.threats} threats blocked
                          </p>
                        </div>
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
                          <Shield className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      <Progress value={model.accuracy} className="h-1.5" />
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="trust" className="space-y-3 mt-4">
                  <div className="p-6 rounded-lg border bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
                    <div className="text-center">
                      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-3">
                        <TrendingUp className="h-10 w-10 text-white" />
                      </div>
                      <h3 className="text-3xl font-bold mb-1">{trustScore}%</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        Predictive Trust Score
                      </p>
                      <Progress value={trustScore} className="h-2 mb-3" />
                      <p className="text-xs text-muted-foreground">
                        Based on behavior analysis, peer reputation, and historical patterns
                      </p>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="anomaly" className="mt-4">
                  <div className="space-y-3">
                    {[
                      { type: "Unusual login pattern", severity: "low", blocked: true },
                      { type: "Suspicious file access", severity: "medium", blocked: true },
                      { type: "Rate limit exceeded", severity: "low", blocked: true },
                    ].map((anomaly, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          anomaly.severity === 'high' ? 'bg-red-500' :
                          anomaly.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{anomaly.type}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {anomaly.severity} severity
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Real-time Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Real-Time Monitoring
              </CardTitle>
              <CardDescription>
                Live feed of AI security events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { event: "Phishing attempt blocked", time: "2 seconds ago", severity: "high" },
                { event: "Normal activity verified", time: "5 seconds ago", severity: "info" },
                { event: "Suspicious pattern detected", time: "12 seconds ago", severity: "medium" },
                { event: "Trust score recalculated", time: "1 minute ago", severity: "info" },
                { event: "Model updated successfully", time: "3 minutes ago", severity: "success" },
              ].map((log, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  {log.severity === 'high' && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                  {log.severity === 'medium' && <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />}
                  {log.severity === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                  {log.severity === 'info' && <Activity className="h-4 w-4 text-blue-600 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.event}</p>
                    <p className="text-xs text-muted-foreground">{log.time}</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full mt-2">
                View Full Activity Log
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - AI Status & Controls */}
        <div className="space-y-6">
          {/* AI Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                AI Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">All Systems Operational</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  AI models running optimally
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Models Active</span>
                  <span className="font-semibold">8/8</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">CPU Usage</span>
                  <span className="font-semibold">12%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Update</span>
                  <span className="font-semibold">2min ago</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Model Training */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Federated Learning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-4 w-4 text-violet-600 animate-pulse" />
                  <span className="text-sm font-medium">Training Active</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Contributing to global model
                </p>
                <Progress value={67} className="h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">67% complete</p>
              </div>
              <Button variant="outline" className="w-full gap-2">
                <Zap className="h-4 w-4" />
                Boost Training
              </Button>
            </CardContent>
          </Card>

          {/* Threat Predictions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-4 w-4" />
                Predictions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-muted-foreground flex-1">Low threat probability</span>
                  <span className="font-semibold">2%</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
                  <span className="text-muted-foreground flex-1">Medium risk events</span>
                  <span className="font-semibold">0.5%</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-muted-foreground flex-1">High severity</span>
                  <span className="font-semibold">0.1%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Based on 30-day pattern analysis
              </p>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Brain className="h-4 w-4" />
                Model Settings
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Activity className="h-4 w-4" />
                View Analytics
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Shield className="h-4 w-4" />
                Security Report
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
