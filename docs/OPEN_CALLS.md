# Open Calls for Contributors

We welcome new contributors. These issues are good starting points and align with near-term milestones.

## Good First Issues
- Replace XOR/base64 demo in `lib/storage/secure-storage.ts` with AES-GCM via WebCrypto and HKDF key derivation.
- Expand BIP39 wordlist and checksum in `lib/vault/seed-vault.ts`.
- Add unit tests for Merkle tree (`lib/audit/audit-log.ts`) with golden vectors.

## Intermediate
- Implement Argon2id KDF (WASM) fallback where WebCrypto PBKDF2 is unavailable.
- Formalize Merkle proofs (left/right ordering) and verification tests.
- Tauri secure storage bridge: OS keychain integration for master key wrapping.

## Advanced
- Add a WASM crypto provider interface for PQ algorithms (Dilithium/Kyber) behind `crypto/agility`.
- Minimal relying-party backend for WebAuthn attestation and credential portability.
- Optional on-chain anchoring adapters (ICP/EVM) with CI testnets.

See `docs/GRANTS.md` for milestones and impact.
