"use client";

import * as React from "react";

const Box = ({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={8} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
    <text
      x={x + 12}
      y={y + 22}
      fontSize={12}
      fill="hsl(var(--foreground))"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {label}
    </text>
  </g>
);

const Arrow = ({
  x1,
  y1,
  x2,
  y2,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}) => {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--foreground))" />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="hsl(var(--foreground))"
        strokeWidth={1.5}
        markerEnd="url(#arrow)"
      />
      {label ? (
        <text
          x={midX + 4}
          y={midY - 4}
          fontSize={11}
          fill="hsl(var(--muted-foreground))"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
};

export default function SystemDiagram() {
  return (
    <div className="w-full rounded-lg border bg-card p-4">
      <div className="mb-2 text-sm text-muted-foreground">High-level System Diagram</div>
      <svg viewBox="0 0 920 520" className="w-full h-auto">
        <Box x={40} y={40} w={200} h={70} label="Identity & Access (SSI, DIDs, ZKP, MFA)" />
        <Box x={360} y={40} w={240} h={70} label="Encryption & Data (E2EE, Threshold, HE)" />
        <Box x={660} y={40} w={220} h={70} label="Network & Infra (TEE, IPFS, ICP, Multichain)" />
        <Box x={60} y={170} w={240} h={90} label="Communication Layer (Onion P2P, DHT, Ephemeral)" />
        <Box x={360} y={170} w={240} h={90} label="Document Signing (Smart Signatures, VC)" />
        <Box x={660} y={170} w={220} h={90} label="Privacy & Control (Consent Ledger, Selective Disclosure)" />
        <Box x={120} y={330} w={240} h={90} label="AI Security Co-Pilot (Local, Federated)" />
        <Box x={480} y={330} w={240} h={90} label="Future-Proofing (Quantum-safe, Mesh/Sat)" />
        <Arrow x1={140} y1={110} x2={480} y2={170} label="Key Mgmt / Policy" />
        <Arrow x1={480} y1={110} x2={480} y2={170} label="Crypto Ops" />
        <Arrow x1={770} y1={110} x2={770} y2={170} label="Anchors / Storage" />
        <Arrow x1={180} y1={260} x2={480} y2={260} label="Signed Content" />
        <Arrow x1={480} y1={260} x2={770} y2={260} label="Consent & Disclosure" />
        <Arrow x1={240} y1={420} x2={480} y2={260} label="Risk Scoring" />
        <Arrow x1={600} y1={420} x2={770} y2={260} label="Policy Optimization" />
      </svg>
    </div>
  );
}