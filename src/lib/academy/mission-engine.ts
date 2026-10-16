import "server-only";
import type { z } from "zod";
import { getPool, transaction } from "@/lib/db/pool";
import {
  MissionControlError,
  observeDockerMission,
  seedDockerIncident,
} from "./mission-control";
import {
  ENGINEERING_MISSIONS,
  engineeringTemplate,
  templateUnlocked,
  engineCommandSchema,
} from "./mission-engine-policy";
const fail = (message: string, status = 409): never => {
  throw new MissionControlError(message, "MISSION_ENGINE", status);
};
export async function engineeringWorld(owner: string) {
  const db = getPool();
  const [runs, progress, labs] = await Promise.all([
    db.query(
      `SELECT id,template_id,template_version,mode,status,stage,revision,parent_run_id,fork_revision,deadline,created_at,verified_at FROM academy_mission_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [owner],
    ),
    db.query(
      `SELECT mission_id FROM academy_mission_progress WHERE owner_id=$1 AND verified_at IS NOT NULL`,
      [owner],
    ),
    db.query(
      `SELECT i.id,d.name,i.status FROM lab_instances i JOIN lab_definitions d ON d.id=i.definition_id WHERE i.owner_id=$1 AND i.status='running' AND (i.expires_at IS NULL OR i.expires_at>NOW()) ORDER BY i.created_at DESC LIMIT 50`,
      [owner],
    ),
  ]);
  return {
    templates: ENGINEERING_MISSIONS.map((t) => ({
      ...t,
      unlocked: templateUnlocked(
        t,
        progress.rows.map((r) => r.mission_id),
      ),
    })),
    runs: runs.rows,
    labs: labs.rows,
  };
}
export async function flightRecorder(owner: string, id: string) {
  const db = getPool();
  const r = await db.query(
    `SELECT id,template_id,template_version,mode,status,stage,revision,parent_run_id,fork_revision,deadline,created_at,verified_at FROM academy_mission_runs WHERE id=$1 AND owner_id=$2`,
    [id, owner],
  );
  if (!r.rows.length) return fail("Run not found.", 404);
  const events = await db.query(
    `SELECT sequence,event_type,summary,created_at FROM academy_flight_events WHERE run_id=$1 AND owner_id=$2 ORDER BY sequence`,
    [id, owner],
  );
  return { run: r.rows[0], events: events.rows };
}
export async function commandMission(
  owner: string,
  command: z.infer<typeof engineCommandSchema>,
) {
  return transaction(async (db) => {
    // One run mutation per owner at a time; revisions reject retries/stale tabs.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `engineering:${owner}`,
    ]);
    const record = async (
      id: string,
      sequence: number,
      type: string,
      summary: object,
    ) =>
      db.query(
        `INSERT INTO academy_flight_events(run_id,owner_id,sequence,event_type,summary) VALUES($1,$2,$3,$4,$5::jsonb)`,
        [id, owner, sequence, type, JSON.stringify(summary)],
      );
    if (command.action === "start") {
      const template = engineeringTemplate(command.templateId)!;
      const progress = await db.query(
        `SELECT mission_id FROM academy_mission_progress WHERE owner_id=$1 AND verified_at IS NOT NULL`,
        [owner],
      );
      if (
        !templateUnlocked(
          template,
          progress.rows.map((r) => r.mission_id),
        )
      )
        return fail("Complete the prerequisite verified missions first.");
      const lab = await db.query(
        `SELECT id FROM lab_instances WHERE id=$1 AND owner_id=$2 AND status='running' AND (expires_at IS NULL OR expires_at>NOW())`,
        [command.labInstanceId, owner],
      );
      if (!lab.rows.length)
        return fail("Running learner-owned lab not found.", 404);
      const active = await db.query(
        `SELECT COUNT(*)::int AS n FROM academy_mission_runs WHERE owner_id=$1 AND status='active' AND (deadline IS NULL OR deadline>NOW())`,
        [owner],
      );
      if (active.rows[0].n >= 5)
        return fail("Finish or abandon an active run before starting another.");
      const r = await db.query(
        `INSERT INTO academy_mission_runs(owner_id,template_id,template_version,mode,lab_instance_id,deadline) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='troublefest' THEN NOW()+make_interval(mins=>$6) ELSE NULL END) RETURNING id`,
        [
          owner,
          template.id,
          template.version,
          command.mode,
          command.labInstanceId,
          template.minutes,
        ],
      );
      await record(r.rows[0].id, 0, "started", {
        templateId: template.id,
        version: template.version,
        mode: command.mode,
      });
      return { id: r.rows[0].id };
    }
    const found = await db.query(
      `SELECT * FROM academy_mission_runs WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
      [command.runId, owner],
    );
    const run = found.rows[0];
    if (!run) return fail("Run not found.", 404);
    if (run.revision !== command.revision)
      return fail("This run changed. Reload before trying again.");
    const template = engineeringTemplate(run.template_id, run.template_version);
    if (!template)
      return fail("This template version is no longer executable.");
    if (command.action === "fork") {
      // Forks branch the learning approach, never clone a VM or inherit technical proof.
      const count = await db.query(
        `SELECT COUNT(*)::int AS n FROM academy_mission_runs WHERE owner_id=$1 AND status='active' AND (deadline IS NULL OR deadline>NOW())`,
        [owner],
      );
      if (count.rows[0].n >= 5)
        return fail("At most five active runs are allowed.");
      const r = await db.query(
        `INSERT INTO academy_mission_runs(owner_id,template_id,template_version,mode,lab_instance_id,parent_run_id,fork_revision) VALUES($1,$2,$3,'practice',$4,$5,$6) RETURNING id`,
        [
          owner,
          run.template_id,
          run.template_version,
          run.lab_instance_id,
          run.id,
          run.revision,
        ],
      );
      await record(r.rows[0].id, 0, "forked", {
        parentRunId: run.id,
        parentRevision: run.revision,
        proofInherited: false,
      });
      return { id: r.rows[0].id };
    }
    if (run.status !== "active") return fail("This run is closed.");
    const revision = run.revision + 1;
    if (run.deadline && new Date(run.deadline).getTime() <= Date.now()) {
      await db.query(
        `UPDATE academy_mission_runs SET status='expired',revision=$2,updated_at=NOW() WHERE id=$1`,
        [run.id, revision],
      );
      await record(run.id, revision, "expired", {});
      return { id: run.id, expired: true };
    }
    if (command.action === "abandon") {
      await db.query(
        `UPDATE academy_mission_runs SET status='abandoned',revision=$2,updated_at=NOW() WHERE id=$1`,
        [run.id, revision],
      );
      await record(run.id, revision, "abandoned", {});
      return { id: run.id };
    }
    if (command.action === "hypothesis") {
      if (run.stage !== 0)
        return fail(
          "The diagnostic stage is complete. Fork a future to try another approach.",
        );
      const choice = template.hypotheses.find((h) => h.id === command.choice);
      if (!choice) return fail("Unknown diagnostic choice.", 400);
      await db.query(
        `UPDATE academy_mission_runs SET stage=$2,revision=$3,updated_at=NOW() WHERE id=$1`,
        [run.id, choice.safe ? 1 : 0, revision],
      );
      await record(run.id, revision, "hypothesis", {
        choice: choice.id,
        safe: choice.safe,
        feedback: choice.feedback,
        technicalProof: false,
      });
      return { id: run.id, feedback: choice.feedback };
    }
    if (run.stage !== 1)
      return fail("Complete a safe diagnostic hypothesis first.");
    if (command.action === "prepare") {
      if (!template.requiresIncident)
        return fail("This mission has no injected incident.");
      if (run.prepared_at)
        return fail("This incident has already been seeded for this run.");
      await seedDockerIncident(owner, run.lab_instance_id);
      await db.query(
        `UPDATE academy_mission_runs SET prepared_at=NOW(),revision=$2,updated_at=NOW() WHERE id=$1`,
        [run.id, revision],
      );
      await record(run.id, revision, "prepared", {
        scope: "reserved-academy-container",
        consent: true,
      });
      return { id: run.id };
    }
    if (template.requiresIncident && !run.prepared_at)
      return fail(
        "Explicitly seed the bounded incident before verifying a repair.",
      );
    const observation = await observeDockerMission(
      owner,
      template.missionId,
      run.lab_instance_id,
    );
    // Deadline is rechecked after provider latency. A late verification cannot win Troublefest.
    const expired =
      run.deadline && new Date(run.deadline).getTime() <= Date.now();
    const passed = observation.passed && !expired;
    await db.query(
      `UPDATE academy_mission_runs SET status=$2,stage=$3,revision=$4,verified_at=CASE WHEN $5 THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1`,
      [
        run.id,
        expired ? "expired" : passed ? "verified" : "active",
        passed ? 2 : 1,
        revision,
        passed,
      ],
    );
    await record(run.id, revision, "verification", {
      passed,
      expired: Boolean(expired),
      checks: observation.checks,
      provenance: "server-executed",
      templateVersion: template.version,
    });
    if (passed)
      await db.query(
        `INSERT INTO academy_mission_progress(owner_id,mission_id,lab_instance_id,difficulty,checks,verified_at) VALUES($1,$2,$3,'advanced',$4::jsonb,NOW()) ON CONFLICT(owner_id,mission_id) DO UPDATE SET lab_instance_id=EXCLUDED.lab_instance_id,checks=EXCLUDED.checks,verified_at=COALESCE(academy_mission_progress.verified_at,NOW()),updated_at=NOW()`,
        [
          owner,
          template.missionId,
          run.lab_instance_id,
          JSON.stringify(observation.checks),
        ],
      );
    return { id: run.id, passed, checks: observation.checks };
  });
}
