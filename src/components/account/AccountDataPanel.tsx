'use client';

import * as React from 'react';
import { Download, FlaskConical, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCsrfToken } from '@/lib/security/csrf-client';

const UI_PREFERENCE_KEYS = [
  'oxsig:app-sidebar:v1',
  'oxsig:cyber-lab-layout:v1',
  'oxsig:cyber-lab-layout-hint:v1',
  'oxsig:cyber-lab-workspace-mode:v1',
  'oxsig:quick-tour:v1',
];
const RESET_CONFIRMATION = 'RESET MY OXSIG DATA';
const DELETE_CONFIRMATION = 'DELETE';

function clearLocalPreferences() {
  for (const key of UI_PREFERENCE_KEYS) {
    try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

function Row({ icon: Icon, title, description, children, tone }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${tone === 'danger' ? 'border-rose-500/30 bg-rose-500/[0.03]' : 'bg-card/60'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${tone === 'danger' ? 'border-rose-500/30 bg-rose-500/10 text-rose-500' : 'bg-muted/40 text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function AccountDataPanel({ testResetEnabled, onSignedOut }: { testResetEnabled: boolean; onSignedOut: () => Promise<void> }) {
  const [exporting, setExporting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteText, setDeleteText] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [resetText, setResetText] = React.useState('');
  const [resetting, setResetting] = React.useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch('/api/users/me/export', { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oxsig-account-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success('Your data export is downloading.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function resetInterface() {
    clearLocalPreferences();
    toast.success('Interface reset.');
    window.location.assign('/home');
  }

  async function destructive(url: string, body: unknown, setBusy: (value: boolean) => void, fallback: string) {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || fallback);
      clearLocalPreferences();
      await onSignedOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Row icon={Download} title="Export your data" description="Download a JSON copy of your profile, labs, operations, learning progress, vault and messages.">
        <Button variant="outline" size="sm" onClick={() => void exportData()} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
        </Button>
      </Row>

      <Row icon={RotateCcw} title="Reset interface" description="Clear layout preferences on this device. Your profile and progress are not touched.">
        <Button variant="outline" size="sm" onClick={resetInterface}><RotateCcw className="h-4 w-4" /> Reset interface</Button>
      </Row>

      {testResetEnabled && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4 text-amber-500" /> Test-account reset</div>
          <p className="text-xs text-muted-foreground">Only on non-production deployments. This removes your OXSIG data and signs you out, but keeps your sign-in.</p>
          <p className="text-[11px] text-muted-foreground">Type <span className="font-mono font-semibold">{RESET_CONFIRMATION}</span> to continue.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={resetText} onChange={(event) => setResetText(event.target.value)} disabled={resetting} aria-label="Test account reset confirmation" />
            <Button variant="outline" disabled={resetting || resetText !== RESET_CONFIRMATION} onClick={() => void destructive('/api/users/me/reset', { confirmation: RESET_CONFIRMATION }, setResetting, 'Test-account reset failed')}>
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Reset test account
            </Button>
          </div>
        </div>
      )}

      <Row tone="danger" icon={Trash2} title="Delete account" description="Permanently delete your account, cloud resources, files and history. This cannot be undone.">
        <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400" onClick={() => setDeleteOpen((value) => !value)}>
          Delete account
        </Button>
      </Row>

      {deleteOpen && (
        <form
          className="space-y-2 rounded-xl border border-rose-500/30 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (deleteText.trim().toUpperCase() !== DELETE_CONFIRMATION) return;
            void destructive('/api/users/me/delete', { confirmation: deleteText.trim() }, setDeleting, 'Account deletion failed');
          }}
        >
          <p className="text-xs text-muted-foreground">
            Running labs and operations are terminated, your files are removed and you are signed out. Tip: export your data first.
          </p>
          <label htmlFor="delete-account-confirm" className="block text-xs font-medium">Type <span className="font-mono">{DELETE_CONFIRMATION}</span> to confirm</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="delete-account-confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} disabled={deleting} autoComplete="off" />
            <Button type="submit" variant="destructive" disabled={deleting || deleteText.trim().toUpperCase() !== DELETE_CONFIRMATION}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete permanently
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
