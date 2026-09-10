import Link from 'next/link';
import { ShieldCheck, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationIcon, OperationTopologyPreview } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WarRoomWorkspace from '@/components/warroom/WarRoomWorkspace';
import { getOperation, operations } from '@/lib/operations/catalog';

type SearchParams = Promise<{ operation?: string; run?: string; workspace?: string }>;

const warRoomReadyOperations = operations.filter(
  (operation) => operation.slug === 'black-domain' && operation.modes.includes('warroom'),
);

export default async function WarRoomPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = getOperation(params.operation || '');
  const selected = requested?.slug === 'black-domain' ? requested : warRoomReadyOperations[0];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-slate-950 px-3 py-2.5 text-slate-100">
        <div className="mr-auto flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <Swords className="h-4 w-4 text-red-300" />
          <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">WarRoom</h1>
          <Badge variant="outline" className="h-5 border-white/15 bg-white/5 text-[9px] text-slate-300">2–4 operators</Badge>
        </div>
        <span className="hidden font-mono text-[9px] uppercase tracking-widest text-slate-600 sm:inline">secure collaboration channel</span>
        <Button asChild size="sm" variant="outline" className="h-8 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"><Link href="/operations">Operations</Link></Button>
        <Button asChild size="sm" variant="ghost" className="h-8 text-slate-300 hover:bg-white/10 hover:text-white"><Link href="/live"><UsersRound className="mr-2 h-4 w-4" />Live Workspace</Link></Button>
      </div>

      {params.run ? (
        <WarRoomWorkspace key={params.run} operation={selected} runId={params.run} initialWorkspaceId={params.workspace} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border bg-primary/10 text-primary">
                  <OperationIcon icon={selected.icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{selected.codename}</h2>
                    <Badge variant="outline">{selected.difficulty}</Badge>
                    <Badge>WarRoom ready</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{selected.name}</p>
                </div>
              </div>

              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{selected.summary}</p>

              <div className="rounded-xl border bg-muted/10 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Shared mission environment</p>
                <OperationTopologyPreview nodes={selected.topologyNodes} />
              </div>

              <OperationLaunchButton slug={selected.slug} mode="warroom" label="Start team Operation" />
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Objectives</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selected.objectives.map((objective, index) => (
                  <div key={objective} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] tabular-nums">{index + 1}</span>
                    <span className="text-[11px] leading-4">{objective}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selected.evidence.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />{item}</div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
