import Link from 'next/link';
import { ArrowRight, CircleDot, Eye, Hand, ShieldCheck, Swords, Terminal, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOperation, operations } from '@/lib/operations/catalog';

type SearchParams = Promise<{ operation?: string }>;

const permissionModes = [
  { label: 'View', detail: 'Observe a teammate terminal without input.', icon: Eye },
  { label: 'Assist', detail: 'Request temporary guided input access.', icon: Hand },
  { label: 'Control', detail: 'Use the existing Live Workspace control lease.', icon: Terminal },
] as const;

export default async function WarRoomPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selected = getOperation(params.operation || '') ?? operations[0];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">WarRoom</h1>
            <Badge className="h-5 text-[10px]">2–4 players</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Team lab control plane: terminals, objectives, evidence and presence in one workspace.</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/operations">Operations</Link></Button>
        <Button asChild size="sm"><Link href={`/live?mode=warroom&operation=${selected.slug}`}><UsersRound className="mr-2 h-4 w-4" />Create team workspace</Link></Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        <Card className="h-fit bg-card/70">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Operation</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {operations.filter((operation) => operation.modes.includes('warroom')).map((operation) => (
              <Link
                key={operation.slug}
                href={`/warroom?operation=${operation.slug}`}
                className={`block rounded-md border px-3 py-2 transition hover:bg-muted/40 ${selected.slug === operation.slug ? 'border-primary/40 bg-primary/[0.05]' : ''}`}
              >
                <p className="truncate text-xs font-semibold">{operation.codename}</p>
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
                  <div key={slot} className="min-h-44 bg-background p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">P{slot + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{slot === 0 ? 'Your terminal' : `Player ${slot + 1}`}</p>
                        <p className="text-[10px] text-muted-foreground">{slot === 0 ? 'Controller' : 'Waiting for teammate'}</p>
                      </div>
                      <CircleDot className={`h-3.5 w-3.5 ${slot === 0 ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                    </div>

                    <div className="rounded-md border bg-black/90 p-3 font-mono text-[10px] leading-5 text-zinc-300">
                      <p className="text-emerald-400">{slot === 0 ? 'operator@warroom:~$' : `player${slot + 1}@warroom:~$`}</p>
                      <p className="text-zinc-500">{slot === 0 ? 'Terminal attaches through Live Workspace.' : 'Observer stream appears when the teammate terminal is attached.'}</p>
                      <span className="inline-block h-3 w-1.5 animate-pulse bg-zinc-500 align-middle" />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {permissionModes.map(({ label, icon: Icon }) => (
                        <Badge key={label} variant={label === 'Control' && slot === 0 ? 'default' : 'outline'} className="h-5 gap-1 text-[9px]">
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
                <Link href={`/labs?operation=${selected.slug}&mode=challenge`}>Open lab <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
