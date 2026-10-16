'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getLabsSnapshot, type ClientLabInstance } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';

export default function DockerLabAccess({ onChange }: { onChange: (lab: ClientLabInstance | null, ready: boolean) => void }) {
  const [lab, setLab] = React.useState<ClientLabInstance | null>(null);
  const [message, setMessage] = React.useState('Checking your learning environment…');
  const [state, setState] = React.useState('loading');
  const [busy, setBusy] = React.useState(false);
  const [compatible, setCompatible] = React.useState(false);
  const [configured, setConfigured] = React.useState(false);
  const callback = React.useRef(onChange);
  callback.current = onChange;

  const inspect = React.useCallback(async () => {
    const snapshot = await getLabsSnapshot({ force: true });
    if (!snapshot.ok) throw new Error(snapshot.status === 401 ? 'Your session expired. Sign in again, then refresh.' : snapshot.data.error || 'Cannot load environments. Retry below.');
    setConfigured(Boolean(snapshot.data.capabilities?.configured && snapshot.data.capabilities?.supportsTerminal));
    const instances = snapshot.data.instances || [];
    const current = instances.find(item => !['destroyed', 'failed'].includes(item.status)) || instances[0] || null;
    setLab(current);
    if (!current) { callback.current(null, false); setState('empty'); setMessage('Start a temporary Linux environment. Your account’s lab quota and session time limit apply.'); return; }
    const linux = snapshot.data.catalog?.some(item => item.slug === current.slug && item.platform === 'linux' && item.launchSurface === 'cyber-lab') || false;
    setCompatible(linux);
    if (new Date(current.expiresAt).getTime() <= Date.now()) { callback.current(null, false); setState('blocked'); setMessage('This environment has expired. Your verified learning record is safe. Open lab controls to clean it up, then start fresh. Files on the expired machine cannot be restored.'); return; }
    if (!linux) { callback.current(null, false); setState('blocked'); setMessage('Your current environment is used for another subject. Open lab controls to finish that work and release it before starting Docker.'); return; }
    if (['created', 'provisioning'].includes(current.status)) { callback.current(null, false); setState('starting'); setMessage('Linux is starting. This can take several minutes. You can read the concept and mission while you wait.'); return; }
    if (current.status !== 'running') { callback.current(null, false); setState('blocked'); setMessage(`Your environment is ${current.status}. Use lab controls to resume or release it, then refresh here.`); return; }
    const response = await fetch('/api/academy/missions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
      body: JSON.stringify({ action: 'readiness', labInstanceId: current.id, install: false }),
    });
    const body = await response.json();
    if (!response.ok) { if (body.code === 'LAB_RUN_CONFLICT' || response.status === 401) callback.current(null, false); throw new Error(body.error || 'Cannot reach Linux yet. Wait a moment, then refresh.'); }
    setState(body.state);
    setMessage(body.state === 'ready' ? 'Docker is ready. Connect to the terminal and begin your assignment.' : body.state === 'preparing' ? 'Preparing Docker from Ubuntu’s package repositories. This may take up to ten minutes.' : body.state === 'failed' ? 'Docker preparation failed. Retry preparation or open lab controls for diagnostics.' : 'Linux is available, but Docker is not ready. Prepare Docker below on Ubuntu, or use a Docker-ready Linux environment.');
    callback.current(current, body.state === 'ready');
  }, []);

  const inFlight = React.useRef(false);
  async function run(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await operation(); } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Environment unavailable. Retry below.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  React.useEffect(() => { void run(inspect); }, [inspect]);
  React.useEffect(() => {
    if (!['starting', 'preparing'].includes(state)) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - started > 600_000) { clearInterval(timer); setState('error'); setMessage('Preparation is taking longer than expected. Refresh status or open lab controls for diagnostics.'); return; }
      void run(inspect);
    }, 15_000);
    return () => clearInterval(timer);
  }, [inspect, state]);

  async function launch() {
    const response = await fetch('/api/labs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() }, body: JSON.stringify({ slug: 'ubuntu-security-lab', accessMode: 'terminal' }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Environment launch failed. Refresh status before retrying.');
    await inspect();
  }
  async function prepare() {
    if (!lab) return;
    const response = await fetch('/api/academy/missions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() }, body: JSON.stringify({ action: 'readiness', labInstanceId: lab.id, install: true }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Docker preparation failed.');
    await inspect();
  }
  return <div className="space-y-2 rounded-lg border p-3">
    <h3 className="text-sm font-semibold">Your Linux environment</h3>
    {lab && <p className="text-xs">{lab.name} · {lab.status}</p>}
    <p className="text-xs text-muted-foreground" role="status">{message}</p>
    {!configured && state !== 'loading' && <p className="text-xs">Live labs require this deployment’s AWS and terminal configuration. Your learning records remain available.</p>}
    <div className="flex flex-wrap gap-2">
      {state === 'empty' && <Button size="sm" disabled={busy || !configured} onClick={() => void run(launch)}>Start Linux environment</Button>}
      {compatible && lab?.slug === 'ubuntu-security-lab' && ['missing', 'failed'].includes(state) && <Button size="sm" disabled={busy} onClick={() => void run(prepare)}>Prepare Docker on this lab</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(inspect)}>{busy ? 'Checking…' : 'Refresh status'}</Button>
      <Button size="sm" variant="ghost" asChild><Link href="/labs">Lab controls</Link></Button>
    </div>
    <p className="text-[11px] text-muted-foreground">Preparation installs Docker and curl on Ubuntu. It does not replace your containers. Achievements and notes survive expiry; machine files do not. Recreate your deployment in a fresh lab when returning.</p>
  </div>;
}
