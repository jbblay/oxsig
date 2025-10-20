# Data Flows & Trust Boundaries

## Frontend (Web/Tauri)
- UI/UX routes under `src/app/` (Next.js).
- Local persistence: IndexedDB (audit), localStorage (demo-only), Tauri FS (desktop).
- Crypto: WebCrypto provider for signing/encryption; planned PQ via WASM.

## IPC & Desktop
- Tauri plugins (FS, Dialog, Notification, OS, Shell) are accessed lazily via `src/lib/tauri.ts`.
- Trust boundary: renderer <-> Tauri IPC. No custom commands yet; safe default.

## PWA & Offline
- `public/sw.js` caches critical assets; API calls default to network-first with cache fallback.
- Offline UX via `/offline` route; background sync stub available.

## Backend (Optional)
- Minimal `/api/documents/sync` stub. In static export/Tauri it’s inactive.
- WebAuthn RP and anchoring backends are planned; not required for offline use.

## External Services (Optional)
- Push notifications (VAPID/server), IPFS pinning, anchoring (ICP/EVM) are optional modules.

## Boundaries & Risks
- Storage: move secrets from localStorage to IndexedDB/Tauri secure store.
- Crypto: enforce AES-GCM + KDF; canonical Merkle proofs.
- WebAuthn: add RP server for portability.

See `SECURITY_STATUS.md` and `docs/GRANTS.md` for the hardening plan.
