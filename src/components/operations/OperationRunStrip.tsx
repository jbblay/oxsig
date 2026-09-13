'use client';

import * as React from 'react';
import { Eye, Loader2, Pause, Play, RefreshCw, Trash2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RuntimeProgress } from '@/components/warroom/RuntimeProgress';
import { OperationRunProvider, useOperationRun, useOptionalOperationRun } from '@/components/operations/OperationRunProvider';
import { operationLifecycleVoiceCue } from '@/lib/operations/lifecycle-voice';
import { finishReusableEnvironmentReset } from '@/lib/operations/reset-client';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { useOxsigVoicePlayback } from '@/lib/voice/use-voice-playback';

type RevealedAccess = { username: string; password: string };
type BusyAction = 'pause' | 'resume' | 'destroy' | null;

function OperationRunStripContent({ compact = false }: { compact?: boolean }) {
  const {
    runId,
    run,
    lifecycle,
    loading,
    refreshError,
    allReady,
    paused,
    terminalState,
    needsProgressPolling,
    refresh,
    applyPayload,
  } = useOperationRun();
  const [busy, setBusy] = React.useState<BusyAction>(null);
  const [revealingAccess, setRevealingAccess] = React.useState(false);
  const [revealedAccess, setRevealedAccess] = React.useState<RevealedAccess | null>(null);
  const [voiceEnabled, setVoiceEnabled] = React.useState(false);
  const lastVoiceStageRef = React.useRef<string | null>(null);
  const voiceErrorStageRef = React.useRef<string | null>(null);
  const { speakingKey, play: playVoice, stop: stopVoice } = useOxsigVoicePlayback();

  React.useEffect(() => {
    setRevealedAccess(null);
    setVoiceEnabled(false);
    lastVoiceStageRef.current = null;
    voiceErrorStageRef.current = null;
    stopVoice();
  }, [runId, stopVoice]);

  const pauseRequested = run?.metadata?.lifecycleState === 'paused';
  const pausing = Boolean(run && pauseRequested && lifecycle?.phase !== 'paused');

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
      if (body.run) applyPayload(body);
      else await refresh({ quiet: true, reconcile: true });
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
      await refresh({ quiet: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not end Operation');
      await refresh({ quiet: true }).catch(() => undefined);
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
  if (!run) {
    return (
      <div className="mb-3 flex min-h-14 items-center justify-between rounded-xl border px-3 text-xs text-muted-foreground">
        <span>{refreshError || 'Operation runtime is temporarily unavailable.'}</span>
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>Retry</Button>
      </div>
    );
  }

  const initialAccess = run.metadata?.initialAccess;
  const prepared = run.metadata?.lifecycle === 'prepared-environment';
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
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label="Refresh environment status"
            onClick={() => void refresh({ reconcile: needsProgressPolling })}
            disabled={loading || Boolean(busy)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
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

      {refreshError && !terminalState && <p className="mt-2 text-[10px] text-muted-foreground">Machine status may be out of date.</p>}
      {run.lastError && !terminalState && <p className="mt-2 text-[10px] text-destructive">Environment needs attention. Refresh the status or try again.</p>}
    </div>
  );
}

export function OperationRunStrip({ runId, compact = false }: { runId: string; compact?: boolean }) {
  const shared = useOptionalOperationRun();
  if (!shared || shared.runId !== runId) {
    return (
      <OperationRunProvider runId={runId}>
        <OperationRunStripContent compact={compact} />
      </OperationRunProvider>
    );
  }
  return <OperationRunStripContent compact={compact} />;
}
