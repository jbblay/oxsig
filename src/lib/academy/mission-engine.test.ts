import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  observe: vi.fn(),
  seed: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({ query: mocks.query }),
  transaction: async (fn: any) => fn({ query: mocks.query }),
}));
vi.mock("./mission-control", () => ({
  MissionControlError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status = 409,
    ) {
      super(message);
    }
  },
  observeDockerMission: mocks.observe,
  seedDockerIncident: mocks.seed,
}));
import { commandMission, flightRecorder } from "./mission-engine";
import {
  ENGINEERING_MISSIONS,
  engineCommandSchema,
  templateUnlocked,
} from "./mission-engine-policy";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
  mocks.observe.mockReset();
  mocks.seed.mockReset();
});
function run(overrides: Record<string, unknown> = {}) {
  const row = {
    id,
    owner_id: owner,
    template_id: "docker-delivery",
    template_version: 1,
    status: "active",
    stage: 1,
    revision: 2,
    lab_instance_id: id,
    deadline: null,
    ...overrides,
  };
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT * FROM academy_mission_runs")
      ? [row]
      : sql.includes("COUNT(*)")
        ? [{ n: 1 }]
        : sql.includes("INSERT INTO academy_mission_runs")
          ? [{ id }]
          : [],
  }));
}
describe("versioned mission engine security", () => {
  it("does not accept client verification results or commands", () => {
    expect(
      engineCommandSchema.safeParse({
        action: "verify",
        runId: id,
        revision: 2,
        passed: true,
        command: "sudo anything",
      }).success,
    ).toBe(false);
  });
  it("requires all mission prerequisites", () => {
    expect(templateUnlocked(ENGINEERING_MISSIONS[2], ["deploy"])).toBe(false);
    expect(
      templateUnlocked(ENGINEERING_MISSIONS[2], ["deploy", "repair"]),
    ).toBe(true);
  });
  it("hides other users runs", async () => {
    await expect(flightRecorder(owner, id)).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.query.mock.calls[0][1]).toEqual([id, owner]);
  });
  it("rejects stale mutations before invoking a provider", async () => {
    run();
    await expect(
      commandMission(owner, { action: "verify", runId: id, revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("expires Troublefest without invoking a provider", async () => {
    run({ deadline: "2000-01-01" });
    expect(
      await commandMission(owner, { action: "verify", runId: id, revision: 2 }),
    ).toMatchObject({ expired: true });
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("requires bounded incident preparation for a repair", async () => {
    run({ template_id: "docker-incident" });
    await expect(
      commandMission(owner, { action: "verify", runId: id, revision: 2 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("does not mint proof from failed lab checks", async () => {
    run();
    mocks.observe.mockResolvedValue({ passed: false, checks: [] });
    expect(
      await commandMission(owner, { action: "verify", runId: id, revision: 2 }),
    ).toMatchObject({ passed: false });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO academy_mission_progress"),
      ),
    ).toBe(false);
  });
  it("records provider-observed success in the existing Academy source of truth", async () => {
    run();
    mocks.observe.mockResolvedValue({
      passed: true,
      checks: [{ key: "http", passed: true }],
    });
    expect(
      await commandMission(owner, { action: "verify", runId: id, revision: 2 }),
    ).toMatchObject({ passed: true });
    expect(mocks.observe).toHaveBeenCalledWith(owner, "deploy", id);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO academy_mission_progress"),
      ),
    ).toBe(true);
  });
  it("forks never inherit verified state or Troublefest mode", async () => {
    run({ status: "verified", mode: "troublefest" });
    await commandMission(owner, { action: "fork", runId: id, revision: 2 });
    const insert = mocks.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO academy_mission_runs"),
    );
    expect(insert?.[0]).toContain("'practice'");
    expect(insert?.[0]).not.toContain("verified_at");
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("rejects unsafe hypotheses without recording technical proof", async () => {
    run({ stage: 0 });
    await commandMission(owner, {
      action: "hypothesis",
      runId: id,
      revision: 2,
      choice: "disable-firewall",
    });
    const update = mocks.query.mock.calls.find(([sql]) =>
      sql.includes("SET stage="),
    );
    expect(update?.[1][1]).toBe(0);
    expect(mocks.observe).not.toHaveBeenCalled();
  });
});
