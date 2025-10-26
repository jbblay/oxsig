"use client";

import * as React from "react";
import { 
  Fingerprint, Key, Copy, CheckCircle2, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function IdentityPage() {
  const [did] = React.useState("did:icp:alice...7a2b3c4d");
  const [autoVerify, setAutoVerify] = React.useState(true);
  const [biometricAuth, setBiometricAuth] = React.useState(false);
  const [publicProfile, setPublicProfile] = React.useState(true);

  const copyDID = () => {
    navigator.clipboard.writeText(did);
    toast.success("DID copied to clipboard");
  };

  const credentials = [
    { name: "KYC Verification", issuer: "TrustedID", status: "active" },
    { name: "Professional License", issuer: "Gov Authority", status: "active" },
    { name: "Email Verified", issuer: "Self-Attested", status: "active" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Identity</h1>
          <p className="text-sm text-muted-foreground">Self-sovereign decentralized identity</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Fingerprint className="h-3 w-3" />
          Verified
        </Badge>
      </div>

      {/* DID Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-blue-600" />
            Your DID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-muted/50 rounded-lg">
              <code className="text-xs md:text-sm font-mono break-all">{did}</code>
            </div>
            <Button size="icon" variant="outline" onClick={copyDID}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identity Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-verify">Auto Verification</Label>
              <p className="text-xs text-muted-foreground">Automatically verify new connections</p>
            </div>
            <Switch 
              id="auto-verify"
              checked={autoVerify} 
              onCheckedChange={setAutoVerify}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="biometric">Biometric Auth</Label>
              <p className="text-xs text-muted-foreground">Use fingerprint or face ID</p>
            </div>
            <Switch 
              id="biometric"
              checked={biometricAuth} 
              onCheckedChange={setBiometricAuth}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="public">Public Profile</Label>
              <p className="text-xs text-muted-foreground">Make profile discoverable</p>
            </div>
            <Switch 
              id="public"
              checked={publicProfile} 
              onCheckedChange={setPublicProfile}
            />
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {credentials.map((cred, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-sm font-medium">{cred.name}</div>
                    <div className="text-xs text-muted-foreground">{cred.issuer}</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {cred.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trust Score */}
      <Card className="border-2 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Trust Score</div>
                <div className="text-2xl font-bold text-blue-600">98%</div>
              </div>
            </div>
            <Button variant="outline" size="sm">View Details</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}