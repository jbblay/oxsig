import Link from 'next/link';
import { ArrowRight, Eye, Hand, ShieldCheck, Swords, Terminal, UsersRound } from 'lucide-react';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOperation, operations } from '@/lib/operations/catalog';

type SearchParams = Promise<{ operation?: string; run?: string }>;

const permissionModes = [
  { label: 'View', detail: 'Observe a teammate terminal without input.', icon: Eye },
  { label: 'Assist', detail: 'Request temporary guided input access.', icon: Hand },
  { label: 'Control', detail: 'Use the existing Live Workspace control lease.', icon: Terminal },
] as const;

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
            <h1 className="text-lg font-semibold tracking-tight">WarRoom</h1>
            <Badge className="h-5 text-[10px]">2–4 players</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Coordinate a team Operation here. Live shared terminals are attached and controlled in Live Workspace.</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/operations">Operations</Link></Button>
        <Button asChild size="sm"><Link href={`/live?mode=warroom&operation=${selected.slug}${params.run ? `&run=${params.run}` : ''}`}><UsersRound className="mr-2 h-4 w-4" />Open Live Workspace</Link></Button>
      </div>

      {!params.run ? (
        <div className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
          Start Black Domain from Operations to create a live WarRoom run. You can still review the team model below.
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        <Card className="h-fit bg-card/70">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Operation</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {warRoomReadyOperations.map((operation) => (
              <Link
                key={operation.slug}
                href={`/warroom?operation=${operation.slug}`}
                className={`block rounded-md border px-3 py-2 transition hover:bg-muted/40 ${selected.slug === operation.slug ? 'border-primary/40 bg-primary/[0.05]' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold">{operation.codename}</p>
                  <Badge variant="secondary" className="h-5 text-[9px]">Ready</Badge>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{operation.domain} · {operation.difficulty}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="overflow-hidden bg-card/70">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <Swords className="h-4 w-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.codename}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{selected.name}</p>
                </div>
                <Badge variant="outline" className="h-5 text-[10px]">{selected.estimatedMinutes} min</Badge>
              </div>

              <div className="grid gap-px bg-border lg:grid-cols-2">
                {[0, 1, 2, 3].map((slot) => (
                  <div key={slot} className="min-h-36 bg-background p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">P{slot + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{slot === 0 ? 'Your slot' : `Player ${slot + 1}`}</p>
                        <p className="text-[10px] text-muted-foreground">Attach an owned Cyber Lab from Live Workspace.</p>
                      </div>
                    </div>

                    <div className="rounded-md border border-dashed p-3 text-[10px] leading-5 text-muted-foreground">
                      Terminal output is not embedded on this overview. View, Assist and Control become active against contributed terminal resources in Live Workspace.
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {permissionModes.map(({ label, icon: Icon }) => (
                        <Badge key={label} variant="outline" className="h-5 gap-1 text-[9px]">
                          <Icon className="h-3 w-3" />{label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/70">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Access model</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              {permissionModes.map(({ label, detail, icon: Icon }) => (
                <div key={label} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-primary" />{label}</div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="bg-card/70">
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

          <Card className="bg-card/70">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {selected.evidence.map((item) => (
                <div key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />{item}
                </div>
              ))}
              <Button asChild size="sm" variant="outline" className="mt-2 w-full">
                <Link href={`/labs?operation=${selected.slug}&mode=challenge${params.run ? `&operationRun=${params.run}` : ''}`}>Open operation lab <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
