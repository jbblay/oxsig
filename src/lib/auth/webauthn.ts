/**
 * WebAuthn Biometric Authentication
 * Provides passwordless authentication using fingerprint/FaceID
 */

export interface BiometricCredential {
  id: string;
  publicKey: string;
  counter: number;
  created: number;
}

/**
 * Check if WebAuthn is supported
 */
export function isWebAuthnSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create
  );
}

/**
 * Check if platform authenticator (Face ID, Touch ID) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Register a new biometric credential
 */
export async function registerBiometric(
  userId: string,
  userName: string,
  displayName: string
): Promise<BiometricCredential> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported on this device');
  }

  // Generate challenge
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  
  // Convert userId to Uint8Array
  const userIdBuffer = new TextEncoder().encode(userId);

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'OxSig',
      id: window.location.hostname,
    },
    user: {
      id: userIdBuffer,
      name: userName,
      displayName: displayName,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },  // ES256
      { alg: -257, type: 'public-key' } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey: false,
      userVerification: 'required',
    },
    timeout: 60000,
    attestation: 'none',
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    
    // Extract public key
    const publicKeyBuffer = response.getPublicKey();
    const publicKey = publicKeyBuffer 
      ? arrayBufferToBase64(publicKeyBuffer) 
      : '';

    return {
      id: credential.id,
      publicKey,
      counter: 0,
      created: Date.now(),
    };
  } catch (error: any) {
    console.error('Biometric registration failed:', error);
    throw new Error(`Registration failed: ${error.message}`);
  }
}

/**
 * Authenticate using biometric
 */
export async function authenticateBiometric(
  credentialId?: string
): Promise<{ credentialId: string; signature: string }> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported on this device');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    timeout: 60000,
    userVerification: 'required',
    ...(credentialId && {
      allowCredentials: [{
        id: base64ToArrayBuffer(credentialId),
        type: 'public-key',
      }],
    }),
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      throw new Error('Authentication failed');
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const signature = arrayBufferToBase64(response.signature);

    return {
      credentialId: assertion.id,
      signature,
    };
  } catch (error: any) {
    console.error('Biometric authentication failed:', error);
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Utility: Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility: Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Store credential in localStorage (for demo - use secure storage in production)
 */
export function saveCredential(credential: BiometricCredential): void {
  const existing = getStoredCredentials();
  existing.push(credential);
  localStorage.setItem('oxsig_biometric_credentials', JSON.stringify(existing));
}

/**
 * Get stored credentials
 */
export function getStoredCredentials(): BiometricCredential[] {
  const stored = localStorage.getItem('oxsig_biometric_credentials');
  return stored ? JSON.parse(stored) : [];
}

/**
 * Remove credential
 */
export function removeCredential(credentialId: string): void {
  const existing = getStoredCredentials();
  const filtered = existing.filter(c => c.id !== credentialId);
  localStorage.setItem('oxsig_biometric_credentials', JSON.stringify(filtered));
}
