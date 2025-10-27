'use client';

/**
 * WebAuthn Credentials List Component
 * 
 * Displays and manages user's registered FIDO2 credentials
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Key, Smartphone, Usb, AlertCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WebAuthnCredential {
  id: string;
  deviceName: string;
  aaguid: string;
  transports: string[];
  userVerified: boolean;
  backupEligible: boolean;
  backupState: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function WebAuthnCredentialsList() {
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/webauthn/credentials');
      
      if (!response.ok) {
        throw new Error('Failed to load credentials');
      }

      const data = await response.json();
      setCredentials(data.credentials);
    } catch (err: any) {
      console.error('Failed to load credentials:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (credentialId: string, deviceName: string) => {
    if (!confirm(`Remove ${deviceName}? You won't be able to use it to sign in anymore.`)) {
      return;
    }

    try {
      setDeletingId(credentialId);
      setError('');

      const response = await fetch(`/api/webauthn/credentials/${credentialId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete credential');
      }

      // Remove from list
      setCredentials(credentials.filter(c => c.id !== credentialId));
    } catch (err: any) {
      console.error('Failed to delete credential:', err);
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadCredentials();

    // Listen for registration events
    const handleRegistration = () => {
      loadCredentials();
    };

    window.addEventListener('webauthn-registered', handleRegistration);
    return () => window.removeEventListener('webauthn-registered', handleRegistration);
  }, []);

  const getTransportIcon = (transports: string[]) => {
    if (transports.includes('internal')) return <Smartphone className="h-4 w-4" />;
    if (transports.includes('usb')) return <Usb className="h-4 w-4" />;
    return <Key className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Security Keys</CardTitle>
        <CardDescription>
          Manage your registered FIDO2 security keys and authenticators
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {credentials.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No security keys registered yet</p>
            <p className="text-sm">Add a security key above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {credentials.map((credential) => (
              <div
                key={credential.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">
                    {getTransportIcon(credential.transports)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{credential.deviceName}</h4>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {credential.lastUsedAt ? (
                        <p>
                          Last used {formatDistanceToNow(new Date(credential.lastUsedAt), { addSuffix: true })}
                        </p>
                      ) : (
                        <p>Never used</p>
                      )}
                      <p>
                        Added {formatDistanceToNow(new Date(credential.createdAt), { addSuffix: true })}
                      </p>
                      <div className="flex gap-2 flex-wrap mt-2">
                        {credential.userVerified && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                            User Verified
                          </span>
                        )}
                        {credential.backupEligible && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                            Sync Capable
                          </span>
                        )}
                        {credential.transports.map(transport => (
                          <span 
                            key={transport}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded"
                          >
                            {transport}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(credential.id, credential.deviceName)}
                  disabled={deletingId === credential.id}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {deletingId === credential.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
