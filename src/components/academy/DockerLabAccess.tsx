'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getLabsSnapshot, invalidateLabsSnapshot, type ClientLabInstance } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';

export default function DockerLabAccess({ onChange }: { onChange: (lab: ClientLabInstance | null, ready: boolean) => void }) {
  const [lab, setLab] = React.useState<ClientLabInstance | null>(null);
  const [message, setMessage] = React.useState('Checking your learning environment…');
  const [state, setState] = React.useState('loading');
  const [busy, setBusy] = React.useState(false);
  const [compatible, setCompatible] = React.useState(false);
  const [configured, setConfigured] = React.useState(false);
  const [operationManaged, setOperationManaged] = React.useState(false);
  const callback = React.useRef(onChange);
  callback.current = onChange;

  const inspect = React.useCallback(async () => {
    const snapshot = await getLabsSnapshot({ force: true });
    if (!snapshot.ok) throw new Error(snapshot.status === 401 ? 'Your session expired. Sign in again, then refresh.' : snapshot.data.error || 'Cannot load environments. Retry below.');
    setConfigured(Boolean(snapshot.data.capabilities?.configured && snapshot.data.capabilities?.supportsTerminal));
    const instances = snapshot.data.instances || [];
    const current = instances.find(item => !['destroyed', 'failed'].includes(item.status)) || instances.find(item => item.status === 'failed') || null;
    setLab(current);
    const definition = snapshot.data.catalog?.find(item => item.slug === current?.slug);
    const managedOperation = Boolean(current?.metadata?.operationManaged || current?.metadata?.operationRunId || definition?.launchSurface === 'operation');
    setOperationManaged(managedOperation);
    if (managedOperation) { setCompatible(false); callback.current(null, false); setState('blocked'); setMessage('An Operation is using your lab allocation. Finish or release it in Operations before starting Docker. Academy will not manage its machines.'); return; }
    if (!current) { setCompatible(false); callback.current(null, false); setState('empty'); setMessage('Start a temporary Linux environment. Your account’s lab quota and session time limit apply.'); return; }
    if (['destroying', 'stopping'].includes(current.status)) { callback.current(null, false); setState('starting'); setMessage('Updating the machine lifecycle. The next environment will be available after this finishes.'); return; }
    const linux = snapshot.data.catalog?.some(item => item.slug === current.slug && item.platform === 'linux' && item.launchSurface === 'cyber-lab') || false;
    setCompatible(linux);
    if (new Date(current.expiresAt).getTime() <= Date.now()) { callback.current(null, false); setState('blocked'); setMessage('This environment has expired. Your verified learning record is safe. Use the controls here to release it, then start fresh. Files on the expired machine cannot be restored.'); return; }
    if (!linux) { callback.current(null, false); setState('blocked'); setMessage('Your current environment is used for another subject. You can release that machine here after saving any work you need.'); return; }
    if (['created', 'provisioning'].includes(current.status)) { callback.current(null, false); setState('starting'); setMessage('Linux is starting. This can take several minutes. You can read the concept and mission while you wait.'); return; }
    if (current.status !== 'running') { callback.current(null, false); setState('blocked'); setMessage(`Your environment is ${current.status}. Resume or release it using the controls below.`); return; }
    const response = await fetch('/api/academy/missions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
      body: JSON.stringify({ action: 'readiness', labInstanceId: current.id, install: false }),
    });
    const body = await response.json();
    if (!response.ok) { if (body.code === 'LAB_RUN_CONFLICT' || response.status === 401) callback.current(null, false); throw new Error(body.error || 'Cannot reach Linux yet. Wait a moment, then refresh.'); }
    setState(body.state);
    setMessage(body.state === 'ready' ? 'Docker is ready. Connect to the terminal and begin your assignment.' : body.state === 'preparing' ? 'Preparing Docker from Ubuntu’s package repositories. This may take up to ten minutes.' : body.state === 'failed' ? 'Docker preparation failed. Retry preparation or refresh its status here.' : 'Linux is available, but Docker is not ready. Prepare Docker below on Ubuntu, or use a Docker-ready Linux environment.');
    callback.current(body.state === 'ready' ? current : null, body.state === 'ready');
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
      if (Date.now() - started > 600_000) { clearInterval(timer); setState('error'); setMessage('Preparation is taking longer than expected. Refresh status or try again.'); return; }
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
  async function manage(action: 'start' | 'stop' | 'destroy') {
    if (!lab) return;
    if (operationManaged) throw new Error('This machine belongs to an active multi-machine Operation. Manage that Operation in its own workspace.');
    if ((action === 'destroy' || !compatible) && !window.confirm((action === 'destroy' ? 'Destroy ' + lab.name + '? This permanently removes the temporary machine and its files.' : 'Change the state of ' + lab.name + '? This is not your Docker practice environment.') + ' Your Academy achievements and saved notes remain. Continue?')) return;
    const response = await fetch('/api/labs/instances/' + encodeURIComponent(lab.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to manage this environment. Refresh its status and try again.');
    callback.current(null, false);
    invalidateLabsSnapshot();
    await inspect();
  }


  return <div className="rounded-xl border bg-card p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">Linux environment</h2>
        <p className="mt-1 text-xs text-muted-foreground" role="status">{message}</p>
      </div>
      <span className={'rounded-full border px-2 py-1 text-[11px] font-medium ' + (state === 'ready' ? 'border-emerald-500/40 text-emerald-600' : 'text-muted-foreground')}>
        {state === 'ready' ? 'Ready' : state === 'starting' || state === 'preparing' || state === 'loading' ? 'Preparing' : state === 'empty' ? 'Not started' : 'Needs attention'}
      </span>
    </div>
    {lab && <p className="mt-2 text-xs text-muted-foreground">{lab.name} · {lab.status}</p>}
    {!configured && state !== 'loading' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Live labs require AWS and terminal configuration on this deployment. Your learning record remains available.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {state === 'empty' && <Button size="sm" disabled={busy || !configured} onClick={() => void run(launch)}>Start Linux</Button>}
      {compatible && lab?.slug === 'ubuntu-security-lab' && ['missing', 'failed'].includes(state) && <Button size="sm" disabled={busy} onClick={() => void run(prepare)}>Prepare Docker</Button>}
      {state === 'blocked' && lab?.status === 'stopped' && !operationManaged && new Date(lab.expiresAt).getTime() > Date.now() && <Button size="sm" disabled={busy} onClick={() => void run(() => manage('start'))}>Resume Linux</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(inspect)}>{busy ? 'Checking…' : 'Refresh status'}</Button>
    </div>
    {lab && <details className="mt-3 rounded-lg border p-2 text-xs" open={state === 'blocked' || state === 'error' ? true : undefined}>
      <summary className="cursor-pointer font-medium">Manage this environment</summary>
      <p className="my-2 text-muted-foreground">Use these controls without leaving Academy. Stopping preserves the temporary machine only until its expiry; destroying permanently removes its files.</p>
      {operationManaged && <p className="my-2 text-amber-700 dark:text-amber-300">This machine belongs to a multi-machine Operation. Finish or release it from <Link href="/operations" className="underline">Operations</Link> before starting Docker; Academy will not destroy unrelated exercise machines.</p>}
      {!operationManaged && <div className="flex flex-wrap gap-2">
        {lab.status === 'stopped' && new Date(lab.expiresAt).getTime() > Date.now() && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => manage('start'))}>Resume</Button>}
        {lab.status === 'running' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => manage('stop'))}>Stop</Button>}
        {!['destroyed', 'destroying', 'stopping'].includes(lab.status) && <Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(() => manage('destroy'))}>Destroy machine</Button>}
      </div>}
    </details>}
    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Ubuntu preparation installs Docker and curl when required. Achievements survive expiry; machine files do not.</p>
  </div>;
}
