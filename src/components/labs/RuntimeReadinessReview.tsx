'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  CloudCog,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getLabsSnapshot } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';

type ActiveLab = {
  id: string;
  name: string;
  status: string;
  metadata?: Record<string, unknown>;
};

type RuntimeReadinessFacts = {
  version: 1;
  provenance: 'server-executed';
  attestationScope: 'runtime-management-readiness';
  authorizationId: string;
  deploymentExecutionId: string;
  evidenceId: string;
  evidenceExecutionId: string;
  planId: string;
  planHash: string;
  labInstanceId: string;
  target: {
    nodeId: string;
    labSlug: string;
    accessMode: 'terminal' | 'desktop';
  };
  ec2: {
    provenance: 'provider-attested';
    provider: 'aws-ec2';
    region: string;
    externalId: string;
    state: string;
  };
  ssm: {
    provenance: 'provider-attested';
    provider: 'aws-ssm';
    registered: boolean;
    pingStatus: string | null;
    agentVersion: string | null;
    platformType: string | null;
    platformName: string | null;
    platformVersion: string | null;
  };
  oxsig: {
    provenance: 'server-executed';
    instanceProfileConfigured: boolean;
  };
  readiness: {
    computeReady: boolean;
    managementReady: boolean;
    terminalPathReady: boolean;
    requestedAccessReady: boolean;
    desktopServiceAttested: false;
    state: 'ready' | 'management-ready' | 'not-ready';
  };
  checkedAt: string;
  evidenceRecordedAt: string;
  workload: {
    label: string;
    kind: 'client' | 'server';
    hostname?: string;
    role?: string;
    runtimeProfileLabel?: string;
  };
  limitations: string[];
};

type RuntimeReadinessAnalysis = {
  summary: string;
  observations: string[];
  interpretation: string;
  learningPoints: string[];
  nextStep: string;
  limitations: string[];
};

type CaptureResponse = {
  evidence: {
    id: string;
    executionId: string;
    provenance: 'server-executed';
    state: 'evidence_recorded';
    recordedAt: string;
  };
  facts: RuntimeReadinessFacts;
};

type AnalysisResponse = {
  analysis: RuntimeReadinessAnalysis;
  facts: RuntimeReadinessFacts;
  model: string;
  evidence: {
    id: string;
    executionId: string;
    provenance: 'server-executed';
    state: 'analyzed';
  };
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function RuntimeReadinessReview() {
  const [lab, setLab] = React.useState<ActiveLab | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [facts, setFacts] = React.useState<RuntimeReadinessFacts | null>(null);
  const [analysis, setAnalysis] = React.useState<RuntimeReadinessAnalysis | null>(null);
  const [model, setModel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadLab = React.useCallback(async () => {
    setLoadingLab(true);
    try {
      const snapshot = await getLabsSnapshot({ force: true });
      if (!snapshot.ok) throw new Error(snapshot.data.error || 'Could not load the Cyber Lab');
      const active = (snapshot.data.instances?.[0] || null) as ActiveLab | null;
      setLab(active);
      if (!active) {
        setFacts(null);
        setAnalysis(null);
        setModel(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the Cyber Lab');
    } finally {
      setLoadingLab(false);
    }
  }, []);

  React.useEffect(() => { void loadLab(); }, [loadLab]);

  const checkReadiness = React.useCallback(async () => {
    if (!lab) return;
    setChecking(true);
    setError(null);
    setAnalysis(null);
    setModel(null);
    try {
      const csrf = await getCsrfToken();
      const captureResponse = await fetch(`/api/labs/instances/${lab.id}/readiness-evidence`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        cache: 'no-store',
      });
      if (!captureResponse.ok) {
        throw new Error(await responseError(captureResponse, 'Could not capture runtime readiness evidence'));
      }
      const captured = await captureResponse.json() as CaptureResponse;
      setFacts(captured.facts);

      const analysisResponse = await fetch(`/api/labs/instances/${lab.id}/readiness-evidence/analysis`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ evidenceId: captured.evidence.id }),
        cache: 'no-store',
      });
      if (!analysisResponse.ok) {
        throw new Error(await responseError(
          analysisResponse,
          'Readiness evidence was captured, but OXSIG could not interpret it'
        ));
      }
      const interpreted = await analysisResponse.json() as AnalysisResponse;
      setFacts(interpreted.facts);
      setAnalysis(interpreted.analysis);
      setModel(interpreted.model);
      toast.success('Runtime readiness evidence captured and interpreted');
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : 'Could not check runtime readiness';
      setError(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  }, [lab]);

  const accessMode = facts?.target.accessMode || (lab?.metadata?.accessMode === 'desktop' ? 'desktop' : 'terminal');

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Runtime Readiness</h1>
            <Badge variant="secondary">Evidence v1</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            OXSIG performs a fresh server-side readiness observation against the exact controlled deployment. EC2 and Systems Manager facts remain provider-attested; the aggregate readiness record is server-executed and never treats SSM Online as proof of arbitrary service, desktop, or network health.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadLab()} disabled={loadingLab || checking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingLab ? 'animate-spin' : ''}`} />Refresh lab
          </Button>
          <Button onClick={() => void checkReadiness()} disabled={!lab || checking || loadingLab}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
            {checking ? 'Checking…' : 'Check readiness'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!loadingLab && !lab && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <Server className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-semibold">No active controlled lab</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Deploy an authorized Infrastructure Designer workload first. Runtime readiness evidence is bound to that exact deployment and cannot be created for an arbitrary browser-supplied machine ID.
          </p>
        </div>
      )}

      {lab && !facts && !checking && (
        <div className="rounded-2xl border border-dashed bg-card p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-semibold">Ready to observe: {lab.name}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The check will ask AWS for the current EC2 state and Systems Manager registration/ping status, then store those facts in the Evidence Ledger before any AI explanation occurs.
              </p>
            </div>
          </div>
        </div>
      )}

      {facts && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatusCard label="Overall" ready={facts.readiness.state === 'ready'} partial={facts.readiness.state === 'management-ready'} value={facts.readiness.state} />
            <StatusCard label="EC2 compute" ready={facts.readiness.computeReady} value={facts.ec2.state} />
            <StatusCard label="SSM management" ready={facts.readiness.managementReady} value={facts.ssm.pingStatus || 'not registered'} />
            <StatusCard label="Terminal path" ready={facts.readiness.terminalPathReady} value={facts.readiness.terminalPathReady ? 'ready' : 'not ready'} />
            <StatusCard
              label={`${accessMode} access`}
              ready={facts.readiness.requestedAccessReady}
              partial={accessMode === 'desktop' && facts.readiness.managementReady}
              value={facts.readiness.requestedAccessReady ? 'attested' : accessMode === 'desktop' && facts.readiness.managementReady ? 'management only' : 'not ready'}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="space-y-4">
              {analysis ? (
                <>
                  <div className="rounded-2xl border bg-card p-5">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5" />
                      <h2 className="font-semibold">OXSIG interpretation</h2>
                    </div>
                    <p className="mt-3 text-sm leading-6">{analysis.summary}</p>
                  </div>
                  <AnalysisList title="Direct observations" items={analysis.observations} />
                  <div className="rounded-2xl border bg-card p-5">
                    <h2 className="font-semibold">What it means</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{analysis.interpretation}</p>
                  </div>
                  <AnalysisList title="Learning points" items={analysis.learningPoints} />
                  <div className="rounded-2xl border bg-card p-5">
                    <h2 className="font-semibold">Next evidence step</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{analysis.nextStep}</p>
                  </div>
                  <AnalysisList title="Known limitations" items={analysis.limitations} warning />
                </>
              ) : (
                <div className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <CircleDashed className="h-5 w-5" />
                    <h2 className="font-semibold">Evidence captured</h2>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    The server-side readiness facts are stored. AI interpretation is unavailable for this check, but the deterministic readiness result remains valid and inspectable.
                  </p>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <CloudCog className="h-4 w-4" />
                  <p className="font-semibold">Provider/runtime facts</p>
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="EC2 resource" value={facts.ec2.externalId} mono />
                  <KeyValue label="Region" value={facts.ec2.region} mono />
                  <KeyValue label="SSM registered" value={facts.ssm.registered ? 'yes' : 'no'} />
                  <KeyValue label="SSM ping" value={facts.ssm.pingStatus || '—'} />
                  <KeyValue label="SSM agent" value={facts.ssm.agentVersion || '—'} mono />
                  <KeyValue label="Platform" value={[facts.ssm.platformName, facts.ssm.platformVersion].filter(Boolean).join(' ') || facts.ssm.platformType || '—'} />
                  <KeyValue label="Instance profile configured" value={facts.oxsig.instanceProfileConfigured ? 'yes' : 'no'} />
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  <p className="font-semibold">Evidence binding</p>
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="Workload" value={facts.workload.label} />
                  <KeyValue label="Access intent" value={facts.target.accessMode} />
                  <KeyValue label="Plan" value={facts.planId} mono />
                  <KeyValue label="Authorization" value={facts.authorizationId} mono />
                  <KeyValue label="Deployment execution" value={facts.deploymentExecutionId} mono />
                  <KeyValue label="Readiness evidence" value={facts.evidenceId} mono />
                  <KeyValue label="Checked" value={new Date(facts.checkedAt).toLocaleString()} />
                  {model && <KeyValue label="Model" value={model} mono />}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold">Readiness boundary</p>
                <div className="mt-2 space-y-2">
                  {facts.limitations.map((limitation) => (
                    <p key={limitation} className="text-[11px] leading-5 text-muted-foreground">{limitation}</p>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function StatusCard({ label, value, ready, partial = false }: { label: string; value: string; ready: boolean; partial?: boolean }) {
  const Icon = ready ? CheckCircle2 : partial ? CircleDashed : AlertTriangle;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}

function AnalysisList({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${warning ? 'border-amber-500/30 bg-amber-500/5' : 'bg-card'}`}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
            {warning ? <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0" />}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyValue({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 break-all ${mono ? 'font-mono text-[10px]' : 'text-xs'}`}>{value}</p>
    </div>
  );
}
