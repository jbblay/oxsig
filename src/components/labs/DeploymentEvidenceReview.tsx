'use client';

import * as React from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CloudCog,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';

type DeploymentEvidenceAnalysis = {
  summary: string;
  observations: string[];
  interpretation: string;
  learningPoints: string[];
  nextStep: string;
  limitations: string[];
};

type DeploymentEvidenceFacts = {
  provenance: 'provider-attested';
  attestationScope: 'provider-allocation';
  provider: 'aws-ec2';
  externalId: string;
  labEventId: string;
  authorizationId: string;
  executionId: string;
  labInstanceId: string;
  planId: string;
  planHash: string;
  nodeId: string;
  labSlug: string;
  accessMode: 'terminal' | 'desktop';
  workload: {
    label: string;
    kind: 'client' | 'server';
    hostname?: string;
    role?: string;
    runtimeProfileLabel?: string;
    architecture?: string;
    resourceClass?: string;
    intendedAccessMode?: string;
  };
  executionStartedAt?: string;
  evidenceRecordedAt: string;
  limitations: string[];
};

type EvidenceResponse = {
  analysis: DeploymentEvidenceAnalysis;
  facts: DeploymentEvidenceFacts;
  model: string;
  evidence: {
    id: string;
    executionId: string;
    provenance: 'provider-attested';
    state: 'analyzed';
  };
  authorization: {
    id: string;
    planId: string;
    state: 'analyzed';
  };
};

export default function DeploymentEvidenceReview() {
  const [result, setResult] = React.useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const interpretLatest = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/labs/infrastructure-plan/evidence-analysis', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not interpret deployment evidence');
      setResult(body as EvidenceResponse);
      toast.success('Provider-attested deployment evidence interpreted');
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Could not interpret deployment evidence';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl">Deployment Evidence</h1>
            <Badge variant="secondary">Interpretation v1</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            OXSIG loads the latest provider-attested deployment evidence from the server, verifies it against the exact authorized plan, and teaches from those verified facts. Provider allocation evidence is not treated as proof that the guest OS, terminal, desktop, services, or network are ready.
          </p>
        </div>
        <Button onClick={() => void interpretLatest()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : result ? <RefreshCw className="mr-2 h-4 w-4" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
          {result ? 'Reload evidence' : 'Interpret latest evidence'}
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-semibold">Evidence before explanation</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Complete a controlled Infrastructure Designer deployment first. Once the trusted runtime adapter records provider allocation evidence, OXSIG can compare that evidence with the exact authorized plan and explain what it proves—and what still needs verification.
          </p>
        </div>
      )}

      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FactCard label="Provenance" value={result.facts.provenance} />
            <FactCard label="Provider" value={result.facts.provider} />
            <FactCard label="Attestation scope" value={result.facts.attestationScope} />
            <FactCard label="Evidence state" value={result.evidence.state} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-4">
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5" />
                  <h2 className="font-semibold">OXSIG interpretation</h2>
                </div>
                <p className="mt-3 text-sm leading-6">{result.analysis.summary}</p>
              </div>

              <AnalysisList title="Direct observations" items={result.analysis.observations} />

              <div className="rounded-2xl border bg-card p-5">
                <h2 className="font-semibold">What it means</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{result.analysis.interpretation}</p>
              </div>

              <AnalysisList title="Learning points" items={result.analysis.learningPoints} />

              <div className="rounded-2xl border bg-card p-5">
                <h2 className="font-semibold">Next evidence step</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{result.analysis.nextStep}</p>
              </div>

              <AnalysisList title="Known limitations" items={result.analysis.limitations} warning />
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <CloudCog className="h-4 w-4" />
                  <p className="font-semibold">Verified provider facts</p>
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="Provider resource" value={result.facts.externalId} mono />
                  <KeyValue label="Lab allocation" value={result.facts.labInstanceId} mono />
                  <KeyValue label="Workload" value={result.facts.workload.label} />
                  <KeyValue label="Mapped lab" value={result.facts.labSlug} mono />
                  <KeyValue label="Access intent" value={result.facts.accessMode} />
                  {result.facts.workload.runtimeProfileLabel && <KeyValue label="Runtime profile" value={result.facts.workload.runtimeProfileLabel} />}
                  {result.facts.workload.architecture && <KeyValue label="Architecture" value={result.facts.workload.architecture} mono />}
                  {result.facts.workload.resourceClass && <KeyValue label="Resource class" value={result.facts.workload.resourceClass} mono />}
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="font-semibold">Evidence identity</p>
                </div>
                <div className="mt-3 space-y-3 text-xs">
                  <KeyValue label="Plan" value={result.authorization.planId} mono />
                  <KeyValue label="Authorization" value={result.authorization.id} mono />
                  <KeyValue label="Execution" value={result.evidence.executionId} mono />
                  <KeyValue label="Evidence" value={result.evidence.id} mono />
                  <KeyValue label="Lab event" value={result.facts.labEventId} mono />
                  <KeyValue label="Recorded" value={new Date(result.facts.evidenceRecordedAt).toLocaleString()} />
                  <KeyValue label="Model" value={result.model} mono />
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold">Attestation boundary</p>
                <div className="mt-2 space-y-2">
                  {result.facts.limitations.map((limitation) => (
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

function FactCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
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