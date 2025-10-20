"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

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
}) => {
  // Split long labels into multiple lines for better mobile display
  const words = label.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  const maxCharsPerLine = w > 200 ? 25 : 20;
  
  words.forEach(word => {
    if ((currentLine + word).length <= maxCharsPerLine) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      {lines.map((line, i) => (
        <text
          key={i}
          x={x + 8}
          y={y + 16 + (i * 12)}
          fontSize={9}
          fill="hsl(var(--foreground))"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

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
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
};

export default function SystemDiagram({ compact = false }: { compact?: boolean }) {
  const isMobileHook = useIsMobile();
  const isMobile = compact || isMobileHook;

  // Define simplified nodes for mobile stacked view
  const nodes = [
    "Identity & Access (SSI, DIDs, ZKP, MFA)",
    "Encryption & Data (E2EE, Threshold, HE)",
    "Network & Infra (TEE, IPFS, ICP, Multichain)",
    "Communication Layer (Onion P2P, DHT, Ephemeral)",
    "Document Signing (Smart Signatures, VC)",
    "Privacy & Control (Consent Ledger, Selective Disclosure)",
    "AI Security Co-Pilot (Local, Federated)",
    "Future-Proofing (Quantum-safe, Mesh/Sat)",
  ];

  const [expanded, setExpanded] = React.useState<number | null>(null);

  return (
    <div className="w-full rounded-lg border bg-card p-2 sm:p-3 md:p-4 max-w-5xl mx-auto overflow-hidden">
      <div className="mb-2 text-xs sm:text-sm text-muted-foreground font-medium">High-level System Diagram</div>

      {isMobile ? (
        <div className="space-y-1.5">
          {nodes.map((n, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full text-left p-2 rounded-md border bg-muted/5 flex items-center justify-between hover:bg-muted/10 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-xs leading-tight line-clamp-2">{n}</div>
                {expanded === i ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">Tap again to collapse</div>
                ) : null}
              </div>
              <div className="ml-2 text-muted-foreground text-xs flex-shrink-0">{expanded === i ? '−' : '+'}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <div className="w-full">
            <svg viewBox="0 0 600 350" preserveAspectRatio="xMidYMid meet" className="w-full h-auto max-h-[250px] sm:max-h-[280px] md:max-h-[320px]">
              <Box x={20} y={20} w={160} h={50} label="Identity & Access" />
              <Box x={200} y={20} w={160} h={50} label="Encryption & Data" />
              <Box x={380} y={20} w={160} h={50} label="Network & Infra" />
              <Box x={30} y={100} w={160} h={60} label="Communication Layer" />
              <Box x={210} y={100} w={160} h={60} label="Document Signing" />
              <Box x={390} y={100} w={160} h={60} label="Privacy & Control" />
              <Box x={60} y={190} w={160} h={60} label="AI Security Co-Pilot" />
              <Box x={280} y={190} w={160} h={60} label="Future-Proofing" />
              <Arrow x1={100} y1={70} x2={280} y2={100} label="Keys" />
              <Arrow x1={280} y1={70} x2={290} y2={100} label="Crypto" />
              <Arrow x1={460} y1={70} x2={470} y2={100} label="Storage" />
              <Arrow x1={110} y1={160} x2={290} y2={160} label="Content" />
              <Arrow x1={290} y1={160} x2={470} y2={160} label="Consent" />
              <Arrow x1={140} y1={250} x2={290} y2={160} label="Risk" />
              <Arrow x1={360} y1={250} x2={470} y2={160} label="Policy" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}