/**
 * Test Setup
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { sha512 } from '@noble/hashes/sha512';
import * as ed from '@noble/ed25519';

// Configure Ed25519 hash function for v3.0+
// The library requires an explicit SHA-512 implementation
// Set both sync and async versions in the hashes object
(ed as any).hashes.sha512 = (...m: Uint8Array[]) => sha512((ed as any).etc.concatBytes(...m));
(ed as any).hashes.sha512Async = async (...m: Uint8Array[]) => sha512((ed as any).etc.concatBytes(...m));

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/test',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1,
})) as any;

// Mock IndexedDB
global.indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
  databases: vi.fn(),
} as any;
