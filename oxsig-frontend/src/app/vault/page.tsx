'use client';

import { VaultManager } from '@/components/vault/VaultManager';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Lock, Fingerprint, Users, Download, QrCode } from 'lucide-react';

export default function VaultPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <div className="container mx-auto p-6 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 py-12">
          <div className="flex justify-center">
            <div className="rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-4">
              <Shield className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Innovative Seed Vault
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Military-grade encryption meets user-friendly recovery. Create, manage, and recover your identity
            with multiple failsafe mechanisms.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardContent className="pt-6">
              <Lock className="h-8 w-8 text-blue-600 mb-3" />
              <h3 className="font-semibold mb-2">BIP39 Standard</h3>
              <p className="text-sm text-muted-foreground">
                Industry-standard 12-24 word seed phrases with cryptographic checksums
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardContent className="pt-6">
              <Fingerprint className="h-8 w-8 text-purple-600 mb-3" />
              <h3 className="font-semibold mb-2">Biometric Wrapping</h3>
              <p className="text-sm text-muted-foreground">
                Device-secured encryption using OS keystore (StrongBox/Secure Enclave)
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
            <CardContent className="pt-6">
              <Users className="h-8 w-8 text-green-600 mb-3" />
              <h3 className="font-semibold mb-2">Social Recovery</h3>
              <p className="text-sm text-muted-foreground">
                Threshold recovery with trusted guardians + zkEmail/zkPhone verification
              </p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
            <CardContent className="pt-6">
              <Download className="h-8 w-8 text-amber-600 mb-3" />
              <h3 className="font-semibold mb-2">Multiple Backups</h3>
              <p className="text-sm text-muted-foreground">
                Paper backup, QR codes, encrypted cloud storage, and hardware devices
              </p>
            </CardContent>
          </Card>

          <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-white">
            <CardContent className="pt-6">
              <QrCode className="h-8 w-8 text-cyan-600 mb-3" />
              <h3 className="font-semibold mb-2">Easy Migration</h3>
              <p className="text-sm text-muted-foreground">
                Scan QR to transfer vaults between devices securely
              </p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
            <CardContent className="pt-6">
              <Shield className="h-8 w-8 text-red-600 mb-3" />
              <h3 className="font-semibold mb-2">No-Lockout Design</h3>
              <p className="text-sm text-muted-foreground">
                Multiple recovery paths ensure you never lose access to your identity
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Vault Manager */}
        <VaultManager />

        {/* Information Section */}
        <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200">
          <CardContent className="pt-6 space-y-4">
            <h3 className="text-xl font-semibold">How It Works</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">1</span>
                  Generate Secure Seed
                </h4>
                <p className="text-sm text-muted-foreground">
                  Cryptographically secure random generation using Web Crypto API. Choose from 12-24 word phrases
                  for varying security levels (128-256 bits of entropy).
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-sm font-bold">2</span>
                  Encrypt with Password
                </h4>
                <p className="text-sm text-muted-foreground">
                  Your seed is encrypted with AES-256-GCM using your master password. The encrypted vault
                  is stored locally in IndexedDB.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600 text-sm font-bold">3</span>
                  Create Backups
                </h4>
                <p className="text-sm text-muted-foreground">
                  Download paper backups or export as QR codes. Set up social recovery with trusted guardians
                  who can help you recover access.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-sm font-bold">4</span>
                  Recover Anytime
                </h4>
                <p className="text-sm text-muted-foreground">
                  Use your master password, paper backup, guardian recovery, or biometric unlock to restore
                  your vault on any device.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
