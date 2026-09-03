"use client";

import {
  Cloud,
  MonitorCog,
  Server,
  Shield,
  TerminalSquare,
} from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LabInstanceStatus, LabOsFamily, LabPlatform } from "@/lib/labs/types";

export type LabMachineNodeData = {
  slug: string;
  label: string;
  shortName: string;
  category: string;
  osFamily: LabOsFamily;
  platform: LabPlatform;
  instanceType: string;
  available: boolean;
  availabilityNote?: string;
  status?: LabInstanceStatus | "planned";
  live?: boolean;
};

export type LabMachineFlowNode = Node<LabMachineNodeData, "machine">;

const OS_BADGES: Record<LabOsFamily, { mark: string; className: string }> = {
  ubuntu: { mark: "U", className: "bg-orange-500/15 text-orange-500 ring-orange-500/25" },
  "amazon-linux": { mark: "AL", className: "bg-amber-500/15 text-amber-500 ring-amber-500/25" },
  rocky: { mark: "R", className: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/25" },
  kali: { mark: "K", className: "bg-sky-500/15 text-sky-500 ring-sky-500/25" },
  windows: { mark: "W", className: "bg-blue-500/15 text-blue-500 ring-blue-500/25" },
};

function statusStyle(status: LabMachineNodeData["status"]) {
  if (status === "running") return { dot: "bg-emerald-500", text: "Running", pulse: true };
  if (["created", "provisioning", "stopping", "destroying", "resetting"].includes(status || "")) {
    return { dot: "bg-amber-500", text: status || "Updating", pulse: true };
  }
  if (status === "stopped") return { dot: "bg-slate-400", text: "Stopped", pulse: false };
  if (status === "failed") return { dot: "bg-red-500", text: "Failed", pulse: false };
  return { dot: "bg-slate-400", text: "Planned", pulse: false };
}

export default function LabMachineNode({ data, selected }: NodeProps<LabMachineFlowNode>) {
  const badge = OS_BADGES[data.osFamily];
  const status = statusStyle(data.status);
  const PlatformIcon = data.platform === "windows" ? MonitorCog : TerminalSquare;

  return (
    <div
      className={`group min-w-[220px] rounded-2xl border bg-background/95 shadow-lg backdrop-blur transition ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="flex items-start gap-3 p-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1 ${badge.className}`}>
          {badge.mark}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="truncate text-sm font-semibold">{data.shortName}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{data.category}</p>
            </div>
            {data.live ? <Cloud className="h-4 w-4 shrink-0 text-primary" aria-label="Live AWS machine" /> : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${status.dot} ${status.pulse ? "animate-pulse" : ""}`} />
              {status.text}
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">{data.instanceType}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><PlatformIcon className="h-3 w-3" />{data.platform}</span>
        <span className="flex items-center gap-1">
          {data.available ? <Server className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
          {data.available ? "AWS ready" : "Activation required"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}
