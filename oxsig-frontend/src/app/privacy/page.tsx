"use client";

import * as React from "react";
import { 
  Eye, EyeOff, Shield, Lock, Unlock, Zap, CheckCircle2, 
  AlertTriangle, Settings, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function PrivacyPage() {
  const [zkProofs, setZkProofs] = React.useState(true);
  const [selectiveDisclosure, setSelectiveDisclosure] = React.useState(true);
  const [anonymousMode, setAnonymousMode] = React.useState(false);
  const [privacyLevel, setPrivacyLevel] = React.useState([75]);

  const privacyScore = React.useMemo(() => {
    let score = 50;
    if (zkProofs) score += 25;
    if (selectiveDisclosure) score += 15;
    if (anonymousMode) score += 10;
    return Math.min(score, 100);
  }, [zkProofs, selectiveDisclosure, anonymousMode]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Privacy</h1>
          <p className="text-sm text-muted-foreground">Zero-knowledge privacy controls</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <EyeOff className="h-3 w-3" />
          Private
        </Badge>
      </div>

      {/* Privacy Score */}
      <Card className="border-2 border-purple-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Privacy Score</div>
                <div className="text-2xl font-bold text-purple-600">{privacyScore}%</div>
              </div>
            </div>
            <Badge variant={privacyScore >= 80 ? "default" : "secondary"}>
              {privacyScore >= 80 ? "Strong" : privacyScore >= 60 ? "Good" : "Moderate"}
            </Badge>
          </div>
          <Progress value={privacyScore} className="h-2" />
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Privacy Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="zk-proofs">Zero-Knowledge Proofs</Label>
                <Badge variant="outline" className="text-xs">ZK-SNARKs</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Verify identity without revealing information</p>
            </div>
            <Switch 
              id="zk-proofs"
              checked={zkProofs} 
              onCheckedChange={(checked) => {
                setZkProofs(checked);
                toast.success(checked ? "ZK proofs enabled" : "ZK proofs disabled");
              }} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="selective">Selective Disclosure</Label>
              <p className="text-xs text-muted-foreground">Share only required attributes</p>
            </div>
            <Switch 
              id="selective"
              checked={selectiveDisclosure} 
              onCheckedChange={(checked) => {
                setSelectiveDisclosure(checked);
                toast.success(checked ? "Selective disclosure enabled" : "Disabled");
              }} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="anonymous">Anonymous Mode</Label>
                <Badge variant="secondary" className="text-xs">Beta</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Use anonymous credentials</p>
            </div>
            <Switch 
              id="anonymous"
              checked={anonymousMode} 
              onCheckedChange={(checked) => {
                setAnonymousMode(checked);
                if (checked) {
                  toast.warning("Anonymous mode activated");
                }
              }} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy Level */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default Privacy Level</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Level</span>
            <span className="text-lg font-bold text-purple-600">{privacyLevel[0]}%</span>
          </div>
          <Slider 
            value={privacyLevel} 
            onValueChange={setPrivacyLevel}
            min={0}
            max={100}
            step={5}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Higher levels provide stronger privacy protection
          </p>
        </CardContent>
      </Card>

      {/* Active Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { name: "ZK Authentication", active: zkProofs, icon: Lock, color: "text-purple-600" },
              { name: "Selective Attributes", active: selectiveDisclosure, icon: Eye, color: "text-blue-600" },
              { name: "Anonymous Credentials", active: anonymousMode, icon: EyeOff, color: "text-pink-600" },
            ].map((feature, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <feature.icon className={`h-4 w-4 ${feature.color}`} />
                  <div>
                    <div className="text-sm font-medium">{feature.name}</div>
                  </div>
                </div>
                <Badge variant={feature.active ? "default" : "outline"} className="text-xs">
                  {feature.active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
