'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, FileSignature, Files, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

interface RecentSignature {
  id: string;
  name: string;
  verified: boolean;
  timestamp: string;
}

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [documentCount, setDocumentCount] = React.useState(0);
  const [signatureCount, setSignatureCount] = React.useState(0);
  const [recent, setRecent] = React.useState<RecentSignature[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/');
  }, [isLoading, router, user]);

  React.useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [documentsResponse, signaturesResponse] = await Promise.all([
          fetch('/api/documents?pageSize=1', { credentials: 'include' }),
          fetch('/api/signatures/recent?limit=5', { credentials: 'include' }),
        ]);
        if (documentsResponse.ok) {
          const documents = await documentsResponse.json();
          setDocumentCount(documents.total || 0);
        }
        if (signaturesResponse.ok) {
          const signatures = await signaturesResponse.json();
          setSignatureCount(signatures.total || 0);
          setRecent(signatures.signatures || []);
        }
      } finally {
        setLoadingData(false);
      }
    };
    void load();
  }, [user]);

  if (isLoading || !user) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div>;
  }

  const actions = [
    { title: 'Sign a document', description: 'Upload, hash, sign, and verify a file', href: '/sign', icon: FileSignature },
    { title: 'Profile', description: 'Update the account attached to new records', href: '/profile', icon: User },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.displayName || user.email.split('@')[0]}</h1>
        <p className="mt-1 text-muted-foreground">Your private signing workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="flex items-center gap-4 p-6"><div className="rounded-xl bg-blue-500/10 p-3"><Files className="h-6 w-6 text-blue-600" /></div><div><p className="text-2xl font-bold">{loadingData ? '—' : documentCount}</p><p className="text-sm text-muted-foreground">Stored documents</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-6"><div className="rounded-xl bg-emerald-500/10 p-3"><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div><div><p className="text-2xl font-bold">{loadingData ? '—' : signatureCount}</p><p className="text-sm text-muted-foreground">Verified signatures</p></div></CardContent></Card>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Actions</h2>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          {actions.map((action) => (
            <button key={action.href} type="button" onClick={() => router.push(action.href)} className="text-left">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
                <CardContent className="p-5"><action.icon className="mb-4 h-7 w-7 text-primary" /><p className="font-semibold">{action.title}</p><p className="mt-1 text-sm text-muted-foreground">{action.description}</p><ArrowRight className="mt-4 h-4 w-4" /></CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Recent signatures</CardTitle><CardDescription>Cryptographically verified records created by this account.</CardDescription></div>
          <Button variant="outline" onClick={() => router.push('/sign')}>Sign document</Button>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : recent.length === 0 ? (
            <div className="py-10 text-center"><FileSignature className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No signatures yet</p><p className="text-sm text-muted-foreground">Sign your first document to create a verified record.</p></div>
          ) : (
            <div className="divide-y">
              {recent.map((signature) => (
                <div key={signature.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0"><p className="truncate font-medium">{signature.name}</p><p className="text-sm text-muted-foreground">{new Date(signature.timestamp).toLocaleString()}</p></div>
                  <div className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Verified</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
