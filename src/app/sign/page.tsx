'use client';

import * as React from 'react';
import { getPublicKeyAsync, signAsync, utils as ed25519Utils } from '@noble/ed25519';
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileSignature,
  Hash,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StoredDocument {
  id: string;
  title: string;
  fileSize: number;
  mimeType: string;
  contentHash: string;
}

interface SignatureReceipt {
  id: string;
  documentId: string;
  documentTitle: string;
  algorithm: string;
  publicKey: string;
  signatureData: string;
  signedAt: string;
  verified: boolean;
  verifiedAt: string;
}

interface RecentSignature {
  id: string;
  documentId: string;
  name: string;
  verified: boolean;
  timestamp: string;
  algorithm: string;
  fileSize: number | null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Text document';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveReceipt(document: StoredDocument, receipt: SignatureReceipt): void {
  const payload = JSON.stringify({
    version: 1,
    document: {
      id: document.id,
      title: document.title,
      sha256: document.contentHash,
    },
    signature: receipt,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${document.title.replace(/[^a-z0-9._-]+/gi, '_')}.oxsig.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.message || body?.error || `Request failed (${response.status})`;
}

export default function DocumentSigningPage() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [document, setDocument] = React.useState<StoredDocument | null>(null);
  const [receipt, setReceipt] = React.useState<SignatureReceipt | null>(null);
  const [busy, setBusy] = React.useState<'uploading' | 'signing' | 'removing' | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentSignature[]>([]);
  const [loadingRecent, setLoadingRecent] = React.useState(true);

  const loadRecent = React.useCallback(async () => {
    setLoadingRecent(true);
    try {
      const response = await fetch('/api/signatures/recent?limit=5', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setRecent(data.signatures || []);
      }
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  React.useEffect(() => { void loadRecent(); }, [loadRecent]);

  const uploadFile = async (file: File) => {
    setBusy('uploading');
    setDocument(null);
    setReceipt(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Files must be 25 MB or smaller');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      const localHash = bytesToHex(digest);
      const formData = new FormData();
      formData.set('file', file);
      formData.set('metadata', JSON.stringify({ status: 'ready' }));
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await responseError(response));
      const stored = await response.json() as StoredDocument;
      if (stored.contentHash !== localHash) {
        await fetch(`/api/documents/${stored.id}`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(() => undefined);
        throw new Error('The stored document digest does not match the selected file');
      }
      setDocument(stored);
      toast.success('Document stored and hashed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const signDocument = async () => {
    if (!document) return;
    setBusy('signing');
    try {
      const secretKey = ed25519Utils.randomSecretKey();
      let publicKey: Uint8Array;
      let signature: Uint8Array;
      try {
        publicKey = await getPublicKeyAsync(secretKey);
        signature = await signAsync(hexToBytes(document.contentHash), secretKey);
      } finally {
        secretKey.fill(0);
      }
      const response = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId: document.id,
          signatureData: bytesToBase64(signature),
          publicKey: bytesToBase64(publicKey),
          signatureType: 'approval',
          algorithm: 'ed25519',
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const created = await response.json() as SignatureReceipt;
      if (!created.verified) throw new Error('The recorded signature could not be verified');
      setReceipt(created);
      toast.success('Signature created and verified');
      await loadRecent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Signing failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadReceipt = () => {
    if (!receipt || !document) return;
    saveReceipt(document, receipt);
  };

  const downloadRecentReceipt = async (item: RecentSignature) => {
    try {
      const [documentResponse, signatureResponse] = await Promise.all([
        fetch(`/api/documents/${item.documentId}`, { credentials: 'include' }),
        fetch(`/api/signatures/${item.id}`, { credentials: 'include' }),
      ]);
      if (!documentResponse.ok) throw new Error(await responseError(documentResponse));
      if (!signatureResponse.ok) throw new Error(await responseError(signatureResponse));
      const storedDocument = await documentResponse.json() as StoredDocument;
      const storedReceipt = await signatureResponse.json() as SignatureReceipt;
      saveReceipt(storedDocument, storedReceipt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download receipt');
    }
  };

  const reset = async () => {
    if (document && !receipt) {
      setBusy('removing');
      try {
        const response = await fetch(`/api/documents/${document.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) throw new Error(await responseError(response));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to remove the unsigned document');
        return;
      } finally {
        setBusy(null);
      }
    }
    setDocument(null);
    setReceipt(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5"><FileSignature className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sign a document</h1>
            <p className="text-muted-foreground">Store a private file, hash it with SHA-256, and create a verified Ed25519 signature.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>{document ? 'Document ready' : 'Choose a document'}</CardTitle>
            <CardDescription>Files remain private in object storage and are limited to 25 MB.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!document ? (
              <>
                <button
                  type="button"
                  className={cn(
                    'flex min-h-64 w-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
                  )}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void uploadFile(file);
                  }}
                  onClick={() => inputRef.current?.click()}
                  disabled={busy !== null}
                >
                  {busy === 'uploading' ? <Loader2 className="h-12 w-12 animate-spin text-primary" /> : <Upload className="h-12 w-12 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{busy === 'uploading' ? 'Hashing and uploading…' : 'Drop a file here or browse'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Any file type · maximum 25 MB</p>
                  </div>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
              </>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-4">
                  <div className="flex min-w-0 gap-3">
                    <FileCheck2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{document.title}</p>
                      <p className="text-sm text-muted-foreground">{formatBytes(document.fileSize)} · {document.mimeType || 'application/octet-stream'}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void reset()} disabled={busy !== null} aria-label="Choose another file">
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Hash className="h-4 w-4" /> SHA-256 digest</div>
                  <code className="block break-all rounded-md bg-muted p-3 text-xs">{document.contentHash}</code>
                </div>

                {receipt ? (
                  <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                      <div>
                        <p className="font-semibold">Signature verified</p>
                        <p className="text-sm text-muted-foreground">The stored digest and Ed25519 signature match.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Ed25519</Badge>
                      <Badge variant="outline">SHA-256</Badge>
                      <Badge className="bg-emerald-600">Verified</Badge>
                    </div>
                    <Button variant="outline" onClick={downloadReceipt} className="gap-2">
                      <Download className="h-4 w-4" /> Download receipt
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full gap-2" size="lg" onClick={() => void signDocument()} disabled={busy !== null}>
                    {busy === 'signing' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSignature className="h-5 w-5" />}
                    {busy === 'signing' ? 'Signing and verifying…' : 'Sign document'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">What is enforced</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Owner-only access</p><p className="text-muted-foreground">Uploads, downloads, and signatures are scoped to your account.</p></div></div>
              <div className="flex gap-3"><Hash className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Server-stored digest</p><p className="text-muted-foreground">Verification uses the digest computed during upload, not a client-supplied replacement.</p></div></div>
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Cryptographic validation</p><p className="text-muted-foreground">Invalid signatures are rejected before a record is created.</p></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle className="text-lg">Recent signatures</CardTitle><CardDescription>Your latest verified records.</CardDescription></div>
              <Button variant="ghost" size="icon" onClick={() => void loadRecent()} aria-label="Refresh signatures"><RefreshCw className={cn('h-4 w-4', loadingRecent && 'animate-spin')} /></Button>
            </CardHeader>
            <CardContent>
              {loadingRecent && recent.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No signatures yet.</p>
              ) : (
                <div className="space-y-3">
                  {recent.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-medium">{item.name}</p><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /></div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatBytes(item.fileSize)} · {new Date(item.timestamp).toLocaleString()}</p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => void downloadRecentReceipt(item)}>Receipt</Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/documents/${item.documentId}/download`}>Document</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
