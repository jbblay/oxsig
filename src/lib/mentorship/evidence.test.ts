import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ query: mock.query }),
  transaction: async (fn: any) => fn({ query: mock.query }),
}));
vi.mock("@/lib/learning/transcript-server", () => ({
  loadProvedSkillTranscript: async () => ({ items: [] }),
}));
import {
  commandEvidence,
  decideEvidence,
  publicPassport,
  assertPromotionEvidence,
} from "./evidence";
import { evidenceCommandSchema, forgePassing } from "./evidence-policy";
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  mock.query.mockReset().mockResolvedValue({ rows: [] });
});
describe("evidence security", () => {
  it("rejects forged owner, scores and approval in applicant submissions", () => {
    expect(
      evidenceCommandSchema.safeParse({
        action: "forge",
        applicationId: id,
        explanation: "x".repeat(40),
        questions: "x".repeat(20),
        reasoning: "x".repeat(40),
        ownerId: other,
        scores: { safeOperation: 4 },
        status: "accepted",
      }).success,
    ).toBe(false);
  });
  it("requires all four dimensions, not a high average", () => {
    expect(
      forgePassing({
        technicalAccuracy: 4,
        teachingClarity: 4,
        safeOperation: 0,
        learnerIndependence: 4,
      }),
    ).toBe(false);
    expect(
      forgePassing({
        technicalAccuracy: 3,
        teachingClarity: 4,
        safeOperation: 3,
        learnerIndependence: 4,
      }),
    ).toBe(true);
  });
  it("rejects cross-account audition application", async () => {
    await expect(
      commandEvidence(owner, {
        action: "forge",
        applicationId: id,
        explanation: "x".repeat(40),
        questions: "x".repeat(20),
        reasoning: "x".repeat(40),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      mock.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO mentor_forge"),
      ),
    ).toBe(false);
  });
  it.each(["cancelled", "no_show", "confirmed"])(
    "rejects feedback for %s session",
    async (status) => {
      mock.query.mockImplementation(async (sql: string) => ({
        rows: sql.includes("SELECT * FROM mentorship_sessions")
          ? [{ id, learner_id: owner, mentor_id: other, status }]
          : [],
      }));
      await expect(
        commandEvidence(owner, {
          action: "outcome",
          sessionId: id,
          outcome: "resolved",
          rating: 5,
          reflection: "x".repeat(20),
        }),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it("rejects feedback without attendance from both participants", async () => {
    mock.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("SELECT * FROM mentorship_sessions")
        ? [{ id, learner_id: owner, mentor_id: other, status: "completed" }]
        : [],
    }));
    await expect(
      commandEvidence(owner, {
        action: "outcome",
        sessionId: id,
        outcome: "resolved",
        rating: 5,
        reflection: "x".repeat(20),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("blocks self-review", async () => {
    mock.query.mockResolvedValue({
      rows: [{ id, owner_id: owner, status: "submitted" }],
    });
    await expect(
      decideEvidence(owner, {
        action: "forge",
        id,
        decision: "accepted",
        reason: "x".repeat(20),
        scores: {
          technicalAccuracy: 4,
          teachingClarity: 4,
          safeOperation: 4,
          learnerIndependence: 4,
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("blocks unrelated outcome reads by querying authenticated ownership", async () => {
    const { evidenceState } = await import("./evidence");
    await evidenceState(owner);
    expect(
      mock.query.mock.calls.every(
        ([sql, args]) =>
          (sql.includes("owner_id=$1") ||
            sql.includes("applicant_id=$1") ||
            sql.includes("learner_id=$1")) &&
          args[0] === owner,
      ),
    ).toBe(true);
  });
  it("rejects missing, expired and revoked public shares through the same fail-closed query", async () => {
    await expect(publicPassport("a".repeat(43))).rejects.toMatchObject({
      status: 404,
    });
    expect(mock.query.mock.calls[0][0]).toContain(
      "revoked_at IS NULL AND expires_at>NOW()",
    );
    expect(mock.query.mock.calls[0][1][0]).not.toBe("a".repeat(43));
  });
  it("rejects invalid tokens without a database lookup", async () => {
    await expect(publicPassport("bad")).rejects.toMatchObject({ status: 404 });
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("does not revoke another account share", async () => {
    await expect(
      commandEvidence(owner, { action: "revoke_share", id }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("does not promote without reviewed evidence", async () => {
    mock.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("COUNT(DISTINCT")
        ? [{ sessions: 50, learners: 20 }]
        : [],
    }));
    await expect(
      assertPromotionEvidence({ query: mock.query }, owner, "verified_mentor"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("blocks repeat acceptance farming", async () => {
    mock.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("SELECT id FROM mentor_applications")
        ? [{ id }]
        : sql.includes("SELECT status,created_at")
          ? [{ status: "accepted", created_at: "2020-01-01" }]
          : [],
    }));
    await expect(
      commandEvidence(owner, {
        action: "forge",
        applicationId: id,
        explanation: "x".repeat(40),
        questions: "x".repeat(20),
        reasoning: "x".repeat(40),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
