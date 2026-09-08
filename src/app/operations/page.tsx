import Link from 'next/link';
import { ArrowRight, Clock3, Crosshair, Shield, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">Operations</h1>
          <p className="text-xs text-muted-foreground">Preconfigured labs. Pick a scenario and get straight into the work.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/warroom"><Swords className="mr-2 h-4 w-4" />Open WarRoom</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {operations.map((operation) => {
          const automatedTopology = operation.slug === 'black-domain';
          return (
            <Card key={operation.slug} className="overflow-hidden bg-card/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <Crosshair className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{operation.codename}</p>
                      <Badge variant="outline" className="h-5 text-[10px]">{operation.difficulty}</Badge>
                      {automatedTopology && <Badge className="h-5 text-[9px]">3-node auto</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{operation.name}</p>
                  </div>
                </div>

                <p className="text-xs leading-5 text-muted-foreground">{operation.summary}</p>

                <div className="flex flex-wrap gap-1.5">
                  {operation.modes.map((mode) => (
                    <Badge key={mode} variant={mode === 'warroom' ? 'default' : 'secondary'} className="h-5 px-1.5 text-[9px]">
                      {modeLabel[mode]}
                    </Badge>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{operation.estimatedMinutes}m</span>
                  <span className="flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />{operation.players}</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{operation.objectives.length} goals</span>
                </div>

                <div className="flex gap-2">
                  {automatedTopology ? (
                    <OperationLaunchButton slug={operation.slug} mode="practice" className="flex-1" />
                  ) : (
                    <Button asChild size="sm" className="flex-1">
                      <Link href={`/labs?operation=${operation.slug}&mode=practice`}>
                        Start <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  {operation.modes.includes('warroom') && (
                    automatedTopology ? (
                      <OperationLaunchButton slug={operation.slug} mode="warroom" variant="outline" className="flex-1" />
                    ) : (
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link href={`/warroom?operation=${operation.slug}`}>WarRoom</Link>
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
