"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function UXFlow({ compact = false }: { compact?: boolean }) {
  const steps = [
    { title: "Onboarding", desc: "Generate DID, seed entropy, register (local-first)." },
    { title: "Security Setup", desc: "Choose privacy mode; enable duress; add recovery contacts." },
    { title: "Signing", desc: "Select doc sections; create smart signature with context." },
    { title: "Verification", desc: "Verify VC; anchor digest to chains; confirm consent." },
    { title: "Recovery", desc: "Trigger social recovery flow with threshold confirmations." },
  ];

  return (
    <div className={`rounded-lg border bg-card ${compact ? 'p-2' : 'p-3 md:p-4'} overflow-hidden`}>
      <div className={`${compact ? 'text-xs font-medium' : 'text-sm font-medium'}`}>AI-Assisted UX Flow</div>
      <Separator className="my-2" />
      <ul className={`space-y-2 ${compact ? 'text-[10px]' : 'text-xs md:text-sm'}`}>
        {steps.map((s, i) => (
            <li key={i} className={`flex items-start gap-2 ${compact ? 'gap-1.5' : 'md:gap-2.5'}`}>
            <div className={`${compact ? 'min-w-4 h-4' : 'min-w-5 h-5 md:min-w-6 md:h-6'} flex items-center justify-center rounded bg-muted text-muted-foreground ${compact ? 'text-[9px]' : 'text-xs md:text-sm'} flex-shrink-0`}>
              {i + 1}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className={`font-medium ${compact ? 'text-[10px]' : 'text-xs'} break-words`}>{s.title}</div>
              <div className={`text-muted-foreground ${compact ? 'text-[9px]' : 'text-xs md:text-sm'} leading-tight break-words`}>{s.desc}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1 md:gap-1.5">
        <button
          className={`px-2 py-1 rounded border bg-primary text-primary-foreground ${compact ? 'text-[9px]' : 'text-xs'}`}
          onClick={() => toast.info("AI suggests: Use Anonymity mode for ephemeral chats.")}
        >
          {compact ? 'Privacy' : 'Suggest Privacy'}
        </button>
        <button
          className={`px-2 py-1 rounded border bg-primary text-primary-foreground ${compact ? 'text-[9px]' : 'text-xs'}`}
          onClick={() => toast.warning("AI alert: Unusual signing velocity detected.")}
        >
          {compact ? 'Alert' : 'Duress Warning'}
        </button>
        <button
          className={`px-2 py-1 rounded border bg-primary text-primary-foreground ${compact ? 'text-[9px]' : 'text-xs'}`}
          onClick={() => toast.success("Verification steps passed. Anchoring recommended.")}
        >
          {compact ? 'Verify' : 'Verify & Anchor'}
        </button>
      </div>
    </div>
  );
}