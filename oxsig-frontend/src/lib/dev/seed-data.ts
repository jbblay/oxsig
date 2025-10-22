/**
 * Development Data Seeder
 * Generates realistic sample data for testing and demos
 */

import { logAuditEvent } from '@/lib/db/audit';
import { saveVault } from '@/lib/db/vaults';
import { savePairedDevice } from '@/lib/db/devices';
import { createSeedVault, generateSeedPhrase } from '@/lib/vault/seed-vault';
import type { AuditAction } from '@/lib/audit/audit-log';
import type { PairedDevice } from '@/lib/pairing/qr-pairing';

const SAMPLE_USER_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

const AUDIT_ACTIONS: AuditAction[] = [
  'SIGN_DOCUMENT',
  'CREATE_DOCUMENT',
  'UPDATE_DOCUMENT',
  'GRANT_ACCESS',
  'PAIR_DEVICE',
  'ROTATE_KEY',
  'LOGIN',
  'LOGOUT',
  'EXPORT_DATA',
  'SECURITY_ALERT',
];

const DOCUMENT_NAMES = [
  'Employment Contract - Jane Doe.pdf',
  'NDA - Acme Corp.pdf',
  'Software License Agreement.pdf',
  'Board Resolution Q3 2025.pdf',
  'Purchase Order #12345.pdf',
  'Financial Statement 2025.pdf',
  'Partnership Agreement.pdf',
  'Privacy Policy Update.pdf',
  'Service Level Agreement.pdf',
  'Intellectual Property Assignment.pdf',
];

const DEVICE_INFO = [
  { name: 'iPhone 15 Pro', platform: 'iOS', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
  { name: 'MacBook Pro M3', platform: 'macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  { name: 'Samsung Galaxy S24', platform: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
  { name: 'iPad Air', platform: 'iOS', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' },
  { name: 'Windows Desktop', platform: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
];

const VAULT_LABELS = [
  'Personal Recovery',
  'Business Backup',
  'Family Trust',
  'Cold Storage',
  'Emergency Access',
];

/**
 * Generate random timestamp within last N days
 */
function randomPastDate(daysAgo: number): string {
  const now = Date.now();
  const randomMs = Math.floor(Math.random() * daysAgo * 24 * 60 * 60 * 1000);
  return new Date(now - randomMs).toISOString();
}

/**
 * Generate random hash
 */
function randomHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate random DID
 */
function randomDid(): string {
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `did:key:z6Mk${randomPart}${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Seed audit events
 */
export async function seedAuditEvents(count: number = 50): Promise<void> {
  console.log(`🌱 Seeding ${count} audit events...`);
  
  const events = [];
  
  for (let i = 0; i < count; i++) {
    const action = AUDIT_ACTIONS[Math.floor(Math.random() * AUDIT_ACTIONS.length)];
    const timestamp = randomPastDate(30); // Last 30 days
    
    const event = {
      id: `evt_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}`,
      ts: timestamp,
      actorDid: i % 5 === 0 ? randomDid() : SAMPLE_USER_DID,
      action,
      docHash: ['SIGN_DOCUMENT', 'CREATE_DOCUMENT', 'UPDATE_DOCUMENT'].includes(action) 
        ? randomHash() 
        : undefined,
      context: {
        class: Math.random() > 0.7 ? 'LEGAL' : 'PERSONAL' as any,
        device: DEVICE_INFO[Math.floor(Math.random() * DEVICE_INFO.length)].name,
        ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        metadata: {
          documentName: DOCUMENT_NAMES[Math.floor(Math.random() * DOCUMENT_NAMES.length)],
          action: action.toLowerCase().replace('_', ' '),
        }
      },
      sig: Math.random() > 0.3 ? randomHash().substring(0, 64) : undefined,
    };
    
    events.push(event);
  }
  
  // Sort by timestamp
  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  
  // Log all events
  for (const event of events) {
    await logAuditEvent(event as any);
  }
  
  console.log(`✅ Created ${count} audit events`);
}

/**
 * Seed sample vaults
 */
export async function seedVaults(count: number = 3): Promise<void> {
  console.log(`🌱 Seeding ${count} vaults...`);
  
  for (let i = 0; i < count; i++) {
    const wordCount = [12, 15, 18, 21, 24][Math.floor(Math.random() * 5)] as 12 | 15 | 18 | 21 | 24;
    const password = 'Demo123!@#'; // Demo password
    const label = VAULT_LABELS[i] || `Vault ${i + 1}`;
    
    // Create vault with password, wordCount, and label
    const vault = await createSeedVault(password, wordCount, label);
    
    // Save to database
    await saveVault(vault);
    
    console.log(`  ✓ Created vault: ${label} (${wordCount} words)`);
  }
  
  console.log(`✅ Created ${count} vaults`);
}

/**
 * Seed paired devices
 */
export async function seedDevices(count: number = 3): Promise<void> {
  console.log(`🌱 Seeding ${count} devices...`);
  
  for (let i = 0; i < count; i++) {
    const deviceInfo = DEVICE_INFO[i % DEVICE_INFO.length];
    const pairedDaysAgo = Math.floor(Math.random() * 90); // Last 90 days
    
    const device: PairedDevice = {
      id: `dev_${Date.now()}_${i}`,
      userDid: SAMPLE_USER_DID,
      deviceDid: randomDid(),
      devicePubKey: randomHash(),
      deviceInfo: {
        platform: deviceInfo.platform,
        userAgent: deviceInfo.userAgent,
        name: deviceInfo.name,
      },
      pairedAt: new Date(randomPastDate(pairedDaysAgo)),
      lastSeen: new Date(randomPastDate(Math.min(pairedDaysAgo, 7))),
      trusted: i === 0 || Math.random() > 0.5, // First device always trusted
      pushEndpoint: `https://push.example.com/${randomHash().substring(0, 16)}`,
    };
    
    await savePairedDevice(device);
    
    console.log(`  ✓ Paired device: ${deviceInfo.name} (${device.trusted ? 'Trusted' : 'Untrusted'})`);
  }
  
  console.log(`✅ Created ${count} devices`);
}

/**
 * Seed all sample data
 */
export async function seedAllData(): Promise<void> {
  console.log('🚀 Starting development data seeding...\n');
  
  try {
    await seedAuditEvents(50);
    console.log('');
    
    await seedVaults(3);
    console.log('');
    
    await seedDevices(3);
    console.log('');
    
    console.log('✨ All sample data seeded successfully!');
    console.log('\nℹ️  Vault demo password: Demo123!@#');
    console.log('ℹ️  Sample user DID:', SAMPLE_USER_DID);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

/**
 * Clear all development data
 */
export async function clearAllData(): Promise<void> {
  console.log('🧹 Clearing all development data...');
  
  const { clearAuditData } = await import('@/lib/db/audit');
  
  try {
    // Clear audit events
    await clearAuditData();
    console.log('  ✓ Cleared audit events');
    
    // Clear vaults - need to implement clearVaults
    console.log('  ⚠️  Vault clearing not implemented - use browser DevTools');
    
    // Clear devices - need to implement clearDevices
    console.log('  ⚠️  Device clearing not implemented - use browser DevTools');
    
    console.log('\n✅ Development data cleared (partial)');
    console.log('💡 For complete reset, clear IndexedDB in browser DevTools');
  } catch (error) {
    console.error('❌ Clearing failed:', error);
    throw error;
  }
}
