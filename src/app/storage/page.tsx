'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, File, HardDrive, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

type StoredFile = { key: string; filename: string; size: number; url: string; createdAt?: string };
type UploadGrant = { upload: { url: string; fields: Record<string, string>; expiresIn: number } };

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function csrfToken() {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not prepare secure request');
  return (await response.json()).token as string;
}

export default function StoragePage() {
  const { isAuthenticated } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) { setFiles([]); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/storage/list', { cache: 'no-store' });
      if (!response.ok) throw new Error('Storage is not configured or unavailable');
      setFiles(await response.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load storage');
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const grantResponse = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': await csrfToken(),
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
        }),
      });
      if (!grantResponse.ok) {
        throw new Error((await grantResponse.json().catch(() => ({}))).error || 'Upload could not be prepared');
      }

      const grant = await grantResponse.json() as UploadGrant;
      const form = new FormData();
      Object.entries(grant.upload.fields).forEach(([key, value]) => form.append(key, value));
      form.append('file', file);

      const uploadResponse = await fetch(grant.upload.url, { method: 'POST', body: form });
      if (!uploadResponse.ok) throw new Error(`S3 upload failed (${uploadResponse.status})`);

      toast.success('File uploaded');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function remove(key: string) {
    setBusy(true);
    try {
      const response = await fetch('/api/storage/delete-multiple', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await csrfToken() }, body: JSON.stringify({ keys: [key] }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Delete failed');
      toast.success('File deleted');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Delete failed'); }
    finally { setBusy(false); }
  }

  if (!isAuthenticated) return <Card><CardHeader><CardTitle>Storage</CardTitle><CardDescription>Sign in to store files in your Oxsig workspace.</CardDescription></CardHeader></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><HardDrive className="h-7 w-7" /><h1 className="text-3xl font-semibold">Storage</h1></div><p className="mt-1 text-muted-foreground">Authenticated cloud files, scoped to your Oxsig account.</p></div><div><input ref={input} type="file" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} /><Button disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload</Button></div></div>
      <Card><CardContent className="pt-6">{loading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : files.length === 0 ? <div className="py-12 text-center text-muted-foreground">No files yet.</div> : <div className="divide-y">{files.map((file) => <div key={file.key} className="flex items-center gap-3 py-3"><File className="h-5 w-5" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{file.filename}</p><p className="text-xs text-muted-foreground">{size(file.size)}</p></div><Button asChild size="icon" variant="ghost"><a href={file.url}><Download className="h-4 w-4" /></a></Button><Button size="icon" variant="ghost" disabled={busy} onClick={() => void remove(file.key)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}</CardContent></Card>
    </div>
  );
}
