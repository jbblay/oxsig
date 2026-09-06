'use client';

import * as React from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  Loader2,
  MonitorUp,
  RefreshCw,
  Route,
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

type AccessFacts = {
  version: 1;
  provenance: 'browser-observed';
  attestationScope: 'browser-desktop-access-path';
  evidenceId: string;
  evidenceExecutionId: string;
  prerequisiteGuestEvidenceId: string;
  planId: string;
  planHash: string;
  labInstanceId: string;
  session: {
    provenance: 'server-executed';
    provider: 'aws-ssm';
    sessionId: string;
    target: string;
    platform: 'linux' | 'windows';
    port: number;
    issuedAt: string;
  };
  browser: {
    provenance: 'browser-observed';
    observationPath: 'same-origin-ssm-websocket-rfb';
    ssmChannelReady: true;
    rfbHandshakeComplete: true;
    rfbProtocolVersion: string;
    desktopName: string;
    framebuffer: { width: number; height: number };
  };
  readiness: {
    guestServiceReady: true;
    ssmSessionIssued: true;
    rfbHandshakeObserved: true;
    browserDesktopPathReady: true;
    state: 'ready';
  };
  reportReceivedAt: string;
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

type AccessAnalysis = {
  summary: string;
  observations: string[];
  interpretation: string;
  learningPoints: string[];
  nextStep: string;
  limitations: string[];
};

type ReadResponse = {
  evidence: {
    id: string;
    executionId: string;
    provenance: 'browser-observed';
    state: 'evidence_recorded' | 'analyzed';
    recordedAt: string;
    analysis?: AccessAnalysis;
    model?: string;
  };
  facts: AccessFacts;
};

type AnalysisResponse = {
  analysis: AccessAnalysis;
  facts: AccessFacts;
  model: string;
};

async function responseBody(response: Response) {
  return response.json().catch(() => ({}));
}

export default function AccessPathReadinessReview() {
  const [lab, setLab] = React.useState<ActiveLab | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [loadingEvidence, setLoadingEvidence] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [facts, setFacts] = React.useState<AccessFacts | null>(null);
  const [analysis, setAnalysis] = React.useState<AccessAnalysis | null>(null);
  const [model, setModel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadEvidence = React.useCallback(async (active: ActiveLab | null) => {
    if (!active) return;
    setLoadingEvidence(true);
    setError(null);
    try {
      const response = await fetch(`/api/labs/instances/${active.id}/access-path-evidence`, {
        cache: 'no-store',
      });
      const body = await responseBody(response);
      if (response.status === 404) {
        setFacts(null);
        setAnalysis(null);
        setModel(null);
        return;
      }
      if (!response.ok) throw new Error(body.error || 'Could not load access-path evidence');
      const data = body as ReadResponse;
      setFacts(data.facts);
      setAnalysis(data.evidence.analysis || null);
      setModel(data.evidence.model || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load access-path evidence');
    } finally {
      setLoadingEvidence(false);
    }
  }, []);

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
      } else {
        await loadEvidence(active);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the Cyber Lab');
    } finally {
      setLoadingLab(false);
    }
  }, [loadEvidence]);

  React.useEffect(() => { void loadLab(); }, [loadLab]);

  const analyze = React.useCallback(async () => {
    if (!lab || !facts) return;
    setAnalyzing(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/labs/instances/${lab.id}/access-path-evidence/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({ evidenceId: facts.evidenceId }),
        cache: 'no-store',
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Could not interpret access-path evidence');
      const data = body as AnalysisResponse;
      setFacts(data.facts);
      setAnalysis(data.analysis);
      setModel(data.model);
      toast.success('Access-path evidence interpreted');
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Could not interpret access-path evidence';
      setError(message);
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  }, [facts, lab]);

  const desktopLab = lab?.metadata?.accessMode === 'desktop';

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Browser Access Path</h1>
            <Badge variant="secondary">Evidence v1</Badge>
            {facts && <Badge variant="outline">browser-observed</Badge>}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            This surface proves the final controlled desktop path only after a browser completes an RFB/VNC handshake through the same-origin OXSIG WebSocket bridge and an AWS Systems Manager port-forwarding session. The server-issued session claim and browser observation remain separate provenance layers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadLab()} disabled={loadingLab || loadingEvidence || analyzing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingLab || loadingEvidence ? 'animate-spin' : ''}`} />Refresh evidence
          </Button>
          <Button onClick={() => void analyze()} disabled={!facts || analyzing}>
            {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
            {analysis ? 'Review interpretation' : 'Interpret evidence'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      {!lab && !loadingLab && (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">No active Cyber Lab runtime is available.</div>
      )}

      {lab && !desktopLab && (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          The active lab is not a desktop workload. Browser access-path evidence applies only to controlled desktop deployments.
        </div>
      )}

      {lab && desktopLab && !facts && !loadingEvidence && (
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2 font-semibold"><MonitorUp className="h-4 w-4" />No end-to-end access evidence yet</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Capture Runtime Readiness and a ready Guest Service record first, then open the desktop in Runtime Lab. When the private SSM channel and RFB handshake complete, OXSIG records this evidence automatically.
          </p>
        </div>
      )}

      {facts && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Guest service</p>
              <p className="mt-1 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Ready</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">SSM session claim</p>
              <p className="mt-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Server-issued</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">RFB handshake</p>
              <p className="mt-1 flex items-center gap-2 font-semibold"><Route className="h-4 w-4" />Observed</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Browser desktop path</p>
              <p className="mt-1 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Ready</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-semibold">Bound transport observation</h2>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Workload</dt><dd>{facts.workload.label}</dd>
                <dt className="text-muted-foreground">Platform</dt><dd>{facts.session.platform}</dd>
                <dt className="text-muted-foreground">Private port</dt><dd>{facts.session.port}</dd>
                <dt className="text-muted-foreground">RFB version</dt><dd>{facts.browser.rfbProtocolVersion}</dd>
                <dt className="text-muted-foreground">Desktop name</dt><dd>{facts.browser.desktopName || 'Unnamed desktop'}</dd>
                <dt className="text-muted-foreground">Framebuffer</dt><dd>{facts.browser.framebuffer.width}×{facts.browser.framebuffer.height}</dd>
                <dt className="text-muted-foreground">Evidence</dt><dd className="break-all">{facts.evidenceId}</dd>
                <dt className="text-muted-foreground">Guest prerequisite</dt><dd className="break-all">{facts.prerequisiteGuestEvidenceId}</dd>
              </dl>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-semibold">What this does not claim</h2>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {facts.limitations.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>

          {analysis && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">OXSIG interpretation</h2>
                {model && <Badge variant="outline" className="text-[9px]">{model}</Badge>}
              </div>
              <p className="mt-3 text-sm">{analysis.summary}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct observations</p>
                  <ul className="mt-2 space-y-2 text-sm">{analysis.observations.map((item) => <li key={item}>• {item}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learning points</p>
                  <ul className="mt-2 space-y-2 text-sm">{analysis.learningPoints.map((item) => <li key={item}>• {item}</li>)}</ul>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{analysis.interpretation}</p>
              <div className="mt-4 rounded-xl border bg-muted/20 p-3 text-sm"><strong>Next evidence:</strong> {analysis.nextStep}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
