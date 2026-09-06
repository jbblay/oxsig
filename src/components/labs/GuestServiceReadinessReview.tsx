'use client';

import * as React from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Loader2,
  MonitorCheck,
  RefreshCw,
  Server,
  ShieldCheck,
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

type GuestServiceFacts = {
  version: 1;
  provenance: 'server-executed';
  attestationScope: 'guest-desktop-service-readiness';
  authorizationId: string;
  deploymentExecutionId: string;
  evidenceId: string;
  evidenceExecutionId: string;
  prerequisiteRuntimeEvidenceId: string;
  planId: string;
  planHash: string;
  labInstanceId: string;
  target: {
    nodeId: string;
    labSlug: string;
    accessMode: 'desktop';
  };
  guest: {
    provenance: 'server-executed';
    observationPath: 'aws-ssm-run-command';
    platform: 'linux' | 'windows';
    serviceName: string;
    expectedPort: number;
    serviceInstalled: boolean;
    serviceState: string;
    serviceRunning: boolean;
    readyMarkerPresent: boolean;
    listenerPresent: boolean;
    listenerAddress: string | null;
    loopbackOnly: boolean;
    commandExitCode: number;
  };
  readiness: {
    managementReady: true;
    guestServiceReady: boolean;
    requestedAccessReady: boolean;
    state: 'ready' | 'not-ready';
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

type GuestServiceAnalysis = {
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
  facts: GuestServiceFacts;
};

type AnalysisResponse = {
  analysis: GuestServiceAnalysis;
  facts: GuestServiceFacts;
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

export default function GuestServiceReadinessReview() {
  const [lab, setLab] = React.useState<ActiveLab | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [facts, setFacts] = React.useState<GuestServiceFacts | null>(null);
  const [analysis, setAnalysis] = React.useState<GuestServiceAnalysis | null>(null);
  const [model, setModel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadLab = React.useCallback(async () => {
    setLoadingLab(true);
    setError(null);
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

  const checkGuestService = React.useCallback(async () => {
    if (!lab) return;
    setChecking(true);
    setError(null);
    setAnalysis(null);
    setModel(null);
    try {
      const csrf = await getCsrfToken();
      const captureResponse = await fetch(`/api/labs/instances/${lab.id}/guest-service-evidence`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        cache: 'no-store',
      });
      if (!captureResponse.ok) {
        throw new Error(await responseError(captureResponse, 'Could not capture guest-service evidence'));
      }
      const captured = await captureResponse.json() as CaptureResponse;
      setFacts(captured.facts);

      const analysisResponse = await fetch(`/api/labs/instances/${lab.id}/guest-service-evidence/analysis`, {
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
          'Guest-service evidence was captured, but OXSIG could not interpret it'
        ));
      }
      const interpreted = await analysisResponse.json() as AnalysisResponse;
      setFacts(interpreted.facts);
      setAnalysis(interpreted.analysis);
      setModel(interpreted.model);
      toast.success('Guest-service readiness evidence captured and interpreted');
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : 'Could not check guest-service readiness';
      setError(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  }, [lab]);

  const desktopLab = lab?.metadata?.accessMode === 'desktop';

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Guest Service Readiness</h1>
            <Badge variant="secondary">Evidence v1</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            OXSIG performs a fixed read-only inspection inside the desktop guest through Systems Manager. It proves the configured desktop service state and expected loopback listener without starting a browser tunnel or treating local service readiness as end-to-end desktop access.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadLab()} disabled={loadingLab || checking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingLab ? 'animate-spin' : ''}`} />Refresh lab
          </Button>
          <Button onClick={() => void checkGuestService()} disabled={!lab || !desktopLab || checking || loadingLab}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MonitorCheck className="mr-2 h-4 w-4" />}
            {checking ? 'Inspecting…' : 'Check guest service'}
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
            Deploy an authorized desktop workload first. Guest-service evidence is bound to that exact deployment and its prior runtime-management evidence.
          </p>
        </div>
      )}

      {lab && !desktopLab && (
        <div className="rounded-2xl border border-dashed bg-card p-8">
          <div className="flex items-start gap-3">
            <CircleDashed className="mt-0.5 h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-semibold">Guest desktop service not applicable</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The active lab is configured for terminal access. Runtime Readiness already covers its management and terminal path; this evidence type is intentionally limited to desktop workloads.
              </p>
            </div>
          </div>
        </div>
      )}

      {lab && desktopLab && !facts && !checking && (
        <div className="rounded-2xl border border-dashed bg-card p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-semibold">Ready to inspect: {lab.name}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                A prior management-ready evidence record is required. This check will not install or start the desktop service; it records the guest state exactly as observed.
              </p>
            </div>
          </div>
        </div>
      )}

      {facts && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatusCard label="Overall" ready={facts.readiness.guestServiceReady} value={facts.readiness.state} />
            <StatusCard label="Service installed" ready={facts.guest.serviceInstalled} value={facts.guest.serviceInstalled ? 'yes' : 'no'} />
            <StatusCard label="Service running" ready={facts.guest.serviceRunning} value={facts.guest.serviceState} />
            <StatusCard label="Expected listener" ready={facts.guest.listenerPresent} value={facts.guest.listenerPresent ? `port ${facts.guest.expectedPort}` : 'missing'} />
            <StatusCard label="Loopback only" ready={facts.guest.loopbackOnly} value={facts.guest.loopbackOnly ? 'protected' : 'not attested'} />
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
                  <p className="font-semibold">Evidence captured</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    The deterministic guest-service facts are stored even if AI interpretation is unavailable.
                  </p>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <p className="font-semibold">Guest observation</p>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="Platform" value={facts.guest.platform} />
                  <KeyValue label="Service" value={facts.guest.serviceName} mono />
                  <KeyValue label="Service state" value={facts.guest.serviceState} />
                  <KeyValue label="Ready marker" value={facts.guest.readyMarkerPresent ? 'present' : 'missing'} />
                  <KeyValue label="Expected port" value={String(facts.guest.expectedPort)} mono />
                  <KeyValue label="Listener address" value={facts.guest.listenerAddress || '—'} mono />
                  <KeyValue label="Observation path" value={facts.guest.observationPath} mono />
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <p className="font-semibold">Evidence chain</p>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="Workload" value={facts.workload.label} />
                  <KeyValue label="Plan" value={facts.planId} mono />
                  <KeyValue label="Authorization" value={facts.authorizationId} mono />
                  <KeyValue label="Deployment execution" value={facts.deploymentExecutionId} mono />
                  <KeyValue label="Runtime prerequisite" value={facts.prerequisiteRuntimeEvidenceId} mono />
                  <KeyValue label="Guest evidence" value={facts.evidenceId} mono />
                  <KeyValue label="Checked" value={new Date(facts.checkedAt).toLocaleString()} />
                  {model && <KeyValue label="Model" value={model} mono />}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold">Access boundary</p>
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

function StatusCard({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : AlertTriangle;
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
