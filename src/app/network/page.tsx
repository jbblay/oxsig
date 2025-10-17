"use client";

import * as React from "react";
import { 
  Network, Radio, Globe, Users, Zap, Shield, 
  CheckCircle2, Clock, XCircle, Activity, Maximize2, Minimize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function NetworkPage() {
  const [connectedPeers] = React.useState(47);
  const [networkHealth] = React.useState(98);
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Network Topology</h1>
          <p className="text-sm text-muted-foreground">P2P connections, peer discovery, and network health</p>
        </div>
        <Badge variant="default" className="gap-1 bg-cyan-600">
          <Radio className="h-3 w-3" />
          {connectedPeers} Peers
        </Badge>
      </div>

      {/* Network Status */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: "Connected Peers", value: connectedPeers, icon: Users, color: "text-blue-600" },
          { label: "Network Health", value: `${networkHealth}%`, icon: Activity, color: "text-green-600" },
          { label: "Avg Latency", value: "42ms", icon: Zap, color: "text-yellow-600" },
          { label: "Data Transfer", value: "1.2GB", icon: Globe, color: "text-purple-600" },
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
        {/* Left Column - Topology */}
        <div className="lg:col-span-2 space-y-6">
          {/* Network Visualization */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Network Topology
                  </CardTitle>
                  <CardDescription>
                    Visual representation of P2P connections
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="gap-2"
                >
                  {isExpanded ? (
                    <>
                      <Minimize2 className="h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className={`rounded-lg bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-2 border-dashed transition-all duration-300 ${
                  isExpanded ? 'h-[600px]' : 'aspect-video'
                }`}
              >
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden">
                  {/* Central Node */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg animate-pulse">
                        <Network className="h-8 w-8 text-white" />
                      </div>
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                        <Badge variant="secondary" className="text-xs">You</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Peer Nodes - Circular Layout */}
                  {[
                    { angle: 0, distance: isExpanded ? 200 : 120, label: "US-East", status: "active" },
                    { angle: 45, distance: isExpanded ? 200 : 120, label: "EU-West", status: "active" },
                    { angle: 90, distance: isExpanded ? 200 : 120, label: "Asia", status: "syncing" },
                    { angle: 135, distance: isExpanded ? 200 : 120, label: "US-West", status: "active" },
                    { angle: 180, distance: isExpanded ? 200 : 120, label: "EU-North", status: "active" },
                    { angle: 225, distance: isExpanded ? 200 : 120, label: "Oceania", status: "active" },
                    { angle: 270, distance: isExpanded ? 200 : 120, label: "Africa", status: "active" },
                    { angle: 315, distance: isExpanded ? 200 : 120, label: "S.America", status: "syncing" },
                  ].map((peer, i) => {
                    const x = Math.cos((peer.angle * Math.PI) / 180) * peer.distance;
                    const y = Math.sin((peer.angle * Math.PI) / 180) * peer.distance;
                    return (
                      <div
                        key={i}
                        className="absolute top-1/2 left-1/2 transition-all duration-300"
                        style={{
                          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                        }}
                      >
                        {/* Connection Line */}
                        <svg
                          className="absolute top-1/2 left-1/2 pointer-events-none"
                          style={{
                            width: Math.abs(x * 2) + 50,
                            height: Math.abs(y * 2) + 50,
                            transform: `translate(-50%, -50%) rotate(${peer.angle}deg)`,
                            transformOrigin: 'center'
                          }}
                        >
                          <line
                            x1="50%"
                            y1="50%"
                            x2={-x}
                            y2={-y}
                            stroke={peer.status === 'active' ? '#06b6d4' : '#fbbf24'}
                            strokeWidth="2"
                            strokeDasharray={peer.status === 'syncing' ? '5,5' : '0'}
                            opacity="0.3"
                          />
                        </svg>
                        
                        {/* Peer Node */}
                        <div className="relative">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center shadow-md ${
                            peer.status === 'active' 
                              ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                              : 'bg-gradient-to-br from-yellow-500 to-orange-500'
                          }`}>
                            <Radio className="h-5 w-5 text-white" />
                          </div>
                          {isExpanded && (
                            <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                              <Badge variant="outline" className="text-xs">{peer.label}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Stats Overlay */}
                  {!isExpanded && (
                    <div className="absolute bottom-4 right-4 text-center bg-background/80 backdrop-blur-sm rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">Click Expand for details</p>
                    </div>
                  )}
                  
                  {isExpanded && (
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                      <div className="flex gap-3">
                        <Badge variant="default" className="gap-1 bg-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          6 Active
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          2 Syncing
                        </Badge>
                      </div>
                      <Button variant="secondary" size="sm">
                        Refresh Topology
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Connections */}
          <Card>
            <CardHeader>
              <CardTitle>Active Connections</CardTitle>
              <CardDescription>
                Currently connected peers in your network
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { peer: "peer-7a2b...3c4d", location: "US-East", latency: 23, status: "active" },
                { peer: "peer-9e8f...1g2h", location: "EU-West", latency: 67, status: "active" },
                { peer: "peer-5k6l...7m8n", location: "Asia-Pacific", latency: 145, status: "active" },
                { peer: "peer-3o4p...9q0r", location: "US-West", latency: 31, status: "syncing" },
                { peer: "peer-1s2t...5u6v", location: "EU-North", latency: 89, status: "active" },
              ].map((conn, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
                    <Radio className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-mono truncate">{conn.peer}</p>
                      <Badge variant={conn.status === "active" ? "default" : "secondary"} className="text-xs">
                        {conn.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conn.location} • {conn.latency}ms latency
                    </p>
                  </div>
                  <div className="text-right">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mb-1" />
                    <p className="text-xs text-muted-foreground">{conn.latency}ms</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full mt-2">
                View All Connections
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stats & Info */}
        <div className="space-y-6">
          {/* Network Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Network Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold">{networkHealth}%</span>
                  <Badge variant="default" className="bg-green-600">Excellent</Badge>
                </div>
                <Progress value={networkHealth} className="h-2" />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>Low latency connections</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>Peer discovery active</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span>NAT traversal working</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Peers</span>
                <span className="font-semibold">{connectedPeers}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active</span>
                <span className="font-semibold text-green-600">42</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Syncing</span>
                <span className="font-semibold text-yellow-600">5</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Offline</span>
                <span className="font-semibold text-gray-600">0</span>
              </div>
            </CardContent>
          </Card>

          {/* Peer Discovery */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Peer Discovery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="h-4 w-4 text-blue-600 animate-pulse" />
                  <span className="text-sm font-medium">Discovering...</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Searching for new peers
                </p>
              </div>
              <Button variant="outline" className="w-full gap-2">
                <Radio className="h-4 w-4" />
                Scan for Peers
              </Button>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Network Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">End-to-end encryption</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">Peer authentication</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-muted-foreground">Traffic obfuscation</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
