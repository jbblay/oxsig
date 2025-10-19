# Grant Proposal Overview

OxSig is an open-source, offline-first, quantum-resilient signing and identity toolkit. This document summarizes impact, milestones, and funding needs for grant programs.

## Problem Statement
Digital signatures and identity systems are not uniformly quantum-resistant, lack robust offline modes, and are difficult to verify independently. Many users (journalists, legal teams, NGOs) operate in constrained, low-connectivity, or hostile environments.

## Solution
- Desktop (Tauri) and PWA with offline signing and secure local storage
- Crypto agility: standard today, hybrid/post-quantum tomorrow
- Verifiable audit trail (Merkle roots) with optional on-chain anchoring
- Biometric (WebAuthn) local gate and device pairing for usability

## Impact
- Privacy-preserving, user-controlled signing workflows
- Works without accounts or servers; optional sync later
- Vendor-neutral standardization path (pluggable providers)

## Milestones
1) Security Hardening (Core)
- Replace demo storage with AES-GCM + HKDF/Argon2id
- Full BIP39 list, checksum, and SLIP-39/SSS library integration
- Canonical Merkle tree + proofs; verification harness

2) PQ/HYBRID Enablement
- WASM crypto provider scaffold; plug Dilithium/Kyber via audited libs
- Hybrid suite negotiation and end-to-end test vectors

3) WebAuthn & Recovery
- Relying-party minimal backend (optional) with attestation storage
- Cross-device credential portability and recovery flows

4) Anchoring & Interop
- IPC/Tauri commands for secure anchoring
- Optional ICP/EVM anchor adapters and CI testnets

5) Documentation & Community
- Security whitepaper, threat model, and integration guides
- Contributor experience (examples, tests, CI)

## Budget (indicative)
- Security engineering and audits: $25k–$60k
- Cryptography R&D and WASM provider: $20k–$40k
- Backend (WebAuthn RP, anchoring adapters): $10k–$25k
- Documentation, community, and CI: $5k–$10k

## Sustainability
- Dual funding: open collective + grants
- Modular architecture enables paid support and enterprise add-ons without locking core features

## Success Criteria
- Reproducible builds; end-to-end tests for signing/verification
- Public test vectors for suites; verified PQ/hybrid demo
- Independent audit of storage/crypto modules

## How to Fund
- GitHub Sponsors, OpenCollective, or direct grant programs (NGOs, digital rights, security funds)