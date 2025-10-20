"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Fingerprint, Mic, Bell, QrCode, Database, Check, X, 
  Loader2, Download, RefreshCw, AlertCircle 
} from "lucide-react";
import { motion } from "framer-motion";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  authenticateBiometric,
  getStoredCredentials
} from "@/lib/auth/webauthn";
import { 
  isPushSupported, 
  requestNotificationPermission, 
  showSecurityAlert,
  initNotifications 
} from "@/lib/notifications/push";
import { 
  voiceCommands, 
  toggleVoiceCommands 
} from "@/lib/voice/commands";
import { 
  generateSigningQR, 
  downloadQRCode 
} from "@/lib/qr/signer";
import { offlineDB, syncManager } from "@/lib/db/offline";

export default function FeaturesPage() {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricRegistered, setBiometricRegistered] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [dbStats, setDbStats] = useState({ documents: 0, signatures: 0 });
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    checkFeatureSupport();
  }, []);

  async function checkFeatureSupport() {
    // Check biometric
    setBiometricSupported(isWebAuthnSupported());
    if (isWebAuthnSupported()) {
      const available = await isPlatformAuthenticatorAvailable();
      setBiometricAvailable(available);
      const credentials = getStoredCredentials();
      setBiometricRegistered(credentials.length > 0);
    }

    // Check push notifications
    setPushSupported(isPushSupported());
    if (isPushSupported()) {
      setPushEnabled(Notification.permission === 'granted');
    }

    // Check voice commands
    setVoiceSupported(voiceCommands.isSupported());
    setVoiceActive(voiceCommands.getListeningStatus());

    // Check database
    await offlineDB.init();
    const docs = await offlineDB.getAllDocuments();
    setDbStats({ documents: docs.length, signatures: 0 });
  }

  async function handleBiometricRegister() {
    setBiometricLoading(true);
    try {
      const credential = await registerBiometric(
        'user-' + Date.now(),
        'demo@oxsig.app',
        'Demo User'
      );
      console.log('Biometric registered:', credential);
      setBiometricRegistered(true);
      alert('Biometric authentication registered successfully!');
    } catch (error: any) {
      console.error(error);
      alert('Failed to register: ' + error.message);
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleBiometricAuth() {
    setBiometricLoading(true);
    try {
      const result = await authenticateBiometric();
      console.log('Authenticated:', result);
      alert('Authentication successful!');
    } catch (error: any) {
      console.error(error);
      alert('Authentication failed: ' + error.message);
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handlePushEnable() {
    setPushLoading(true);
    try {
      const granted = await requestNotificationPermission();
      setPushEnabled(granted);
      if (granted) {
        await initNotifications();
        alert('Push notifications enabled!');
      } else {
        alert('Permission denied. Please enable in browser settings.');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to enable notifications');
    } finally {
      setPushLoading(false);
    }
  }

  async function handleTestNotification() {
    await showSecurityAlert('This is a test security alert!', 'medium');
  }

  function handleVoiceToggle() {
    const isActive = toggleVoiceCommands();
    setVoiceActive(isActive);
  }

  async function handleGenerateQR() {
    setQrLoading(true);
    try {
      const randomId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2);
      const qrUrl = await generateSigningQR(
        'demo-doc-' + Date.now(),
        'sha256:' + randomId,
        { test: true }
      );
      setQrCode(qrUrl);
    } catch (error) {
      console.error(error);
      alert('Failed to generate QR code');
    } finally {
      setQrLoading(false);
    }
  }

  async function handleDownloadQR() {
    if (qrCode) {
      await downloadQRCode(qrCode, 'oxsig-signing-qr');
    }
  }

  async function handleSync() {
    setSyncLoading(true);
    try {
      const result = await syncManager.syncAll();
      alert(`Sync complete! Synced: ${result.synced}, Failed: ${result.failed}`);
    } catch (error) {
      console.error(error);
      alert('Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold mb-2">Advanced Features</h1>
        <p className="text-muted-foreground">
          Test and enable cutting-edge security features
        </p>
      </div>

      {/* Biometric Authentication */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint className="h-6 w-6 text-purple-500" />
                <div>
                  <CardTitle>Biometric Authentication</CardTitle>
                  <CardDescription>Passwordless login with Face ID / Touch ID</CardDescription>
                </div>
              </div>
              {biometricSupported ? (
                <Badge variant="default" className="bg-green-500">Supported</Badge>
              ) : (
                <Badge variant="secondary">Not Available</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!biometricSupported && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">WebAuthn not supported on this device/browser</p>
              </div>
            )}
            
            {biometricSupported && !biometricAvailable && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">Platform authenticator not available (no Face ID/Touch ID detected)</p>
              </div>
            )}

            {biometricSupported && biometricAvailable && (
              <div className="flex gap-2">
                {!biometricRegistered ? (
                  <Button onClick={handleBiometricRegister} disabled={biometricLoading}>
                    {biometricLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Fingerprint className="h-4 w-4 mr-2" />}
                    Register Biometric
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleBiometricAuth} disabled={biometricLoading}>
                      {biometricLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                      Test Authentication
                    </Button>
                    <Badge variant="outline" className="self-center">✓ Registered</Badge>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Push Notifications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-6 w-6 text-blue-500" />
                <div>
                  <CardTitle>Push Notifications</CardTitle>
                  <CardDescription>Real-time security alerts and updates</CardDescription>
                </div>
              </div>
              {pushSupported ? (
                pushEnabled ? (
                  <Badge variant="default" className="bg-green-500">Enabled</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )
              ) : (
                <Badge variant="secondary">Not Available</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {!pushEnabled ? (
                <Button onClick={handlePushEnable} disabled={pushLoading || !pushSupported}>
                  {pushLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                  Enable Notifications
                </Button>
              ) : (
                <Button onClick={handleTestNotification} variant="outline">
                  Test Notification
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Voice Commands */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className={`h-6 w-6 ${voiceActive ? 'text-red-500' : 'text-teal-500'}`} />
                <div>
                  <CardTitle>Voice Commands</CardTitle>
                  <CardDescription>Hands-free operation (say "help" for commands)</CardDescription>
                </div>
              </div>
              {voiceSupported ? (
                voiceActive ? (
                  <Badge variant="default" className="bg-red-500 animate-pulse">Listening</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )
              ) : (
                <Badge variant="secondary">Not Available</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={voiceActive}
                onCheckedChange={handleVoiceToggle}
                disabled={!voiceSupported}
              />
              <Label>{voiceActive ? 'Voice commands active' : 'Enable voice commands'}</Label>
            </div>
            {voiceActive && (
              <div className="p-3 rounded-lg bg-blue-500/10 text-sm">
                <p className="font-medium mb-1">Try saying:</p>
                <ul className="text-muted-foreground space-y-1">
                  <li>• "Sign document"</li>
                  <li>• "Open profile"</li>
                  <li>• "Dark mode"</li>
                  <li>• "Help" - for full list</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* QR Code Signing */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <QrCode className="h-6 w-6 text-indigo-500" />
              <div>
                <CardTitle>QR Code Signing</CardTitle>
                <CardDescription>Mobile-friendly air-gapped document signing</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={handleGenerateQR} disabled={qrLoading}>
                {qrLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                Generate Signing QR
              </Button>
              {qrCode && (
                <Button onClick={handleDownloadQR} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
            {qrCode && (
              <div className="p-4 rounded-lg bg-muted flex justify-center">
                <img src={qrCode} alt="Signing QR Code" className="w-64 h-64" />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Offline Database */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-emerald-500" />
              <div>
                <CardTitle>Offline Database</CardTitle>
                <CardDescription>Local storage with automatic cloud sync</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{dbStats.documents}</p>
                <p className="text-sm text-muted-foreground">Documents Stored</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{dbStats.signatures}</p>
                <p className="text-sm text-muted-foreground">Signatures</p>
              </div>
            </div>
            <Button onClick={handleSync} disabled={syncLoading} variant="outline" className="w-full">
              {syncLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Now
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
