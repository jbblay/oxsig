"use client";

export type ModuleDef = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
};

export const MODULES: ModuleDef[] = [
  {
    id: "identity",
    title: "Identity & Access",
    description: "Self-sovereign identity with DIDs, ZKP roles, MFA.",
    bullets: [
      "DIDs via DIDKit/Ceramic",
      "Quantum-resistant keys (Kyber/Dilithium)",
      "FIDO2 + behavioral auth",
      "ZKP role validation",
      "Social recovery contracts",
    ],
  },
  {
    id: "encryption",
    title: "Encryption & Data",
    description: "E2EE with optional homomorphic ops and threshold crypto.",
    bullets: ["AES-GCM payloads", "Kyber KEM for PQ key exchange", "Threshold M-of-N", "Homomorphic operations (future)", "Immutable ledger hashing"],
  },
  {
    id: "communication",
    title: "Communication Layer",
    description: "Onion-routed P2P with Kademlia DHT and ephemeral rooms.",
    bullets: ["Onion routing", "Ephemeral rooms with timers", "Federated AI detection", "Secure searchable encryption"],
  },
  {
    id: "signing",
    title: "Document Signing",
    description: "Smart signatures with context and VCs.",
    bullets: ["DID + timestamp + geo + biometrics", "Zero-knowledge co-signatures", "Duress mode decoy + alert", "Selective document masking", "VC emission"],
  },
  {
    id: "infra",
    title: "Network & Infrastructure",
    description: "Multichain anchors, TEEs, offline-first sync, IPFS.",
    bullets: ["Anchors to ICP/EVM/Ordinals", "TEE operations", "Offline-first sync", "IPFS/Web3.Storage"],
  },
  {
    id: "privacy",
    title: "Privacy & Control",
    description: "Consent ledger and selective disclosure.",
    bullets: ["Consent-ledger contracts", "Selective disclosure protocol", "Predictive trust engine"],
  },
  {
    id: "ai",
    title: "AI Security Co-Pilot",
    description: "Local guardian with federated learning.",
    bullets: ["Warn suspicious signing", "Detect fake DIDs/doc tampering", "Suggest optimal settings", "Local sandboxed models"],
  },
];