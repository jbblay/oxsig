"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";

export default function PipelineDescription() {
  const steps = [
    "Identity bootstrap: Generate DID locally; derive key material with entropy seeding; register via DIDKit/Ceramic.",
    "Session setup: Negotiate onion-routed P2P channel (DHT Kademlia); exchange ephemeral keys; select crypto suite.",
    "Encryption: Adaptive selection (Kyber/Dilithium for post-quantum, AES-GCM for payload); optional homomorphic ops.",
    "Policy: Threshold M-of-N for access; ZKP validation of role without disclosing identity; consent checks.",
    "Transport: Onion routing; TEEs perform signing; ledger anchors to ICP/Ethereum/Polygon; IPFS stores encrypted blobs.",
    "Audit & VC: Every signature emits a verifiable credential; selective masking ensures least-privilege visibility.",
    "AI Co-Pilot: Local analysis for duress/coercion signals; recommends privacy mode; federated model updates.",
  ];

  return (
    <div className="rounded-lg border bg-card p-3 md:p-4">
      <div className="text-sm font-medium">Secure Communication Pipeline</div>
      <Separator className="my-2" />
      <ol className="list-decimal ml-4 md:ml-5 space-y-2 text-xs md:text-sm">
        {steps.map((s, i) => (
          <li key={i} className="leading-relaxed">{s}</li>
        ))}
      </ol>
    </div>
  );
}