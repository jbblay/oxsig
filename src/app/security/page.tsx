"use client";

import * as React from "react";
import { 
  Shield, Key, Lock, Unlock, AlertTriangle, CheckCircle2, 
  Eye, Clock, Download, RefreshCw, Settings, Activity, Smartphone, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DynamicSecurityScore } from "@/components/app/DynamicSecurityScore";
import { DevicePairingModal } from "@/components/pairing/DevicePairingModal";
import { WebAuthnRegister } from "@/components/security/WebAuthnRegister";
import { WebAuthnCredentialsList } from "@/components/security/WebAuthnCredentialsList";
import { getUserDevices } from "@/lib/db/devices";
import { format } from "date-fns";

export default function SecurityPage() {
  const [showPairingModal, setShowPairingModal] = React.useState(false);
  const [devices, setDevices] = React.useState<any[]>([]);

  React.useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const userDid = "did:example:user123"; // Replace with actual user DID
      const userDevices = await getUserDevices(userDid);
      setDevices(userDevices);
    } catch (error) {
      console.error("Failed to load devices:", error);
    }
  };

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

      <Tabs defaultValue="keys" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="webauthn">Security Keys</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="webauthn" className="space-y-4">
          {/* WebAuthn/FIDO2 Security Keys */}
          <WebAuthnRegister />
          <WebAuthnCredentialsList />
        </TabsContent>

        <TabsContent value="keys" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="devices" className="space-y-4">
          {/* Device Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-cyan-600" />
                    Paired Devices
                  </CardTitle>
                  <CardDescription>Manage trusted devices with QR pairing</CardDescription>
                </div>
                <Button onClick={() => setShowPairingModal(true)} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Pair Device
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No paired devices yet</p>
                  <Button 
                    onClick={() => setShowPairingModal(true)} 
                    variant="outline" 
                    className="mt-4"
                  >
                    Pair Your First Device
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div 
                      key={device.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-cyan-600" />
                        <div>
                          <div className="font-medium">{device.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {device.deviceInfo?.userAgent || "Unknown device"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Last seen: {format(new Date(device.lastSeen), "PPp")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {device.trusted && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <Shield className="h-3 w-3 mr-1" />
                            Trusted
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm">
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
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
        </TabsContent>
      </Tabs>

      <DevicePairingModal
        open={showPairingModal}
        onClose={() => setShowPairingModal(false)}
        onSuccess={() => {
          loadDevices();
          toast.success("Device paired successfully!");
          setShowPairingModal(false);
        }}
        userDid="did:example:user123"
      />
    </div>
  );
}
