"use client";

import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type PrivacyMode = "anonymity" | "persistent" | "traceable";

export default function PrivacyModeSwitch({
  value,
  onChange,
}: {
  value: PrivacyMode;
  onChange: (v: PrivacyMode) => void;
}) {
  const items: { value: PrivacyMode; label: string; tip: string }[] = [
    { value: "anonymity", label: "Anonymity", tip: "Ephemeral DIDs, onion P2P, minimal anchors." },
    { value: "persistent", label: "Persistent", tip: "Stable DID, selective disclosure, auditable VC." },
    { value: "traceable", label: "Traceable", tip: "Strong provenance, comprehensive anchors." },
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm mb-2">Privacy Mode</div>
      <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as PrivacyMode)}>
        {items.map((it) => (
          <Tooltip key={it.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={it.value} className="min-w-[8rem]">{it.label}</ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="top">{it.tip}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  );
}