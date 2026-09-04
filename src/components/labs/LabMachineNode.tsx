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

const OS_ICON_META: Record<LabOsFamily, { label: string; className: string }> = {
  ubuntu: { label: "Ubuntu", className: "text-[#E95420]" },
  "amazon-linux": { label: "Amazon Linux", className: "text-[#FF9900]" },
  rocky: { label: "Rocky Linux", className: "text-[#10B981]" },
  kali: { label: "Kali Linux", className: "text-[#557C94]" },
  windows: { label: "Windows", className: "text-[#00A4EF]" },
};

export function LabOsIcon({ osFamily, className = "h-5 w-5" }: { osFamily: LabOsFamily; className?: string }) {
  const meta = OS_ICON_META[osFamily];

  if (osFamily === "ubuntu") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={meta.label} className={`${className} ${meta.className}`} fill="currentColor">
        <path d="M17.61.455a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zM12.92.8C8.923.777 5.137 2.941 3.148 6.451a4.5 4.5 0 0 1 .26-.007 4.92 4.92 0 0 1 2.585.737A8.316 8.316 0 0 1 12.688 3.6 4.944 4.944 0 0 1 13.723.834 11.008 11.008 0 0 0 12.92.8zm9.226 4.994a4.915 4.915 0 0 1-1.918 2.246 8.36 8.36 0 0 1-.273 8.303 4.89 4.89 0 0 1 1.632 2.54 11.156 11.156 0 0 0 .559-13.089zM3.41 7.932A3.41 3.41 0 0 0 0 11.342a3.41 3.41 0 0 0 3.41 3.409 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zm2.027 7.866a4.908 4.908 0 0 1-2.915.358 11.1 11.1 0 0 0 7.991 6.698 11.234 11.234 0 0 0 2.422.249 4.879 4.879 0 0 1-.999-2.85 8.484 8.484 0 0 1-.836-.136 8.304 8.304 0 0 1-5.663-4.32zm11.405.928a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41z" />
      </svg>
    );
  }

  if (osFamily === "kali") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={meta.label} className={`${className} ${meta.className}`} fill="currentColor">
        <path d="M12.778 5.943s-1.97-.13-5.327.92c-3.42 1.07-5.36 2.587-5.36 2.587s5.098-2.847 10.852-3.008zm7.351 3.095.257-.017s-1.468-1.78-4.278-2.648c1.58.642 2.954 1.493 4.021 2.665zm.42.74c.039-.068.166.217.263.337.004.024.01.039-.045.027-.005-.025-.013-.032-.013-.032s-.135-.08-.177-.137c-.041-.057-.049-.157-.028-.195zm3.448 8.479s.312-3.578-5.31-4.403a18.277 18.277 0 0 0-2.524-.187c-4.506.06-4.67-5.197-1.275-5.462 1.407-.116 3.087.643 4.73 1.408-.007.204.002.385.136.552.134.168.648.35.813.445.164.094.691.43 1.014.85.07-.131.654-.512.654-.512s-.14.003-.465-.119c-.326-.122-.713-.49-.722-.511-.01-.022-.015-.055.06-.07.059-.049-.072-.207-.13-.265-.058-.058-.445-.716-.454-.73-.009-.016-.012-.031-.04-.05-.085-.027-.46.04-.46.04s-.575-.283-.774-.893c.003.107-.099.224 0 .469-.3-.127-.558-.344-.762-.88-.12.305 0 .499 0 .499s-.707-.198-.82-.85c-.124.293 0 .469 0 .469s-1.153-.602-3.069-.61c-1.283-.118-1.55-2.374-1.43-2.754 0 0-1.85-.975-5.493-1.406-3.642-.43-6.628-.065-6.628-.065s6.45-.31 11.617 1.783c.176.785.704 2.094.989 2.723-.815.563-1.733 1.092-1.876 2.97-.143 1.878 1.472 3.53 3.474 3.58 1.9.102 3.214.116 4.806.942 1.52.84 2.766 3.4 2.89 5.703.132-1.709-.509-5.383-3.5-6.498 4.181.732 4.549 3.832 4.549 3.832zM12.68 5.663l-.15-.485s-2.484-.441-5.822-.204C3.37 5.211 0 6.38 0 6.38s6.896-1.735 12.68-.717Z" />
      </svg>
    );
  }

  if (osFamily === "rocky") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={meta.label} className={`${className} ${meta.className}`} fill="currentColor">
        <path d="M23.332 15.957c.433-1.239.668-2.57.668-3.957 0-6.627-5.373-12-12-12S0 5.373 0 12c0 3.28 1.315 6.251 3.447 8.417L15.62 8.245l3.005 3.005zm-2.192 3.819l-5.52-5.52L6.975 22.9c1.528.706 3.23 1.1 5.025 1.1 3.661 0 6.94-1.64 9.14-4.224z" />
      </svg>
    );
  }

  if (osFamily === "windows") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={meta.label} className={`${className} ${meta.className}`} fill="currentColor">
        <path d="M2 3.25 10.75 2v9H2V3.25Zm10.25-1.47L22 0.4V11h-9.75V1.78ZM2 12.5h8.75v9L2 20.25V12.5Zm10.25 0H22v10.6l-9.75-1.38V12.5Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={meta.label} className={`${className} ${meta.className}`} fill="currentColor">
      <path d="M12 2.5 5.2 17.4h3.1l1.45-3.35h4.5l1.45 3.35h3.1L12 2.5Zm0 5.35 1.18 2.75h-2.36L12 7.85Zm-5.35 10.8.8 1.28c2.91 1.74 6.19 1.74 9.1 0l.8-1.28c-3.44 1.75-7.26 1.75-10.7 0Z" />
    </svg>
  );
}

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
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 ring-1 ring-border">
          <LabOsIcon osFamily={data.osFamily} className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{data.label}</p>
                {selected ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Selected</span> : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{data.shortName} · {data.category}</p>
            </div>
            {data.live ? <Cloud className="h-4 w-4 shrink-0 text-primary" aria-label="Live in AWS" /> : null}
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
          {data.live ? <Cloud className="h-3 w-3" /> : data.available ? <Server className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
          {data.live ? "Live in AWS" : data.available ? "Launchable" : "Activation required"}
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
