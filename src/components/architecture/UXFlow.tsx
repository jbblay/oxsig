"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function UXFlow() {
  const steps = [
    { title: "Onboarding", desc: "Generate DID, seed entropy, register (local-first)." },
    { title: "Security Setup", desc: "Choose privacy mode; enable duress; add recovery contacts." },
    { title: "Signing", desc: "Select doc sections; create smart signature with context." },
    { title: "Verification", desc: "Verify VC; anchor digest to chains; confirm consent." },
    { title: "Recovery", desc: "Trigger social recovery flow with threshold confirmations." },
  ];

  return (
    <div className="rounded-lg border bg-card p-3 md:p-4">
      <div className="text-sm font-medium">AI-Assisted UX Flow</div>
      <Separator className="my-2" />
      <ul className="space-y-3 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 md:gap-3">
            <div className="min-w-6 h-6 md:min-w-8 md:h-8 flex items-center justify-center rounded bg-muted text-muted-foreground text-xs md:text-sm flex-shrink-0">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.title}</div>
              <div className="text-muted-foreground text-xs md:text-sm leading-relaxed">{s.desc}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-1.5 md:gap-2">
        <button
          className="px-2 py-1 md:px-3 md:py-1.5 rounded border bg-primary text-primary-foreground text-xs"
          onClick={() => toast.info("AI suggests: Use Anonymity mode for ephemeral chats.")}
        >
          Suggest Privacy
        </button>
        <button
          className="px-2 py-1 md:px-3 md:py-1.5 rounded border bg-primary text-primary-foreground text-xs"
          onClick={() => toast.warning("AI alert: Unusual signing velocity detected.")}
        >
          Duress Warning
        </button>
        <button
          className="px-2 py-1 md:px-3 md:py-1.5 rounded border bg-primary text-primary-foreground text-xs"
          onClick={() => toast.success("Verification steps passed. Anchoring recommended.")}
        >
          Verify & Anchor
        </button>
      </div>
    </div>
  );
}