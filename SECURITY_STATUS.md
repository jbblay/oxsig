# Security Status (October 2025)

This file summarizes which modules are production-ready vs demo-only, and the hardening plan.

## DEMO-ONLY (needs hardening)
- `src/lib/storage/secure-storage.ts` — uses XOR + base64. Replace with AES-GCM, HKDF/Argon2id, authenticated metadata.
- `src/lib/vault/seed-vault.ts` — partial BIP39 list, simplified mnemonic/SSS. Replace with full BIP39/SLIP-39 and audited libs.
- `src/lib/audit/audit-log.ts` — Merkle proof assembly is custom. Adopt canonical left/right ordering and add tests.

## PRODUCTION-LEANING (ok to pilot, add tests)
- `src/lib/crypto/webCryptoProvider.ts` — Uses WebCrypto (Ed25519/ECDSA/AES-GCM/PBKDF2). Add end-to-end vectors and negative tests.
- `src/lib/tauri.ts` — Lazy plugin access; ensure permission prompts and error handling in desktop builds.
- PWA service worker: good defaults; review cache lifetimes for sensitive assets.

## NOT YET WIRED
- PQ/HYBRID provider: planned via WASM; see `docs/GRANTS.md`.
- WebAuthn RP server path: local-only gate implemented; add server-based attestation for portability.

## Actions
- See `docs/OPEN_CALLS.md` and `docs/GRANTS.md` for milestone tasks and budgets.
