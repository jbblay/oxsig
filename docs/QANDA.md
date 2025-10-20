# Q&A Guide

Use this as a quick index for deep dives.

## Crypto & Keys
- Files: `src/lib/crypto/*`
- Ask: Which suite is active? How is migration to PQ planned? What are test vectors?

## Seed Vault
- Files: `src/lib/vault/seed-vault.ts`
- Ask: BIP39/SLIP-39 compliance? KDF choice? Recovery UX?

## Secure Storage
- Files: `src/lib/storage/secure-storage.ts`
- Ask: Encryption/KDF? Metadata authentication? Desktop keychain wrapping?

## Audit & Merkle
- Files: `src/lib/audit/audit-log.ts`, `src/lib/db/audit.ts`
- Ask: Canonical proof format? Inclusion verification tests? Anchoring strategy?

## WebAuthn
- Files: `src/lib/auth/webauthn.ts`
- Ask: RP server flow? Attestation storage? Cross-device portability?

## Tauri Desktop
- Files: `src/lib/tauri.ts`, `src-tauri/*`
- Ask: IPC commands? Permission prompts? Secure storage integration?

## PWA & Offline
- Files: `public/sw.js`, `public/manifest.webmanifest`
- Ask: Cache policies for sensitive assets? Background sync? Push?
