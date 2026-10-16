"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  mentorshipGet,
  mentorshipMutate,
} from "@/components/mentorship/mentorship-client";
import type { EngineeringTemplate } from "@/lib/academy/mission-engine-policy";
type Run = {
  id: string;
  template_id: string;
  template_version: number;
  mode: string;
  status: string;
  stage: number;
  revision: number;
  parent_run_id: string | null;
  deadline: string | null;
};
type World = {
  templates: Array<EngineeringTemplate & { unlocked: boolean }>;
  runs: Run[];
  labs: Array<{ id: string; name: string }>;
};
type Recorder = {
  run: Run;
  events: Array<{
    sequence: number;
    event_type: string;
    summary: Record<string, unknown>;
    created_at: string;
  }>;
};
export default function EngineeringWorld() {
  const [world, setWorld] = useState<World | null>(null);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [lab, setLab] = useState("");
  const [mode, setMode] = useState("practice");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = "/api/academy/engineering-world";
  const load = () =>
    mentorshipGet<World>(endpoint)
      .then(setWorld)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function inspect(id: string) {
    try {
      setRecorder(await mentorshipGet<Recorder>(`${endpoint}?run=${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recorder");
    }
  }
  async function act(command: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await mentorshipMutate<{ id: string }>(
        endpoint,
        "POST",
        command,
      );
      await Promise.all([load(), inspect(result.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const template = world?.templates.find(
    (t) => t.id === recorder?.run.template_id,
  );
  const run = recorder?.run;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Academy · Engineering World
        </p>
        <h1 className="text-3xl font-semibold">Build. Diagnose. Prove.</h1>
        <p>
          Choose a district, investigate a real lab, and keep the reasoning in
          your Flight Recorder.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500 p-3">
          {error}
        </p>
      )}
      <section className="flex flex-wrap gap-4 rounded-xl border p-4">
        <label>
          Lab
          <select
            className="ml-2 max-w-full rounded border bg-background p-2"
            value={lab}
            onChange={(e) => setLab(e.target.value)}
          >
            <option value="">Choose a running Linux lab</option>
            {world?.labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select
            className="ml-2 rounded border bg-background p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="practice">Practice · no deadline</option>
            <option value="troublefest">Troublefest · timed challenge</option>
          </select>
        </label>
        <Link className="underline" href="/labs">
          Open Cyber Lab
        </Link>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {world?.templates.map((t) => (
          <section
            key={t.id}
            className="space-y-3 rounded-xl border bg-card p-5"
          >
            <p className="text-sm text-muted-foreground">
              {t.district} · v{t.version}
            </p>
            <h2 className="text-xl font-semibold">{t.title}</h2>
            <p>{t.ticket}</p>
            <p className="text-sm">
              Troublefest: {t.minutes} minutes.{" "}
              {t.unlocked
                ? "Unlocked"
                : "Complete prerequisites: " + t.prerequisites.join(", ")}
            </p>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40"
              disabled={busy || !lab || !t.unlocked}
              onClick={() =>
                act({
                  action: "start",
                  templateId: t.id,
                  mode,
                  labInstanceId: lab,
                })
              }
            >
              Start mission
            </button>
          </section>
        ))}
      </div>
      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">Your runs</h2>
        {world?.runs.length === 0 && (
          <p>No runs yet. Start with service delivery.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {world?.runs.map((r) => (
            <button
              key={r.id}
              onClick={() => inspect(r.id)}
              className="rounded-lg border p-3 text-left"
            >
              <strong>
                {world.templates.find((t) => t.id === r.template_id)?.title}
              </strong>
              <br />
              <span className="text-sm">
                {r.mode} · {r.status}
                {r.parent_run_id ? " · Forked Future" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>
      {run && template && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-2xl font-semibold">
            Flight Recorder · {template.title}
          </h2>
          <p>
            {run.status} · revision {run.revision}
            {run.deadline
              ? " · Deadline " + new Date(run.deadline).toLocaleString()
              : ""}
          </p>
          {run.status === "active" && (
            <>
              <p>
                {run.stage === 0
                  ? "Choose a diagnostic approach. A hypothesis is not technical proof."
                  : "Use your lab terminal to complete the objective, then request server verification."}
              </p>
              {run.stage === 0 &&
                template.hypotheses.map((h) => (
                  <button
                    key={h.id}
                    className="mr-2 rounded-lg border p-3"
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: "hypothesis",
                        runId: run.id,
                        revision: run.revision,
                        choice: h.id,
                      })
                    }
                  >
                    {h.label}
                  </button>
                ))}
              {run.stage === 1 && (
                <div className="flex flex-wrap gap-3">
                  {template.requiresIncident && (
                    <button
                      disabled={busy}
                      className="rounded-lg border p-3"
                      onClick={() =>
                        act({
                          action: "prepare",
                          runId: run.id,
                          revision: run.revision,
                          consent: true,
                        })
                      }
                    >
                      I consent to reset only the reserved Academy container and
                      seed this incident
                    </button>
                  )}
                  <button
                    disabled={busy}
                    className="rounded-lg bg-primary p-3 text-primary-foreground"
                    onClick={() =>
                      act({
                        action: "verify",
                        runId: run.id,
                        revision: run.revision,
                      })
                    }
                  >
                    Verify real lab state
                  </button>
                </div>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  act({
                    action: "abandon",
                    runId: run.id,
                    revision: run.revision,
                  })
                }
              >
                Abandon run
              </button>
            </>
          )}
          <div className="rounded-lg bg-muted p-4">
            <h3 className="font-semibold">Forked Futures</h3>
            <p>
              Start a separate practice approach linked to this revision. The
              fork shares your existing lab; it does not clone the machine or
              inherit verified evidence. Troublefest deadlines cannot be reset
              into a new timed win.
            </p>
            <button
              disabled={busy}
              className="mt-2 rounded-lg border p-2"
              onClick={() =>
                act({ action: "fork", runId: run.id, revision: run.revision })
              }
            >
              Fork a practice future
            </button>
          </div>
          <ol className="space-y-3">
            {recorder.events.map((e) => (
              <li key={e.sequence} className="rounded-lg border p-3">
                <strong>
                  {e.sequence}. {e.event_type}
                </strong>
                <span className="ml-2 text-xs">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-sm">
                  {JSON.stringify(e.summary, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
