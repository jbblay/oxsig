import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, Cloud, LockKeyhole, Network, TerminalSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DevOpsSkillsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/academy" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Academy</Link>
        <span aria-hidden="true">/</span>
        <span>DevOps &amp; Cloud</span>
      </div>
      <header className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-background to-emerald-500/10 p-5 sm:p-8">
        <Badge variant="outline"><Cloud className="mr-1 h-3 w-3" /> DevOps &amp; Cloud</Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">Choose a practical skill</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Go straight into a working environment. Docker is available now; Linux and Kubernetes workspaces are in development.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="DevOps practical skills">
        <Card className="border-emerald-500/40">
          <CardHeader>
            <div className="flex items-center justify-between"><Boxes className="h-7 w-7 text-primary" /><Badge>Ready to practice</Badge></div>
            <CardTitle className="pt-2">Docker</CardTitle>
            <CardDescription>Deploy, troubleshoot, and preserve a real container service using an interactive Linux terminal.</CardDescription>
          </CardHeader>
          <CardContent><Button className="w-full" asChild><Link href="/academy/learn/docker">Open Docker workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
        </Card>
        <Card className="opacity-70">
          <CardHeader>
            <div className="flex items-center justify-between"><TerminalSquare className="h-7 w-7 text-primary" /><LockKeyhole className="h-4 w-4" /></div>
            <CardTitle className="pt-2">Linux</CardTitle>
            <CardDescription>Command-line administration and troubleshooting practice.</CardDescription>
          </CardHeader>
          <CardContent><Badge variant="outline">Coming later</Badge></CardContent>
        </Card>
        <Card className="opacity-70">
          <CardHeader>
            <div className="flex items-center justify-between"><Network className="h-7 w-7 text-primary" /><LockKeyhole className="h-4 w-4" /></div>
            <CardTitle className="pt-2">Kubernetes</CardTitle>
            <CardDescription>Cluster operations, workloads, and incident recovery.</CardDescription>
          </CardHeader>
          <CardContent><Badge variant="outline">Coming later</Badge></CardContent>
        </Card>
      </section>
    </main>
  );
}
