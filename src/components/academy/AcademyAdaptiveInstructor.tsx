'use client';

import * as React from 'react';
import { Bot, BrainCircuit, Eye, GraduationCap, Lightbulb, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';
import type {
  AcademyAdaptiveInstructorStatus,
  AcademyInstructorIntervention,
  AcademyInstructorMode,
} from '@/lib/academy/types';

const MODES: Array<{
  mode: AcademyInstructorMode;
  label: string;
  description: string;
}> = [
  { mode: 'explain', label: 'Explain', description: 'Reinforce the mechanism directly.' },
  { mode: 'guide', label: 'Guide', description: 'Use progressive hints without giving away the conclusion.' },
  { mode: 'demonstrate', label: 'Demonstrate', description: 'Show a worked hypothetical example; never execute for you.' },
  { mode: 'observe', label: 'Observe', description: 'Reduce assistance and let you lead.' },
];

function modeIcon(mode: AcademyInstructorMode) {
  if (mode === 'explain') return BrainCircuit;
  if (mode === 'guide') return Lightbulb;
  if (mode === 'demonstrate') return GraduationCap;
  return Eye;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function AcademyAdaptiveInstructor({
  courseTitle,
  lessonTitle,
  refreshKey,
}: {
  courseTitle: string;
  lessonTitle: string;
  refreshKey: string;
}) {
  const [status, setStatus] = React.useState<AcademyAdaptiveInstructorStatus | null>(null);
  const [selectedMode, setSelectedMode] = React.useState<AcademyInstructorMode>('guide');
  const [manualMode, setManualMode] = React.useState(false);
  const [intervention, setIntervention] = React.useState<AcademyInstructorIntervention | null>(null);
  const [busy, setBusy] = React.useState<'status' | 'coach' | null>(null);

  const loadStatus = React.useCallback(async () => {
    setBusy((current) => current || 'status');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy/adaptive-instructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'status', courseTitle, lessonTitle }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Oxsig could not load adaptive instructor status'));
      const body = await response.json() as { status: AcademyAdaptiveInstructorStatus };
      setStatus(body.status);
      if (!manualMode) setSelectedMode(body.status.recommendedMode);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Adaptive instructor status failed');
    } finally {
      setBusy((current) => current === 'status' ? null : current);
    }
  }, [courseTitle, lessonTitle, manualMode]);

  React.useEffect(() => {
    setIntervention(null);
    setManualMode(false);
    void loadStatus();
  // refreshKey intentionally causes policy refresh after practice/reflection state changes.
  }, [courseTitle, lessonTitle, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestCoaching() {
    setBusy('coach');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy/adaptive-instructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'coach',
          courseTitle,
          lessonTitle,
          requestedMode: selectedMode,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Oxsig could not generate this instructor intervention'));
      const body = await response.json() as { intervention: AcademyInstructorIntervention };
      setIntervention(body.intervention);
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Adaptive instructor failed');
    } finally {
      setBusy(null);
    }
  }

  function applyAdaptiveRecommendation() {
    if (!status) return;
    setManualMode(false);
    setSelectedMode(status.recommendedMode);
  }

  const selected = MODES.find((item) => item.mode === selectedMode)!;
  const buttonLabel = selectedMode === 'guide'
    ? status
      ? `Get hint ${status.nextHintLevel}`
      : 'Get guided hint'
    : selectedMode === 'explain'
      ? 'Explain the mechanism'
      : selectedMode === 'demonstrate'
        ? 'Show worked example'
        : 'Give me a challenge';

  return (
    <section className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-primary" /> Adaptive instructor
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            OXSIG recommends a teaching mode from durable learning evidence. You can override the mode without changing the evidence or mastery record.
          </p>
        </div>
        {status && (
          <Badge variant="outline" className="text-[10px]">
            recommended · {status.recommendedMode}
          </Badge>
        )}
      </div>

      {status && (
        <div className="grid gap-2 rounded-lg bg-background/70 p-3 text-[11px] sm:grid-cols-3">
          <div><span className="font-medium">Understanding</span><br />{status.understandingScore}% · {status.understandingStatus}</div>
          <div><span className="font-medium">Independence</span><br />{status.independence.score}% · {status.independence.status}</div>
          <div><span className="font-medium">Guide progress</span><br />{Math.min(status.guideHintCount, 3)}/3 hints used</div>
        </div>
      )}

      {status && (
        <div className="rounded-lg border bg-background/60 p-3 text-[11px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Why {status.recommendedMode}:</span> {status.reason}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map((item) => {
          const Icon = modeIcon(item.mode);
          const selectedModeButton = item.mode === selectedMode;
          return (
            <Button
              key={item.mode}
              type="button"
              variant={selectedModeButton ? 'default' : 'outline'}
              className="h-auto min-h-16 flex-col gap-1 px-2 py-2 text-[11px]"
              disabled={busy !== null}
              onClick={() => {
                setManualMode(true);
                setSelectedMode(item.mode);
              }}
              title={item.description}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="flex-1" onClick={() => void requestCoaching()} disabled={busy !== null}>
          {busy === 'coach' ? <Loader2 className="h-4 w-4 animate-spin" /> : React.createElement(modeIcon(selectedMode), { className: 'h-4 w-4' })}
          {busy === 'coach' ? 'Adapting…' : buttonLabel}
        </Button>
        {manualMode && status && (
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={applyAdaptiveRecommendation}>
            <RotateCcw className="h-3.5 w-3.5" /> Use recommendation
          </Button>
        )}
      </div>

      <p className="text-[10px] leading-4 text-muted-foreground">{selected.description}</p>

      {intervention && (
        <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">{intervention.title}</p>
            <Badge variant="secondary" className="text-[9px]">
              {intervention.appliedMode}{intervention.hintLevel ? ` · hint ${intervention.hintLevel}` : ''}
            </Badge>
          </div>
          <p className="text-xs leading-5 text-foreground/90">{intervention.guidance}</p>
          {intervention.example && (
            <div className="rounded-lg bg-background/80 p-3 text-[11px] leading-5">
              <span className="font-medium">Worked example:</span> {intervention.example}
            </div>
          )}
          <div className="rounded-lg border bg-background/70 p-3 text-[11px] leading-5">
            <span className="font-medium">Your move:</span> {intervention.learnerPrompt}
          </div>
          <p className="text-[9px] text-muted-foreground">
            Support recorded · independence {intervention.independence.score}% · {intervention.independence.status}
          </p>
        </div>
      )}
    </section>
  );
}
