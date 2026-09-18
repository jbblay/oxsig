import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Bot, Check, FileCheck2, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { Button } from '@/components/ui/button';
import { authPathWithReturnTo } from '@/lib/auth-return';

export const dynamic = 'force-dynamic';

export default async function AiPreviewPage() {
  const { isAuthenticated } = await getServerAuthState();
  if (isAuthenticated) redirect('/home');

  return (
    <section className="mx-auto max-w-5xl space-y-4 py-2">
      <div className="overflow-hidden rounded-2xl border bg-card/70">
        <div className="border-b bg-gradient-to-r from-cyan-500/[0.08] via-background to-violet-500/[0.08] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-background/70 text-primary"><Bot className="h-5 w-5" /></span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">Guest preview // AI Operator</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">AI that understands the technical context</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Preview how the OXSIG AI explains failures, reasons about the current mission and prepares supported actions. Live execution stays behind authentication and explicit operator approval.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-3">
          <article className="rounded-xl border bg-background/45 p-3"><Sparkles className="h-4 w-4 text-primary" /><h2 className="mt-3 text-sm font-semibold">Explain</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Ask why a command failed or what a service dependency means.</p></article>
          <article className="rounded-xl border bg-background/45 p-3"><Terminal className="h-4 w-4 text-primary" /><h2 className="mt-3 text-sm font-semibold">Plan</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Turn a mission objective into a safe sequence of technical steps.</p></article>
          <article className="rounded-xl border bg-background/45 p-3"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="mt-3 text-sm font-semibold">Authorize</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Supported changes require an authenticated operator and explicit approval.</p></article>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border bg-slate-950 text-slate-200">
          <div className="flex min-h-9 items-center gap-2 border-b border-white/10 px-3 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500"><Bot className="h-3.5 w-3.5 text-cyan-300" /> sample conversation <span className="ml-auto text-emerald-300">preview</span></div>
          <div className="space-y-3 p-4 text-sm leading-6">
            <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-cyan-400 px-3 py-2 text-slate-950">Why are domain logins failing?</div>
            <div className="max-w-[90%] rounded-xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300">The mission topology points to DNS and Kerberos dependencies. I would verify SRV discovery, then test ports 53, 88 and 389 before changing services.</div>
            <div className="max-w-[90%] rounded-xl rounded-bl-sm border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2 text-emerald-200"><FileCheck2 className="mr-2 inline h-4 w-4" />Evidence suggestion: capture discovery output before remediation.</div>
          </div>
        </div>

        <aside className="rounded-xl border bg-card/70 p-4">
          <h2 className="text-sm font-semibold">Where the guest boundary sits</h2>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> See the AI workflow</span>
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Inspect example reasoning</span>
            <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> Live environment actions require sign-in</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href="/operations">Browse missions</Link></Button>
            <Button asChild size="sm"><Link href={authPathWithReturnTo('/sign-up', '/ai')}>Create account <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
