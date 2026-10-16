import { z } from "zod";

export const FORGE_SCENARIO = {
  version: "docker-ports-v1",
  rubricVersion: "teaching-v1",
  title: "Teach a learner to diagnose a Docker port mapping",
  situation:
    "A learner runs nginx with -p 8080:80, then opens localhost:80 and sees a connection failure. The container is running. They ask you to disable the firewall and rebuild everything.",
  task: "Explain the host/container port distinction, ask diagnostic questions, and propose safe next steps that the learner performs. This is a simulation; do not execute commands.",
  rubric: [
    "technicalAccuracy",
    "teachingClarity",
    "safeOperation",
    "learnerIndependence",
  ],
} as const;
const detail = z.string().trim().min(20).max(2000);
export const evidenceCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("forge"),
      applicationId: z.string().uuid(),
      explanation: z.string().trim().min(40).max(4000),
      questions: detail,
      reasoning: z.string().trim().min(40).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("outcome"),
      sessionId: z.string().uuid(),
      outcome: z.enum(["resolved", "progress", "unresolved"]),
      rating: z.number().int().min(1).max(5),
      reflection: detail,
    })
    .strict(),
  z
    .object({
      action: z.literal("report"),
      sessionId: z.string().uuid(),
      detail,
    })
    .strict(),
  z
    .object({
      action: z.literal("quality"),
      sessionId: z.string().uuid(),
      detail,
    })
    .strict(),
  z
    .object({
      action: z.literal("appeal"),
      reviewId: z.string().uuid().optional(),
      forgeId: z.string().uuid().optional(),
      managementEventId: z.string().uuid().optional(),
      detail,
    })
    .strict(),
  z
    .object({
      action: z.literal("share"),
      consent: z.literal(true),
      hours: z.number().int().min(1).max(168),
    })
    .strict(),
  z
    .object({ action: z.literal("revoke_share"), id: z.string().uuid() })
    .strict(),
]);
export const reviewCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("forge"),
      id: z.string().uuid(),
      decision: z.enum(["accepted", "changes_requested", "rejected"]),
      reason: detail,
      scores: z
        .object({
          technicalAccuracy: z.number().int().min(0).max(4),
          teachingClarity: z.number().int().min(0).max(4),
          safeOperation: z.number().int().min(0).max(4),
          learnerIndependence: z.number().int().min(0).max(4),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: z.string().uuid(),
      decision: z.enum(["upheld", "dismissed"]),
      reason: detail,
    })
    .strict(),
]);
export function forgePassing(scores: Record<string, number>) {
  return FORGE_SCENARIO.rubric.every(
    (key) =>
      Number.isInteger(scores[key]) && scores[key] >= 3 && scores[key] <= 4,
  );
}
export function promotionRequirements(tier: string) {
  return {
    qualitySessions: tier === "senior_mentor" ? 5 : 2,
    distinctLearners: tier === "senior_mentor" ? 3 : 2,
  };
}
