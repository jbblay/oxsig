'use client';

/**
 * WebAuthn Security Key Registration Component
 * 
 * Allows users to register FIDO2 security keys (YubiKey, Touch ID, Windows Hello, etc.)
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Key, Shield, AlertCircle } from 'lucide-react';

export function WebAuthnRegister() {
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess(false);

      // Check WebAuthn support
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Get registration options from server
      const optionsResponse = await fetch('/api/webauthn/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!optionsResponse.ok) {
        const errorData = await optionsResponse.json();
        throw new Error(errorData.error || 'Failed to get registration options');
      }

      const { options, challengeId } = await optionsResponse.json();

      // Convert base64url strings to Uint8Array
      const publicKeyOptions: CredentialCreationOptions = {
        publicKey: {
          ...options,
          challenge: base64urlToUint8Array(options.challenge),
          user: {
            ...options.user,
            id: base64urlToUint8Array(options.user.id),
          },
          excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
            ...cred,
            id: base64urlToUint8Array(cred.id),
          })),
        },
      };

      // Create credential with authenticator
      const credential = await navigator.credentials.create(publicKeyOptions) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Send credential to server for verification
      const verifyResponse = await fetch('/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          credential: {
            id: credential.id,
            rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
            type: credential.type,
            response: {
              clientDataJSON: uint8ArrayToBase64url(new Uint8Array(response.clientDataJSON)),
              attestationObject: uint8ArrayToBase64url(new Uint8Array(response.attestationObject)),
              transports: response.getTransports ? response.getTransports() : undefined,
            },
          },
          deviceName: deviceName || 'Security Key',
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'Failed to verify credential');
      }

      setSuccess(true);
      setDeviceName('');
      
      // Emit event for parent component to refresh credential list
      window.dispatchEvent(new CustomEvent('webauthn-registered'));
    } catch (err: any) {
      console.error('WebAuthn registration error:', err);
      setError(err.message || 'Failed to register security key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Register Security Key
        </CardTitle>
        <CardDescription>
          Add a FIDO2 security key, YubiKey, Touch ID, or Windows Hello for passwordless authentication
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-900 border-green-200">
            <Key className="h-4 w-4" />
            <AlertDescription>
              Security key registered successfully! You can now use it to sign in.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="device-name">Device Name (Optional)</Label>
          <Input
            id="device-name"
            placeholder="e.g., YubiKey 5, MacBook Touch ID"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            disabled={loading}
          />
          <p className="text-sm text-muted-foreground">
            Give your security key a friendly name to identify it later
          </p>
        </div>

        <Button
          onClick={handleRegister}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Insert your security key...
            </>
          ) : (
            <>
              <Key className="mr-2 h-4 w-4" />
              Register Security Key
            </>
          )}
        </Button>

        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-semibold">Supported devices:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>YubiKey (USB, NFC)</li>
            <li>Touch ID / Face ID (Apple devices)</li>
            <li>Windows Hello (fingerprint, face, PIN)</li>
            <li>Android biometrics</li>
            <li>Other FIDO2-certified authenticators</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function uint8ArrayToBase64url(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
