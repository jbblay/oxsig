'use client';

import * as React from 'react';
import { BrainCircuit, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import AcademyAdaptiveInstructor from '@/components/academy/AcademyAdaptiveInstructor';
import InteractiveSsmTerminal from '@/components/labs/InteractiveSsmTerminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
  AcademyCourse,
  AcademyLearningReflection,
  AcademyLesson,
  AcademyPractice,
  AcademyPracticeEvaluation,
  AcademyUnderstandingSummary,
} from '@/lib/academy/types';
import {
  AI_TERMINAL_RESULT_EVENT,
  AI_TERMINAL_RUN_EVENT,
  type AiTerminalRunRequest,
  type AiTerminalRunResult,
} from '@/lib/labs/ai-terminal-events';
import { getCsrfToken } from '@/lib/security/csrf-client';

type PracticeLesson = AcademyLesson & { practice: AcademyPractice };

type LabInstance = {
  id: string;
  name: string;
};

export type AcademyPracticeWorkspaceExecution = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  risk: 'read-only' | 'changes-system';
  executionId: string;
  evidenceId: string;
  provenance: 'browser-observed' | 'server-executed' | 'provider-attested' | 'learner-provided';
  executionReceiptId: string;
  terminalSessionId: string;
  surface: 'academy';
};

export type AcademyPracticeWorkspaceResult = {
  execution: AcademyPracticeWorkspaceExecution;
  evaluation: AcademyPracticeEvaluation;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function executeInVisibleTerminal(labInstanceId: string, command: string) {
  return new Promise<AiTerminalRunResult>((resolve, reject) => {
    const requestId = uid();
    const timeout = window.setTimeout(() => {
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      reject(new Error('The Academy terminal did not return the checkpoint result in time.'));
    }, 50_000);

    const onResult = (event: Event) => {
      const result = (event as CustomEvent<AiTerminalRunResult>).detail;
      if (!result || result.requestId !== requestId || result.labInstanceId !== labInstanceId) return;
      window.clearTimeout(timeout);
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      resolve(result);
    };

    window.addEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent<AiTerminalRunRequest>(AI_TERMINAL_RUN_EVENT, {
      detail: { requestId, labInstanceId, command, surface: 'academy' },
    }));
  });
}

export default function AcademyPracticeWorkspace({
  course,
  lesson,
  runningLab,
  terminalConnected,
  onResult,
}: {
  course: AcademyCourse;
  lesson: PracticeLesson;
  runningLab: LabInstance;
  terminalConnected: boolean;
  onResult: (result: AcademyPracticeWorkspaceResult) => void;
}) {
  const [prediction, setPrediction] = React.useState('');
  const [explanation, setExplanation] = React.useState('');
  const [reflectionId, setReflectionId] = React.useState<string | null>(null);
  const [execution, setExecution] = React.useState<AcademyPracticeWorkspaceExecution | null>(null);
  const [evaluation, setEvaluation] = React.useState<AcademyPracticeEvaluation | null>(null);
  const [reflection, setReflection] = React.useState<AcademyLearningReflection | null>(null);
  const [understanding, setUnderstanding] = React.useState<AcademyUnderstandingSummary | null>(null);
  const [busy, setBusy] = React.useState<'practice' | 'reflection' | null>(null);

  async function runPractice() {
    const predicted = prediction.trim();
    if (predicted.length < 3) {
      toast.error('Write what you expect to happen before running the checkpoint.');
      return;
    }
    if (!terminalConnected) {
      toast.error('Wait for the Academy terminal to connect before running this checkpoint.');
      return;
    }

    setBusy('practice');
    try {
      const predictionToken = await getCsrfToken();
      const predictionResponse = await fetch('/api/academy/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': predictionToken },
        body: JSON.stringify({
          action: 'predict',
          courseTitle: course.title,
          lessonTitle: lesson.title,
          prediction: predicted,
        }),
      });
      if (!predictionResponse.ok) throw new Error(await apiError(predictionResponse, 'Oxsig could not save your prediction'));
      const predictionBody = await predictionResponse.json() as { reflection: AcademyLearningReflection };
      setReflectionId(predictionBody.reflection.id);
      setReflection(predictionBody.reflection);
      setExecution(null);
      setEvaluation(null);
      setUnderstanding(null);
      setExplanation('');

      toast.info('Prediction captured. Binding the checkpoint to the live terminal session…');
      const terminalResult = await executeInVisibleTerminal(runningLab.id, lesson.practice.command);
      if (terminalResult.error) throw new Error(terminalResult.error);
      if (
        terminalResult.surface !== 'academy' ||
        !terminalResult.executionId ||
        !terminalResult.evidenceId ||
        !terminalResult.executionReceiptId ||
        !terminalResult.terminalSessionId ||
        !terminalResult.provenance ||
        (terminalResult.risk !== 'read-only' && terminalResult.risk !== 'changes-system')
      ) {
        throw new Error('The Academy terminal returned incomplete bound execution evidence.');
      }

      const nextExecution: AcademyPracticeWorkspaceExecution = {
        command: terminalResult.command,
        stdout: terminalResult.stdout,
        stderr: terminalResult.stderr,
        exitCode: terminalResult.exitCode,
        risk: terminalResult.risk,
        executionId: terminalResult.executionId,
        evidenceId: terminalResult.evidenceId,
        provenance: terminalResult.provenance,
        executionReceiptId: terminalResult.executionReceiptId,
        terminalSessionId: terminalResult.terminalSessionId,
        surface: 'academy',
      };
      setExecution(nextExecution);

      const evaluationToken = await getCsrfToken();
      const evaluationResponse = await fetch('/api/academy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': evaluationToken },
        body: JSON.stringify({
          action: 'evaluate',
          evidenceId: nextExecution.evidenceId,
          labInstanceId: runningLab.id,
          courseTitle: course.title,
          lessonTitle: lesson.title,
          instruction: lesson.practice.instruction,
          command: nextExecution.command,
          expected: lesson.practice.expected,
          stdout: nextExecution.stdout,
          stderr: nextExecution.stderr,
          exitCode: nextExecution.exitCode,
        }),
      });
      if (!evaluationResponse.ok) throw new Error(await apiError(evaluationResponse, 'The checkpoint ran, but the Academy instructor could not evaluate it'));
      const evaluationBody = await evaluationResponse.json() as { evaluation: AcademyPracticeEvaluation };
      setEvaluation(evaluationBody.evaluation);
      onResult({ execution: nextExecution, evaluation: evaluationBody.evaluation });

      if (evaluationBody.evaluation.status === 'passed') {
        toast.success('Checkpoint verified. Explain what the evidence means to complete the learning loop.');
      } else {
        toast.info('The evidence needs review. Explain what happened and why.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy checkpoint execution failed');
    } finally {
      setBusy(null);
    }
  }

  async function submitReflection() {
    if (!reflectionId || !execution || !evaluation) return;
    const learnerExplanation = explanation.trim();
    if (learnerExplanation.length < 3) {
      toast.error('Explain what happened in your own words before submitting.');
      return;
    }

    setBusy('reflection');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/academy/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'reflect',
          reflectionId,
          evidenceId: execution.evidenceId,
          explanation: learnerExplanation,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Oxsig could not evaluate your explanation'));
      const body = await response.json() as {
        reflection: AcademyLearningReflection;
        understanding: AcademyUnderstandingSummary | null;
      };
      setReflection(body.reflection);
      if (body.understanding) setUnderstanding(body.understanding);
      toast.success('Your explanation is now part of the Academy evidence trail.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy reflection failed');
    } finally {
      setBusy(null);
    }
  }

  const adaptiveRefreshKey = [
    reflection?.status || 'none',
    reflection?.explanationScore ?? 'none',
    evaluation?.status || 'none',
    understanding?.score ?? 'none',
  ].join(':');

  return (
    <div className="rounded-2xl border p-3 sm:p-4">
      <div className="mb-4 rounded-xl border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-primary" /> Predict before execution
          </div>
          {reflectionId && <Badge variant="outline" className="text-[10px]">Prediction captured</Badge>}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Before the command runs, write what you expect to happen and why. Oxsig records this first so the later evidence can test your mental model.
        </p>
        <Textarea
          value={prediction}
          onChange={(event) => setPrediction(event.target.value.slice(0, 2000))}
          placeholder="I expect this command to… because…"
          className="mt-3 min-h-[82px] resize-none"
          disabled={busy !== null || Boolean(execution) || reflection?.status === 'reflected'}
        />
      </div>

      <AcademyAdaptiveInstructor
        courseTitle={course.title}
        lessonTitle={lesson.title}
        refreshKey={adaptiveRefreshKey}
      />

      <div className="mt-4">
        <InteractiveSsmTerminal key={runningLab.id} labInstanceId={runningLab.id} machineLabel={runningLab.name} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="max-w-2xl text-[11px] leading-5 text-muted-foreground">
          The prediction is persisted before execution. The approved command is then bound to this exact active SSM session and evaluated from its exact evidence record.
        </p>
        <Button onClick={() => void runPractice()} disabled={busy !== null || !terminalConnected || prediction.trim().length < 3 || Boolean(evaluation) || reflection?.status === 'reflected'}>
          {busy === 'practice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {busy === 'practice' ? 'Running & evaluating…' : terminalConnected ? 'Capture prediction & run' : 'Waiting for terminal'}
        </Button>
      </div>

      {execution && evaluation && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Explain the observed evidence
            </div>
            <Badge variant="outline" className="text-[10px]">exact evidence {execution.evidenceId.slice(0, 8)}…</Badge>
          </div>
          <div className="rounded-xl bg-muted/30 p-3 text-xs leading-5">
            <span className="font-medium">Your prediction:</span> {reflection?.prediction || prediction.trim()}
          </div>
          <Textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value.slice(0, 4000))}
            placeholder="What happened? Why did the command produce this result? What does the evidence prove?"
            className="min-h-[100px] resize-none"
            disabled={busy !== null || reflection?.status === 'reflected'}
          />
          {reflection?.status !== 'reflected' && (
            <Button className="w-full" variant="outline" onClick={() => void submitReflection()} disabled={busy !== null || explanation.trim().length < 3}>
              {busy === 'reflection' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy === 'reflection' ? 'Evaluating your explanation…' : 'Submit my explanation'}
            </Button>
          )}
        </div>
      )}

      {reflection?.status === 'reflected' && reflection.evaluation && (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold"><BrainCircuit className="h-4 w-4 text-primary" /> Understanding review</div>
            <Badge variant={reflection.evaluation.status === 'demonstrated' ? 'default' : 'outline'}>
              {reflection.evaluation.score}/100 · {reflection.evaluation.status}
            </Badge>
          </div>
          <p className="text-sm leading-6"><span className="font-medium">Prediction vs reality:</span> {reflection.evaluation.predictionComparison}</p>
          <p className="text-sm leading-6 text-muted-foreground">{reflection.evaluation.explanationFeedback}</p>
          <div className="rounded-lg bg-background/70 p-3 text-xs leading-5"><span className="font-medium">Evidence connection:</span> {reflection.evaluation.evidenceConnection}</div>
          {reflection.evaluation.nextStep && <p className="text-xs"><span className="font-medium">Next:</span> {reflection.evaluation.nextStep}</p>}
          {understanding && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
              <span>Course understanding: {understanding.reflectedPractices}/{understanding.requiredPractices} practical reflections</span>
              <Badge variant="secondary">{understanding.score}% · {understanding.status}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
