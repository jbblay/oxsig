import Link from 'next/link';
import { Clock3, Shield, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationIcon, OperationTopologyPreview } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { operations } from '@/lib/operations/catalog';

const modeLabel = {
  practice: 'Practice',
  walkthrough: 'Walkthrough',
  challenge: 'Challenge',
  warroom: 'WarRoom',
} as const;

export default function OperationsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">Operations</h1>
          <p className="text-xs text-muted-foreground">Preconfigured missions. See the environment, objective and team model before you launch.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/warroom"><Swords className="mr-2 h-4 w-4" />Open WarRoom</Link>
        </Button>
      </div>

      <OperationRunRecovery />

      <div className="grid gap-3 lg:grid-cols-2">
        {operations.map((operation) => {
          const runtimeReady = operation.slug === 'black-domain';
          return (
            <Card key={operation.slug} className="overflow-hidden bg-card/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-primary/10 text-primary">
                    <OperationIcon icon={operation.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{operation.codename}</p>
                      <Badge variant="outline" className="h-5 text-[10px]">{operation.difficulty}</Badge>
                      {runtimeReady ? (
                        <Badge className="h-5 text-[9px]">Live runtime</Badge>
                      ) : (
                        <Badge variant="secondary" className="h-5 text-[9px]">Planned</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{operation.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{operation.domain}</p>
                  </div>
                </div>

                <p className="text-xs leading-5 text-muted-foreground">{operation.summary}</p>

                <div className="rounded-xl border bg-muted/10 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mission environment</p>
                  <OperationTopologyPreview nodes={operation.topologyNodes} compact />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {operation.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[9px]">{tag}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {operation.modes.map((mode) => (
                    <Badge key={mode} variant={mode === 'warroom' ? 'default' : 'secondary'} className="h-5 px-1.5 text-[9px]">
                      {modeLabel[mode]}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{operation.estimatedMinutes}m</span>
                  <span className="flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />{operation.players}</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{operation.objectives.length} goals</span>
                </div>

                {runtimeReady ? (
                  <div className="flex gap-2">
                    <OperationLaunchButton slug={operation.slug} mode="practice" className="flex-1" />
                    {operation.modes.includes('warroom') && (
                      <OperationLaunchButton slug={operation.slug} mode="warroom" variant="outline" className="flex-1" />
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                    Scenario defined. Automated runtime is not implemented yet.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
