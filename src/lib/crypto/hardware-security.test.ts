import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isHardwareSecurityAvailable,
  generateHardwareKey,
  signWithHardwareKey,
  verifyHardwareAttestation,
  type HardwareSecurityProvider,
  type HardwareKeyInfo,
} from './hardware-security';

// Mock global window and navigator
const mockCredentials = {
  create: vi.fn(),
  get: vi.fn(),
};

describe('Hardware Security - Availability Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect WebAuthn when available', async () => {
    // Mock WebAuthn availability
    global.window = {
      PublicKeyCredential: {} as any,
    } as any;

    const result = await isHardwareSecurityAvailable();
    
    expect(result.available).toBe(true);
    expect(result.providers).toContain('webauthn');
  });

  it('should return empty providers when nothing available', async () => {
    // Clear window object
    global.window = undefined as any;
    
    const result = await isHardwareSecurityAvailable();
    
    expect(result.available).toBe(false);
    expect(result.providers).toHaveLength(0);
  });

  it('should recommend strongest available provider', async () => {
    global.window = {
      PublicKeyCredential: {} as any,
    } as any;

    const result = await isHardwareSecurityAvailable();
    
    expect(result.recommended).toBeDefined();
  });
});

describe('Hardware Security - WebAuthn Key Generation', () => {
  beforeEach(() => {
    // Mock successful WebAuthn credential creation
    const mockCredential = {
      id: 'credential-id-123',
      rawId: new Uint8Array([1, 2, 3, 4, 5]).buffer,
      type: 'public-key',
      response: {
        attestationObject: new Uint8Array([10, 20, 30, 40, 50]),
        clientDataJSON: new Uint8Array([60, 70, 80, 90, 100]),
        getPublicKey: () => new Uint8Array(65).fill(1),
        getPublicKeyAlgorithm: () => -7, // ES256
      },
    };

    mockCredentials.create.mockResolvedValue(mockCredential);

    global.navigator = {
      credentials: mockCredentials,
    } as any;

    global.window = {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {} as any,
    } as any;
  });

  it('should generate WebAuthn key successfully', async () => {
    const result = await generateHardwareKey('webauthn', {
      keyName: 'test-key-1',
    });

    expect(result.keyId).toBeDefined();
    expect(result.provider).toBe('webauthn');
    expect(result.publicKey).toBeDefined();
    expect(result.algorithm).toBeDefined();
  });

  it('should support ECDSA-P256 algorithm', async () => {
    const result = await generateHardwareKey('webauthn', {
      algorithm: 'ECDSA-P256',
    });

    expect(result.algorithm).toBe('ECDSA-P256');
  });

  it('should handle key generation failure gracefully', async () => {
    mockCredentials.create.mockRejectedValue(new Error('User cancelled'));

    await expect(
      generateHardwareKey('webauthn')
    ).rejects.toThrow();
  });
});

describe('Hardware Security - Signing Operations', () => {
  let mockKeyInfo: HardwareKeyInfo;

  beforeEach(() => {
    mockKeyInfo = {
      keyId: 'test-key-123',
      provider: 'webauthn',
      publicKey: Buffer.from(new Uint8Array(65).fill(1)).toString('hex'),
      algorithm: 'ECDSA-P256',
      createdAt: Date.now(),
    };

    const mockAssertion = {
      id: 'test-key-123',
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: new Uint8Array(37).fill(1),
        clientDataJSON: new Uint8Array([60, 70, 80]),
        signature: new Uint8Array(64).fill(2),
        userHandle: new Uint8Array([5, 6]),
      },
    };

    mockCredentials.get.mockResolvedValue(mockAssertion);

    global.navigator = {
      credentials: mockCredentials,
    } as any;

    global.window = {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {} as any,
    } as any;
  });

  it('should sign data with hardware key', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const result = await signWithHardwareKey(mockKeyInfo, data);

    expect(result.signature).toBeDefined();
    expect(result.algorithm).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it('should handle Buffer input', async () => {
    const data = Buffer.from([10, 20, 30]);

    const result = await signWithHardwareKey(mockKeyInfo, data);

    expect(result.signature).toBeDefined();
  });

  it('should support user verification', async () => {
    const data = new Uint8Array([5, 10, 15]);

    const result = await signWithHardwareKey(mockKeyInfo, data, {
      requireUserVerification: true,
    });

    expect(result.signature).toBeDefined();
    expect(mockCredentials.get).toHaveBeenCalled();
  });

  it('should handle signing errors', async () => {
    mockCredentials.get.mockRejectedValue(new Error('Timeout'));

    const data = new Uint8Array([1, 2, 3]);

    await expect(
      signWithHardwareKey(mockKeyInfo, data)
    ).rejects.toThrow();
  });
});

describe('Hardware Security - Attestation Verification', () => {
  it('should verify valid attestation', async () => {
    const keyInfo: HardwareKeyInfo = {
      keyId: 'test-key',
      provider: 'webauthn',
      publicKey: 'mock-public-key',
      algorithm: 'ECDSA-P256',
      createdAt: Date.now(),
      attestation: JSON.stringify({
        fmt: 'packed',
        attStmt: Buffer.from([1, 2, 3]).toString('base64'),
        authData: Buffer.from(new Uint8Array(37)).toString('base64'),
      }),
    };

    const result = await verifyHardwareAttestation(keyInfo);

    expect(result.valid).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });

  it('should handle missing attestation', async () => {
    const keyInfo: HardwareKeyInfo = {
      keyId: 'test-key',
      provider: 'webauthn',
      publicKey: 'mock-public-key',
      algorithm: 'ECDSA-P256',
      createdAt: Date.now(),
    };

    const result = await verifyHardwareAttestation(keyInfo);

    expect(result.valid).toBe(false);
  });
});

describe('Hardware Security - Provider Support', () => {
  it('should reject unsupported providers', async () => {
    await expect(
      generateHardwareKey('none' as HardwareSecurityProvider)
    ).rejects.toThrow(/Unsupported/);
  });

  it('should validate provider before operations', async () => {
    const invalidKeyInfo: HardwareKeyInfo = {
      keyId: 'test',
      provider: 'none',
      publicKey: 'test',
      algorithm: 'ECDSA-P256',
      createdAt: Date.now(),
    };

    await expect(
      signWithHardwareKey(invalidKeyInfo, new Uint8Array([1, 2, 3]))
    ).rejects.toThrow();
  });
});

describe('Hardware Security - Real-world Scenarios', () => {
  beforeEach(() => {
    const mockCredential = {
      id: 'real-world-key',
      rawId: new Uint8Array([7, 8, 9]).buffer,
      type: 'public-key',
      response: {
        attestationObject: new Uint8Array(200),
        clientDataJSON: new Uint8Array(150),
        getPublicKey: () => new Uint8Array(65).fill(10),
        getPublicKeyAlgorithm: () => -7,
      },
    };

    const mockAssertion = {
      id: 'real-world-key',
      rawId: new Uint8Array([7, 8, 9]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: new Uint8Array(37).fill(11),
        clientDataJSON: new Uint8Array(150),
        signature: new Uint8Array(64).fill(12),
        userHandle: new Uint8Array([13, 14]),
      },
    };

    mockCredentials.create.mockResolvedValue(mockCredential);
    mockCredentials.get.mockResolvedValue(mockAssertion);

    global.navigator = {
      credentials: mockCredentials,
    } as any;

    global.window = {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {} as any,
    } as any;
  });

  it('should complete full hardware key lifecycle', async () => {
    // 1. Generate key
    const keyInfo = await generateHardwareKey('webauthn', {
      keyName: 'lifecycle-test',
      requireUserVerification: true,
    });

    expect(keyInfo.keyId).toBeDefined();
    expect(keyInfo.publicKey).toBeDefined();

    // 2. Sign data
    const data = new Uint8Array([100, 101, 102]);
    const signature = await signWithHardwareKey(keyInfo, data);

    expect(signature.signature).toBeDefined();

    // 3. Verify attestation
    if (keyInfo.attestation) {
      const verified = await verifyHardwareAttestation(keyInfo);
      expect(verified.valid).toBeDefined();
    }
  });

  it('should support multiple key generation', async () => {
    const key1 = await generateHardwareKey('webauthn', { keyName: 'key-1' });
    const key2 = await generateHardwareKey('webauthn', { keyName: 'key-2' });

    expect(key1.keyId).toBeDefined();
    expect(key2.keyId).toBeDefined();
  });

  it('should handle concurrent signing operations', async () => {
    const keyInfo = await generateHardwareKey('webauthn');

    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);

    const [sig1, sig2] = await Promise.all([
      signWithHardwareKey(keyInfo, data1),
      signWithHardwareKey(keyInfo, data2),
    ]);

    expect(sig1.signature).toBeDefined();
    expect(sig2.signature).toBeDefined();
  });
});

describe('Hardware Security - Integration with Social Recovery', () => {
  beforeEach(() => {
    const mockCredential = {
      id: 'guardian-key',
      rawId: new Uint8Array([20, 21, 22]).buffer,
      type: 'public-key',
      response: {
        attestationObject: new Uint8Array(200),
        clientDataJSON: new Uint8Array(150),
        getPublicKey: () => new Uint8Array(65).fill(20),
        getPublicKeyAlgorithm: () => -7,
      },
    };

    const mockAssertion = {
      id: 'guardian-key',
      rawId: new Uint8Array([20, 21, 22]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: new Uint8Array(37).fill(21),
        clientDataJSON: new Uint8Array(150),
        signature: new Uint8Array(64).fill(22),
        userHandle: new Uint8Array([23, 24]),
      },
    };

    mockCredentials.create.mockResolvedValue(mockCredential);
    mockCredentials.get.mockResolvedValue(mockAssertion);

    global.navigator = {
      credentials: mockCredentials,
    } as any;

    global.window = {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {} as any,
    } as any;
  });

  it('should generate hardware key for guardian', async () => {
    const guardianKey = await generateHardwareKey('webauthn', {
      keyName: 'guardian-alice',
      requireUserVerification: true,
    });

    expect(guardianKey.keyId).toBeDefined();
    expect(guardianKey.publicKey).toBeDefined();
  });

  it('should sign recovery share with hardware key', async () => {
    const guardianKey = await generateHardwareKey('webauthn', {
      keyName: 'guardian-bob',
    });

    // Simulate signing a recovery share
    const shareData = new Uint8Array([30, 31, 32, 33, 34]);
    const signature = await signWithHardwareKey(guardianKey, shareData, {
      requireUserVerification: true,
    });

    expect(signature.signature).toBeDefined();
    expect(signature.timestamp).toBeDefined();
  });
});
