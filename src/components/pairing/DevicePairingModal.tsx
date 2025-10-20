'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Smartphone, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { 
  generatePairingChallenge, 
  verifyPairingResponse,
  createRelay,
  type PairingChallenge,
  type PairingResponse 
} from '@/lib/pairing/qr-pairing';
import { savePairedDevice } from '@/lib/db/devices';
import { initializePushForDevice } from '@/lib/notifications/push-integration';
import { toast } from 'sonner';

interface DevicePairingModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (deviceDid: string) => void;
  userDid: string;
}

export function DevicePairingModal({ open, onClose, onSuccess, userDid }: DevicePairingModalProps) {
  const [challenge, setChallenge] = useState<PairingChallenge | null>(null);
  const [qrData, setQrData] = useState<string>('');
  const [status, setStatus] = useState<'generating' | 'waiting' | 'verifying' | 'success' | 'error'>('generating');
  const [error, setError] = useState<string>('');
  const [deviceInfo, setDeviceInfo] = useState<{ name: string; platform: string } | null>(null);

  useEffect(() => {
    if (open) {
      initializePairing();
    }

    return () => {
      // Cleanup on unmount
      setChallenge(null);
      setQrData('');
      setStatus('generating');
      setError('');
      setDeviceInfo(null);
    };
  }, [open]);

  async function initializePairing() {
    try {
      setStatus('generating');
      setError('');

      // Generate app key pair (in production, use persistent keys)
      const appPubKey = generateMockPublicKey();
      
      // Generate challenge
      const { challenge: newChallenge, qrData: newQrData } = await generatePairingChallenge(
        appPubKey,
        'wss://mock-relay.oxsig.app' // Use mock for development
      );

      setChallenge(newChallenge);
      setQrData(newQrData);
      setStatus('waiting');

      // Start listening for response
      listenForResponse(newChallenge);
    } catch (err) {
      console.error('Failed to initialize pairing:', err);
      setError('Failed to generate pairing code');
      setStatus('error');
    }
  }

  async function listenForResponse(pairingChallenge: PairingChallenge) {
    try {
      const relay = createRelay(pairingChallenge.relay, true); // Use mock relay
      await relay.connect();

      // Subscribe to pairing channel
      relay.subscribe(pairingChallenge.c, async (response: PairingResponse) => {
        setStatus('verifying');

        // Verify response
        const verification = await verifyPairingResponse(pairingChallenge, response);
        
        if (!verification.valid) {
          setError(verification.error || 'Verification failed');
          setStatus('error');
          relay.disconnect();
          return;
        }

        // Save paired device
        const deviceId = `dev-${Date.now()}`;
        await savePairedDevice({
          id: deviceId,
          userDid,
          devicePubKey: response.devicePubKey,
          deviceDid: response.deviceDid,
          deviceInfo: response.deviceInfo,
          pairedAt: new Date(),
          lastSeen: new Date(),
          trusted: true,
        });

        // Initialize push notifications for the device
        try {
          const pushEnabled = await initializePushForDevice(deviceId);
          if (pushEnabled) {
            toast.success('Push notifications enabled!');
          }
        } catch (pushError) {
          console.warn('Failed to enable push notifications:', pushError);
          // Don't fail pairing if push setup fails
        }

        setDeviceInfo(response.deviceInfo || { name: 'Unknown Device', platform: 'unknown' });
        setStatus('success');
        
        relay.disconnect();

        // Call success callback after a brief delay
        setTimeout(() => {
          onSuccess(response.deviceDid);
        }, 2000);
      });
    } catch (err) {
      console.error('Failed to listen for pairing response:', err);
      setError('Connection failed');
      setStatus('error');
    }
  }

  function generateMockPublicKey(): string {
    // Generate mock public key (32 bytes hex)
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    }
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Pair New Device
          </DialogTitle>
          <DialogDescription>
            Scan the QR code with your mobile device to pair it securely
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {status === 'generating' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Generating pairing code...</p>
            </div>
          )}

          {status === 'waiting' && qrData && (
            <>
              <div className="p-4 bg-white rounded-lg shadow-lg">
                <QRCodeSVG value={qrData} size={256} level="H" />
              </div>
              <Badge variant="outline" className="gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                Waiting for scan...
              </Badge>
              <p className="text-xs text-center text-muted-foreground max-w-xs">
                Open your mobile app and scan this QR code to pair your device
              </p>
            </>
          )}

          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Verifying device...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-semibold text-green-600">Device Paired Successfully!</p>
                {deviceInfo && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {deviceInfo.name} ({deviceInfo.platform})
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 w-full">
              <XCircle className="h-12 w-12 text-red-500" />
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button onClick={initializePairing} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </div>

        {status === 'waiting' && (
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={initializePairing} variant="secondary" className="flex-1">
              Refresh Code
            </Button>
          </div>
        )}

        {status === 'success' && (
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
