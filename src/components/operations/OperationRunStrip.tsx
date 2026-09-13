'use client';

import * as React from 'react';
import { Eye, Loader2, Pause, Play, RefreshCw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RuntimeProgress } from '@/components/warroom/RuntimeProgress';
import { operationLifecycleVoiceCue } from '@/lib/operations/lifecycle-voice';
import { finishReusableEnvironmentReset } from '@/lib/operations/reset-client';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { useOxsigVoicePlayback } from '@/lib/voice/use-voice-playback';

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  readiness?: string;
  privateIp: string | null;
  labInstanceId: string | null;
  lastError: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  expiresAt: string;
  metadata: {
    domain?: string;
    lifecycle?: string;
    environmentSlot?: string;
    lifecycleState?: string;
    initialAccess?: { username?: string; available?: boolean };
  };
  lastError: string | null;
  nodes: RunNode[];
};

type LifecycleProgress = {
  phase: 'active' | 'ready' | 'pausing' | 'paused';
  total: number;
  stopped: number;
  nodeStates: Record<string, string>;
} | null;

type RevealedAccess = { username: string; password: string };
type BusyAction = 'pause' | 'resume' | 'destroy' | null;

export function OperationRunStrip({ runId, compact = false }: { runId: string; compact?: boolean }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [lifecycle, setLifecycle] = React.useState<LifecycleProgress>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<BusyAction>(null);
  const [revealingAccess, setRevealingAccess] = React.useState(false);
  const [revealedAccess, setRevealedAccess] = React.useState<RevealedAccess | null>(null);
  const [voiceEnabled, setVoiceEnabled] = React.useState(false);
  const lastVoiceStageRef = React.useRef<string | null>(null);
  const voiceErrorStageRef = React.useRef<string | null>(null);
  const { speakingKey, play: playVoice, stop: stopVoice } = useOxsigVoicePlayback();

  const refresh = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load Operation runtime');
      setRun(body.run as Run);
      setLifecycle((body.lifecycle || null) as LifecycleProgress);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : 'Could not load Operation runtime');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    setRevealedAccess(null);
    setLifecycle(null);
    setVoiceEnabled(false);
    lastVoiceStageRef.current = null;
    voiceErrorStageRef.current = null;
    stopVoice();
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh, stopVoice]);

  const voiceCue = React.useMemo(() => run ? operationLifecycleVoiceCue(run) : null, [run]);

  React.useEffect(() => {
    if (!voiceEnabled || !voiceCue || lastVoiceStageRef.current === voiceCue.stage) return;
    lastVoiceStageRef.current = voiceCue.stage;
    void playVoice(voiceCue.text, voiceCue.stage).catch((error) => {
      if (voiceErrorStageRef.current === voiceCue.stage) return;
      voiceErrorStageRef.current = voiceCue.stage;
      toast.error(error instanceof Error ? error.message : 'Mission voice playback failed');
    });
  }, [playVoice, voiceCue, voiceEnabled]);

  const toggleVoice = () => {
    if (voiceEnabled) {
      setVoiceEnabled(false);
      lastVoiceStageRef.current = null;
      stopVoice();
      return;
    }
    voiceErrorStageRef.current = null;
    lastVoiceStageRef.current = null;
    setVoiceEnabled(true);
  };

  const changeLifecycle = async (action: 'pause' | 'resume') => {
    setBusy(action);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Could not ${action} Operation`);
      toast.success(action === 'pause' ? 'Pausing Operation.' : 'Resuming Operation.');
      setRevealedAccess(null);
      if (body.run) {
        setRun(body.run as Run);
        setLifecycle((body.lifecycle || null) as LifecycleProgress);
      } else {
        await refresh(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} Operation`);
    } finally {
      setBusy(null);
    }
  };

  const destroy = async () => {
    const prepared = run?.metadata?.lifecycle === 'prepared-environment';
    const message = prepared
      ? 'End this Operation and restore the environment to its clean baseline?'
      : 'End this Operation and destroy its disposable machines?';
    if (!window.confirm(message)) return;
    setBusy('destroy');
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not end Operation');
      setRevealedAccess(null);
      if (body?.reusableEnvironment && body?.reset) {
        toast.info('Operation ended. Restoring the environment to its clean baseline.');
        await finishReusableEnvironmentReset({
          runId,
          csrfToken: csrf,
          initial: body.reset,
        });
        toast.success('Environment restored and returned to standby.');
      } else {
        toast.success('Operation ending.');
      }
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end Operation');
    } finally {
      setBusy(null);
    }
  };

  const revealAccess = async () => {
    setRevealingAccess(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}/access`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not reveal starting access');
      if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
        throw new Error('Starting access response was incomplete');
      }
      setRevealedAccess({ username: body.username, password: body.password });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reveal starting access');
    } finally {
      setRevealingAccess(false);
    }
  };

  if (loading && !run) {
    return <div className="mb-3 flex min-h-14 items-center justify-center rounded-xl border text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting Operation…</div>;
  }
  if (!run) return null;

  const initialAccess = run.metadata?.initialAccess;
  const pauseRequested = run.metadata?.lifecycleState === 'paused';
  const pausing = pauseRequested && lifecycle?.phase !== 'paused';
  const paused = pauseRequested && lifecycle?.phase === 'paused';
  const prepared = run.metadata?.lifecycle === 'prepared-environment';
  const terminalState = ['destroying', 'destroyed', 'failed'].includes(run.status);
  const allReady = run.status === 'running' && run.nodes.length > 0 && run.nodes.every((node) => node.status === 'running');
  const showProgress = compact || pausing || (!pauseRequested && !allReady && !terminalState);
  const visibleStatus = pausing ? 'pausing' : paused ? 'paused' : run.status === 'provisioning' ? 'starting' : run.status;

  return (
    <div className="mb-3 rounded-xl border bg-card/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {compact && <span className="text-xs font-semibold">Environment readiness</span>}
        <Badge variant={allReady && !pauseRequested ? 'default' : 'outline'} className="h-5 text-[9px] capitalize">{visibleStatus}</Badge>
        <div className={`${compact ? 'ml-auto' : ''} flex flex-1 flex-wrap items-center justify-end gap-1`}>
          {voiceCue && (
            <Button
              size="sm"
              variant={voiceEnabled ? 'outline' : 'ghost'}
              className="h-7 px-2 text-[10px]"
              aria-label={voiceEnabled ? 'Disable mission lifecycle voice' : 'Enable mission lifecycle voice'}
              aria-pressed={voiceEnabled}
              title={voiceCue.label}
              onClick={toggleVoice}
            >
              {speakingKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : voiceEnabled ? <Volume2 className="mr-1.5 h-3.5 w-3.5" /> : <VolumeX className="mr-1.5 h-3.5 w-3.5" />}
              {voiceEnabled ? 'Voice on' : 'Voice'}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Refresh environment status" onClick={() => void refresh()} disabled={loading || Boolean(busy)}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
          {!terminalState && pausing && (
            <Button size="sm" variant="outline" className="h-7" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Pausing…
            </Button>
          )}
          {!terminalState && paused && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void changeLifecycle('resume')} disabled={Boolean(busy)}>
              {busy === 'resume' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Resume
            </Button>
          )}
          {!terminalState && !pauseRequested && allReady && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void changeLifecycle('pause')} disabled={Boolean(busy)}>
              {busy === 'pause' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}Pause
            </Button>
          )}
          {!['destroying', 'destroyed'].includes(run.status) && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => void destroy()} disabled={Boolean(busy) || pausing}>
              {busy === 'destroy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}{prepared ? 'End & reset' : 'End & destroy'}
            </Button>
          )}
        </div>
      </div>

      {showProgress && <RuntimeProgress nodes={run.nodes} paused={paused} status={run.status} lifecycle={lifecycle} />}

      {initialAccess?.username && initialAccess.available && allReady && !pauseRequested && !terminalState && (
        <details className="mt-2 rounded-lg border bg-muted/20 px-2.5 py-2" onToggle={(event) => {
          if (event.currentTarget.open && !revealedAccess && !revealingAccess) void revealAccess();
        }}>
          <summary className="cursor-pointer text-[10px] font-medium">Starting identity</summary>
          <div className="mt-2">
            {revealingAccess ? (
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Preparing access…</p>
            ) : revealedAccess ? (
              <p className="break-all font-mono text-[10px] text-muted-foreground">{revealedAccess.username} / {revealedAccess.password}</p>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => void revealAccess()}>
                <Eye className="mr-1.5 h-3 w-3" />Reveal password
              </Button>
            )}
          </div>
        </details>
      )}

      {run.lastError && !terminalState && <p className="mt-2 text-[10px] text-destructive">Environment needs attention. Refresh the status or try again.</p>}
    </div>
  );
}