import { z } from "zod";
export const ENGINEERING_MISSIONS = [
  {
    id: "docker-delivery",
    version: 1,
    title: "Deliver a reachable service",
    district: "Service delivery",
    missionId: "deploy",
    prerequisites: [],
    minutes: 20,
    ticket:
      "Bring an nginx service online at host port 18080 using the reserved Academy container.",
    hypotheses: [
      {
        id: "inspect-mapping",
        label: "Inspect the published ports and HTTP response",
        safe: true,
        feedback:
          "Good: establish observable state before changing configuration.",
      },
      {
        id: "disable-firewall",
        label: "Disable every firewall rule",
        safe: false,
        feedback:
          "Too broad. Inspect the specific port mapping first; keep unrelated protection intact.",
      },
    ],
    requiresIncident: false,
  },
  {
    id: "docker-incident",
    version: 1,
    title: "Restore a broken service",
    district: "Incident response",
    missionId: "repair",
    prerequisites: ["deploy"],
    minutes: 15,
    ticket:
      "Diagnose an intentionally misconfigured Academy container and restore service without changing unrelated resources.",
    hypotheses: [
      {
        id: "compare-evidence",
        label: "Compare expected and actual host/container ports",
        safe: true,
        feedback: "Good: use the discrepancy to choose a bounded repair.",
      },
      {
        id: "delete-all",
        label: "Remove every container and start over",
        safe: false,
        feedback:
          "That destroys unrelated work. Limit the repair to the Academy container.",
      },
    ],
    requiresIncident: true,
  },
  {
    id: "docker-durability",
    version: 1,
    title: "Keep data through replacement",
    district: "State and reliability",
    missionId: "persist",
    prerequisites: ["deploy", "repair"],
    minutes: 25,
    ticket:
      "Demonstrate named-volume data persistence in the Academy container.",
    hypotheses: [
      {
        id: "verify-volume",
        label: "Inspect the mount and verify the persisted marker",
        safe: true,
        feedback:
          "Good: distinguish container lifecycle from volume lifecycle.",
      },
      {
        id: "trust-container",
        label: "Assume a running container guarantees durable data",
        safe: false,
        feedback:
          "Running state alone proves neither a mounted volume nor persistent content.",
      },
    ],
    requiresIncident: false,
  },
] as const;
export type EngineeringTemplate = (typeof ENGINEERING_MISSIONS)[number];
export const engineCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      templateId: z.enum([
        "docker-delivery",
        "docker-incident",
        "docker-durability",
      ]),
      mode: z.enum(["practice", "troublefest"]),
      labInstanceId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("hypothesis"),
      runId: z.string().uuid(),
      revision: z.number().int().min(0),
      choice: z.string().max(50),
    })
    .strict(),
  z
    .object({
      action: z.literal("prepare"),
      runId: z.string().uuid(),
      revision: z.number().int().min(0),
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("verify"),
      runId: z.string().uuid(),
      revision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("fork"),
      runId: z.string().uuid(),
      revision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("abandon"),
      runId: z.string().uuid(),
      revision: z.number().int().min(0),
    })
    .strict(),
]);
export function engineeringTemplate(id: string, version = 1) {
  return ENGINEERING_MISSIONS.find((t) => t.id === id && t.version === version);
}
export function templateUnlocked(
  template: EngineeringTemplate,
  verified: string[],
) {
  return template.prerequisites.every((id) => verified.includes(id));
}
