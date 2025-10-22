/**
 * QR Device Pairing System
 * Zero-password device pairing via QR + challenge-response
 */

import * as ed25519 from '@noble/ed25519';

export interface PairingChallenge {
  type: 'PAIR_CHALLENGE';
  c: string; // base64 encoded 32-byte challenge
  appPubKey: string; // hex encoded app public key
  relay: string; // WebSocket relay URL
  timestamp: number;
}

export interface PairingResponse {
  type: 'PAIR_RESPONSE';
  c: string; // same challenge
  deviceDid: string; // did:ox:dev:...
  sig: string; // ed25519 signature of challenge
  devicePubKey: string; // hex encoded device public key
  deviceInfo?: {
    name: string;
    platform: 'ios' | 'android' | 'web' | 'desktop';
    userAgent: string;
  };
}

export interface PairedDevice {
  id: string;
  userDid: string;
  devicePubKey: string;
  deviceDid: string;
  deviceInfo?: {
    name: string;
    platform: string;
    userAgent: string;
  };
  pushEndpoint?: string;
  pairedAt: Date;
  lastSeen: Date;
  trusted: boolean;
}

/**
 * Generate a pairing challenge for QR code
 */
export async function generatePairingChallenge(
  appPubKey: string,
  relayUrl: string = 'wss://relay.oxsig.app'
): Promise<{ challenge: PairingChallenge; qrData: string }> {
  // Generate 32-byte random challenge
  const challengeBytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(challengeBytes);
  } else {
    // Fallback for build-time
    for (let i = 0; i < 32; i++) {
      challengeBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const challengeBase64 = btoa(String.fromCharCode(...challengeBytes));

  const challenge: PairingChallenge = {
    type: 'PAIR_CHALLENGE',
    c: challengeBase64,
    appPubKey,
    relay: relayUrl,
    timestamp: Date.now(),
  };

  // Encode as QR-friendly JSON
  const qrData = JSON.stringify(challenge);

  return { challenge, qrData };
}

/**
 * Verify pairing response signature
 */
export async function verifyPairingResponse(
  challenge: PairingChallenge,
  response: PairingResponse
): Promise<{ valid: boolean; error?: string }> {
  // Verify challenge matches
  if (challenge.c !== response.c) {
    return { valid: false, error: 'Challenge mismatch' };
  }

  // Check timestamp (max 5 minutes old)
  const ageMs = Date.now() - challenge.timestamp;
  if (ageMs > 5 * 60 * 1000) {
    return { valid: false, error: 'Challenge expired' };
  }

  // Verify ed25519 signature
  try {
    // Convert hex strings to Uint8Array
    const signature = hexToBytes(response.sig);
    const publicKey = hexToBytes(response.devicePubKey);
    
    // The message that was signed is the challenge
    const message = new TextEncoder().encode(response.c);
    
    // Verify the signature
    const isValid = await ed25519.verify(signature, message, publicKey);
    
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: `Signature verification failed: ${message}` };
  }
}

/**
 * Utility: Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  
  // Ensure even length
  const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
  
  const bytes = new Uint8Array(paddedHex.length / 2);
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes[i / 2] = parseInt(paddedHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Utility: Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * WebSocket relay client for pairing
 */
export class PairingRelay {
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor(private relayUrl: string = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL) || 'ws://localhost:8080/ws') {}

  /**
   * Connect to relay server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.relayUrl);

        this.ws.onopen = () => {
          console.log('Pairing relay connected');
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('Relay connection error:', error);
          reject(new Error('Failed to connect to relay'));
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const handler = this.messageHandlers.get(data.type);
            if (handler) {
              handler(data);
            }
          } catch (error) {
            console.error('Failed to parse relay message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('Relay connection closed');
          this.connectionPromise = null;
        };
      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Subscribe to a pairing channel
   */
  subscribe(challengeId: string, callback: (response: PairingResponse) => void): void {
    this.messageHandlers.set(challengeId, callback);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        channel: challengeId,
      }));
    }
  }

  /**
   * Send pairing response
   */
  async sendResponse(challengeId: string, response: PairingResponse): Promise<void> {
    await this.connect();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'PUBLISH',
        channel: challengeId,
        data: response,
      }));
    } else {
      throw new Error('Relay not connected');
    }
  }

  /**
   * Disconnect from relay
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.connectionPromise = null;
  }
}

/**
 * Mock relay for development (uses localStorage)
 */
export class MockPairingRelay extends PairingRelay {
  private pollInterval: number | null = null;

  async connect(): Promise<void> {
    console.log('Using mock pairing relay (localStorage)');
    return Promise.resolve();
  }

  subscribe(challengeId: string, callback: (response: PairingResponse) => void): void {
    // Poll localStorage for response
    this.pollInterval = window.setInterval(() => {
      const stored = localStorage.getItem(`pairing:${challengeId}`);
      if (stored) {
        try {
          const response: PairingResponse = JSON.parse(stored);
          callback(response);
          localStorage.removeItem(`pairing:${challengeId}`);
          if (this.pollInterval) {
            clearInterval(this.pollInterval);
          }
        } catch (error) {
          console.error('Failed to parse pairing response:', error);
        }
      }
    }, 500);
  }

  async sendResponse(challengeId: string, response: PairingResponse): Promise<void> {
    localStorage.setItem(`pairing:${challengeId}`, JSON.stringify(response));
    return Promise.resolve();
  }

  disconnect(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

/**
 * Get appropriate relay (real or mock)
 */
export function createRelay(relayUrl: string, useMock: boolean = false): PairingRelay {
  if (useMock || relayUrl.includes('mock') || relayUrl.includes('localhost')) {
    return new MockPairingRelay(relayUrl);
  }
  return new PairingRelay(relayUrl);
}
