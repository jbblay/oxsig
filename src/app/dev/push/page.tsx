"use client";

import * as React from "react";
import { Bell, Send, Smartphone, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getUserDevices } from "@/lib/db/devices";
import { 
  sendSignatureRequest, 
  sendSecurityAlert, 
  sendVaultAccessNotification,
  sendDocumentSharedNotification,
  registerPushServiceWorker,
  type SignatureRequest
} from "@/lib/notifications/push-integration";
import { toast } from "sonner";

export default function PushTestPage() {
  const [devices, setDevices] = React.useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = React.useState<string>("");
  const [notificationType, setNotificationType] = React.useState<string>("signature");
  const [loading, setLoading] = React.useState(false);
  const [swRegistered, setSwRegistered] = React.useState(false);

  // Signature request fields
  const [documentName, setDocumentName] = React.useState("Sample Contract.pdf");
  const [requesterName, setRequesterName] = React.useState("John Doe");

  // Security alert fields
  const [alertSeverity, setAlertSeverity] = React.useState<"low" | "medium" | "high" | "critical">("medium");
  const [alertMessage, setAlertMessage] = React.useState("Unusual login detected");

  React.useEffect(() => {
    loadDevices();
    initServiceWorker();
  }, []);

  const loadDevices = async () => {
    try {
      const userDid = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
      const userDevices = await getUserDevices(userDid);
      setDevices(userDevices);
      if (userDevices.length > 0) {
        setSelectedDevice(userDevices[0].id);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
    }
  };

  const initServiceWorker = async () => {
    const registration = await registerPushServiceWorker();
    setSwRegistered(!!registration);
  };

  const handleSendNotification = async () => {
    if (!selectedDevice) {
      toast.error("Please select a device");
      return;
    }

    const device = devices.find(d => d.id === selectedDevice);
    if (!device) return;

    setLoading(true);

    try {
      switch (notificationType) {
        case "signature":
          const request: SignatureRequest = {
            id: `req_${Date.now()}`,
            documentName,
            documentHash: crypto.randomUUID().replace(/-/g, ''),
            requesterDid: "did:key:example123",
            requesterName,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            urgency: "medium",
          };
          await sendSignatureRequest(device, request);
          toast.success("Signature request sent!");
          break;

        case "security":
          await sendSecurityAlert(device, {
            severity: alertSeverity,
            title: "Security Alert",
            message: alertMessage,
            actionUrl: "/security",
          });
          toast.success("Security alert sent!");
          break;

        case "vault":
          await sendVaultAccessNotification(device, "Personal Recovery", "unlocked");
          toast.success("Vault notification sent!");
          break;

        case "document":
          await sendDocumentSharedNotification(device, documentName, requesterName);
          toast.success("Document notification sent!");
          break;
      }
    } catch (error: any) {
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg">
              <Bell className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                Push Notifications
              </h1>
              <p className="text-muted-foreground mt-1">
                Test push notifications to paired devices
              </p>
            </div>
          </div>
        </div>

        {/* Service Worker Status */}
        <Alert className={`mb-6 ${swRegistered ? 'border-green-500/50 bg-green-500/10' : 'border-yellow-500/50 bg-yellow-500/10'}`}>
          {swRegistered ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-yellow-600" />}
          <AlertDescription className={swRegistered ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'}>
            {swRegistered 
              ? "✓ Service Worker registered - push notifications ready"
              : "⚠️ Service Worker not registered - notifications may not work"}
          </AlertDescription>
        </Alert>

        {/* Device Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Device</CardTitle>
            <CardDescription>Choose a paired device to send notifications to</CardDescription>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  No devices paired. Pair a device from the Security page first.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.label} - {device.deviceInfo?.platform || 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Notification Type */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notification Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={notificationType} onValueChange={setNotificationType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="signature">Signature Request</SelectItem>
                <SelectItem value="security">Security Alert</SelectItem>
                <SelectItem value="vault">Vault Access</SelectItem>
                <SelectItem value="document">Document Shared</SelectItem>
              </SelectContent>
            </Select>

            {/* Signature Request Fields */}
            {notificationType === "signature" && (
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label htmlFor="docName">Document Name</Label>
                  <Input
                    id="docName"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="Contract.pdf"
                  />
                </div>
                <div>
                  <Label htmlFor="requester">Requester Name</Label>
                  <Input
                    id="requester"
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}

            {/* Security Alert Fields */}
            {notificationType === "security" && (
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label htmlFor="severity">Severity</Label>
                  <Select value={alertSeverity} onValueChange={(v: any) => setAlertSeverity(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="message">Alert Message</Label>
                  <Textarea
                    id="message"
                    value={alertMessage}
                    onChange={(e) => setAlertMessage(e.target.value)}
                    placeholder="Security alert message..."
                  />
                </div>
              </div>
            )}

            <Button 
              onClick={handleSendNotification} 
              disabled={loading || !selectedDevice}
              className="w-full"
              size="lg"
            >
              <Send className="mr-2 h-4 w-4" />
              {loading ? "Sending..." : "Send Notification"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
