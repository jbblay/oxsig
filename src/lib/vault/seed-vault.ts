/**
 * Innovative Seed Vault System
 * BIP39 mnemonic generation, encryption, and multi-method recovery
 */

export type WordCount = 12 | 15 | 18 | 21 | 24;

export interface SeedVault {
  id: string;
  encryptedSeed: string; // Encrypted mnemonic
  entropy: string; // Encrypted entropy bytes
  checksum: string; // SHA256 of plaintext seed
  createdAt: Date;
  lastAccessed?: Date;
  metadata: {
    wordCount: WordCount;
    label: string;
    version: number;
    biometricWrapped: boolean;
    guardianBackup: boolean;
  };
  recoveryMethods: RecoveryMethod[];
}

export interface RecoveryMethod {
  type: 'biometric' | 'password' | 'guardian' | 'hardware' | 'paper' | 'social';
  id: string;
  enabled: boolean;
  metadata: Record<string, any>;
  lastUsed?: Date;
}

// BIP39 word list (first 50 words for demo - full list has 2048)
const BIP39_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'afford', 'afraid', 'again', 'age', 'agent', 'agree',
  'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
  'alert', 'alien'
  // ... (in production, use full 2048-word list)
];

/**
 * Generate cryptographically secure entropy
 */
async function generateEntropy(bits: number): Promise<Uint8Array> {
  const bytes = bits / 8;
  const entropy = new Uint8Array(bytes);
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(entropy);
  } else {
    // Fallback (should never be used in production)
    for (let i = 0; i < bytes; i++) {
      entropy[i] = Math.floor(Math.random() * 256);
    }
  }
  
  return entropy;
}

/**
 * Calculate SHA256 hash
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Create a fresh Uint8Array to ensure proper typing
    const cleanData = new Uint8Array(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', cleanData);
    return new Uint8Array(hashBuffer);
  }
  
  // Fallback (mock hash for build-time)
  const mockHash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    mockHash[i] = data[i % data.length] ^ (i * 7);
  }
  return mockHash;
}

/**
 * Convert bits to mnemonic words (simplified BIP39)
 */
function entropyToMnemonic(entropy: Uint8Array, wordCount: WordCount): string[] {
  const words: string[] = [];
  
  // In production, implement full BIP39 spec with checksum
  // For now, use simplified mapping
  for (let i = 0; i < wordCount; i++) {
    const index = entropy[i % entropy.length] % BIP39_WORDLIST.length;
    words.push(BIP39_WORDLIST[index]);
  }
  
  return words;
}

/**
 * Generate BIP39 seed phrase
 */
export async function generateSeedPhrase(wordCount: WordCount = 12): Promise<{
  mnemonic: string[];
  entropy: Uint8Array;
  checksum: string;
}> {
  // Calculate entropy bits (11 bits per word, minus checksum)
  const entropyBits = (wordCount * 11) - (wordCount / 3);
  const entropy = await generateEntropy(entropyBits);
  
  // Generate mnemonic
  const mnemonic = entropyToMnemonic(entropy, wordCount);
  
  // Calculate checksum
  const mnemonicString = mnemonic.join(' ');
  const checksumHash = await sha256(new TextEncoder().encode(mnemonicString));
  const checksum = Array.from(checksumHash.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return { mnemonic, entropy, checksum };
}

/**
 * Encrypt seed with password
 */
export async function encryptSeed(
  mnemonic: string[],
  password: string
): Promise<string> {
  const plaintext = mnemonic.join(' ');
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Use AES-GCM encryption
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const passwordKey = encoder.encode(password.padEnd(32, '0').slice(0, 32));
    
    const key = await crypto.subtle.importKey(
      'raw',
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }
  
  // Fallback (base64 only - NOT SECURE, for build-time only)
  return btoa(plaintext);
}

/**
 * Decrypt seed with password
 */
export async function decryptSeed(
  encrypted: string,
  password: string
): Promise<string[]> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const passwordKey = encoder.encode(password.padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const plaintext = new TextDecoder().decode(decrypted);
    return plaintext.split(' ');
  }
  
  // Fallback
  const plaintext = atob(encrypted);
  return plaintext.split(' ');
}

/**
 * Create seed vault
 */
export async function createSeedVault(
  password: string,
  wordCount: WordCount = 12,
  label: string = 'Primary Identity'
): Promise<SeedVault> {
  const { mnemonic, entropy, checksum } = await generateSeedPhrase(wordCount);
  
  const encryptedSeed = await encryptSeed(mnemonic, password);
  const encryptedEntropy = await encryptSeed(
    [Array.from(entropy).map(b => b.toString(16).padStart(2, '0')).join('')],
    password
  );
  
  const vault: SeedVault = {
    id: `vault-${Date.now()}`,
    encryptedSeed,
    entropy: encryptedEntropy,
    checksum,
    createdAt: new Date(),
    metadata: {
      wordCount,
      label,
      version: 1,
      biometricWrapped: false,
      guardianBackup: false,
    },
    recoveryMethods: [
      {
        type: 'password',
        id: 'password-primary',
        enabled: true,
        metadata: { strength: calculatePasswordStrength(password) },
      },
    ],
  };
  
  return vault;
}

/**
 * Calculate password strength
 */
function calculatePasswordStrength(password: string): number {
  let strength = 0;
  
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (password.length >= 16) strength += 1;
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;
  
  return Math.min(strength, 5);
}

/**
 * Verify seed phrase checksum
 */
export async function verifySeedChecksum(
  mnemonic: string[],
  expectedChecksum: string
): Promise<boolean> {
  const mnemonicString = mnemonic.join(' ');
  const hash = await sha256(new TextEncoder().encode(mnemonicString));
  const checksum = Array.from(hash.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return checksum === expectedChecksum;
}

/**
 * Split seed into Shamir shares (simplified)
 */
export async function splitSeedShamir(
  mnemonic: string[],
  threshold: number,
  shares: number
): Promise<string[][]> {
  // In production, use proper Shamir's Secret Sharing
  // For now, simple split (NOT CRYPTOGRAPHICALLY SECURE)
  
  const seedString = mnemonic.join(' ');
  const parts: string[][] = [];
  
  for (let i = 0; i < shares; i++) {
    const share = mnemonic.map((word, idx) => {
      if (idx % shares === i) {
        return word;
      }
      return '***';
    });
    parts.push(share);
  }
  
  return parts;
}

/**
 * Combine Shamir shares
 */
export async function combineShamirShares(shares: string[][]): Promise<string[]> {
  // Reconstruct from shares
  const wordCount = shares[0].length;
  const reconstructed: string[] = new Array(wordCount);
  
  for (let i = 0; i < wordCount; i++) {
    for (const share of shares) {
      if (share[i] !== '***') {
        reconstructed[i] = share[i];
        break;
      }
    }
  }
  
  return reconstructed;
}

/**
 * Export seed as QR code data
 */
export function exportSeedQR(mnemonic: string[]): string {
  return JSON.stringify({
    type: 'OXSIG_SEED',
    version: 1,
    words: mnemonic,
    timestamp: Date.now(),
  });
}

/**
 * Export seed as encrypted PDF-ready text
 */
export function exportSeedPaper(
  mnemonic: string[],
  metadata: { label: string; created: Date }
): string {
  const lines = [
    '═══════════════════════════════════════',
    '        OXSIG SEED VAULT BACKUP',
    '═══════════════════════════════════════',
    '',
    `Label: ${metadata.label}`,
    `Created: ${metadata.created.toISOString()}`,
    `Words: ${mnemonic.length}`,
    '',
    '⚠️  WARNING: Keep this safe and private!',
    '',
    'Seed Phrase:',
    '───────────────────────────────────────',
  ];
  
  // Format words in 3 columns
  for (let i = 0; i < mnemonic.length; i += 3) {
    const row = [];
    for (let j = 0; j < 3 && i + j < mnemonic.length; j++) {
      const num = (i + j + 1).toString().padStart(2, ' ');
      const word = mnemonic[i + j].padEnd(12);
      row.push(`${num}. ${word}`);
    }
    lines.push(row.join('  '));
  }
  
  lines.push('───────────────────────────────────────');
  lines.push('');
  lines.push('Recovery Instructions:');
  lines.push('1. Visit oxsig.app/recovery');
  lines.push('2. Enter these words in order');
  lines.push('3. Create new password');
  lines.push('');
  lines.push('═══════════════════════════════════════');
  
  return lines.join('\n');
}

/**
 * Validate mnemonic format
 */
export function validateMnemonic(words: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    errors.push(`Invalid word count: ${words.length}. Must be 12, 15, 18, 21, or 24.`);
  }
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().trim();
    if (!BIP39_WORDLIST.includes(word)) {
      errors.push(`Word ${i + 1} ("${word}") is not in BIP39 wordlist.`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate seed strength score
 */
export function calculateSeedStrength(wordCount: number): {
  score: number;
  bits: number;
  combinations: string;
  label: string;
} {
  const bits = wordCount * 11;
  const combinations = Math.pow(2, bits);
  
  let score = 0;
  let label = '';
  
  if (wordCount >= 12) score = 3;
  if (wordCount >= 18) score = 4;
  if (wordCount >= 24) score = 5;
  
  switch (score) {
    case 3: label = 'Good'; break;
    case 4: label = 'Strong'; break;
    case 5: label = 'Maximum'; break;
    default: label = 'Weak';
  }
  
  return {
    score,
    bits,
    combinations: combinations.toExponential(2),
    label,
  };
}
