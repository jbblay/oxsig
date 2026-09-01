import {
  Boxes,
  CircleStop,
  Cpu,
  HardDrive,
  LockKeyhole,
  Network,
  Play,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LAB_CATALOG } from '@/lib/labs/catalog';

export default function LabsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cyber Labs</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Disposable, user-owned security environments. Lab controls remain disabled until an isolated runtime is connected; OXSIG will not simulate a running machine.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">Runtime: Not Connected</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Boxes className="h-5 w-5 mb-3 text-blue-500" />
            <div className="text-2xl font-bold">{LAB_CATALOG.length}</div>
            <p className="text-xs text-muted-foreground">Lab definitions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Terminal className="h-5 w-5 mb-3 text-emerald-500" />
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Active terminals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Network className="h-5 w-5 mb-3 text-orange-500" />
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Active lab networks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <LockKeyhole className="h-5 w-5 mb-3 text-violet-500" />
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">Isolation boundaries planned</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lab Manager</CardTitle>
          <CardDescription>
            The lifecycle contract is now fixed: Create → Provision → Start → Interact → Stop → Reset or Destroy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3">
              <Play className="h-4 w-4 mb-2" />
              <p className="font-medium text-sm">Start</p>
              <p className="text-xs text-muted-foreground mt-1">Provision an isolated runtime and issue access only to its owner.</p>
            </div>
            <div className="rounded-lg border p-3">
              <CircleStop className="h-4 w-4 mb-2" />
              <p className="font-medium text-sm">Stop</p>
              <p className="text-xs text-muted-foreground mt-1">Stop compute without claiming the lab has been reset.</p>
            </div>
            <div className="rounded-lg border p-3">
              <RotateCcw className="h-4 w-4 mb-2" />
              <p className="font-medium text-sm">Reset</p>
              <p className="text-xs text-muted-foreground mt-1">Return machines and networks to the exercise starting state.</p>
            </div>
            <div className="rounded-lg border p-3">
              <HardDrive className="h-4 w-4 mb-2" />
              <p className="font-medium text-sm">Destroy</p>
              <p className="text-xs text-muted-foreground mt-1">Remove disposable runtime resources while retaining allowed audit metadata.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Lab Catalog</h2>
          <p className="text-sm text-muted-foreground">Definitions are visible now; execution is enabled only when its real runtime exists.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {LAB_CATALOG.map((lab) => (
            <Card key={lab.slug}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{lab.name}</CardTitle>
                    <CardDescription className="mt-1">{lab.description}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0 capitalize">{lab.runtime}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{lab.category}</Badge>
                  <Badge variant="outline" className="capitalize">{lab.difficulty}</Badge>
                  <Badge variant="outline">
                    <Cpu className="h-3 w-3 mr-1" />
                    {lab.estimatedCpu} CPU
                  </Badge>
                  <Badge variant="outline">{lab.estimatedMemoryMb} MB RAM</Badge>
                </div>

                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {lab.objectives.map((objective) => (
                    <li key={objective}>• {objective}</li>
                  ))}
                </ul>

                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  {lab.availabilityReason}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled className="gap-2">
                    <Play className="h-4 w-4" />
                    Start Lab
                  </Button>
                  <Button disabled variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <Button disabled variant="outline" className="gap-2">
                    <Terminal className="h-4 w-4" />
                    Terminal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
