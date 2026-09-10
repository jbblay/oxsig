import Link from 'next/link';
import { ShieldCheck, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';
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
      {params.run ? <OperationRunStrip runId={params.run} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">WarRoom</h1>
            <Badge className="h-5 text-[10px]">2–4 players</Badge>
          </div>
          <p className="text-xs text-muted-foreground">One Operation, one runtime, one team view. People and machine control stay attached to the same mission.</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/operations">Operations</Link></Button>
        <Button asChild size="sm" variant="ghost"><Link href="/live"><UsersRound className="mr-2 h-4 w-4" />Live Workspace</Link></Button>
      </div>

      {params.run ? (
        <WarRoomWorkspace operation={selected} runId={params.run} initialWorkspaceId={params.workspace} />
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

              <div className="rounded-xl border border-dashed p-4">
                <div className="flex items-start gap-3">
                  <UsersRound className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Start the team Operation here</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">OXSIG provisions the same Black Domain topology used by Cyber Lab, then durably links a Live Workspace team layer. The host operator lab is attached automatically; teammates can contribute their own Cyber Labs without transferring ownership.</p>
                  </div>
                </div>
                <OperationLaunchButton slug={selected.slug} mode="warroom" label="Start team Operation" className="mt-4" />
              </div>
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
