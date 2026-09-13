'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, Boxes, ChevronDown, CloudCog, FileCog, MonitorCheck, Route, ShieldCheck } from 'lucide-react';
import AccessPathReadinessReview from '@/components/labs/AccessPathReadinessReview';
import DeploymentEvidenceReview from '@/components/labs/DeploymentEvidenceReview';
import DeploymentPlanner from '@/components/labs/DeploymentPlanner';
import GuestServiceReadinessReview from '@/components/labs/GuestServiceReadinessReview';
import InfrastructureDesigner from '@/components/labs/InfrastructureDesigner';
import LabEvidenceTimeline from '@/components/labs/LabEvidenceTimeline';
import LabRuntimePanel from '@/components/labs/LabRuntimePanel';
import LabTopologyDurableStateProvider from '@/components/labs/LabTopologyDurableStateProvider';
import RuntimeReadinessReview from '@/components/labs/RuntimeReadinessReview';
import OperationAiInstructor from '@/components/operations/OperationAiInstructor';
import { OperationLabRuntimePanel } from '@/components/operations/OperationLabRuntimePanel';
import OperationTopologyBuild from '@/components/operations/OperationTopologyBuild';
import { OperationIcon } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getOperationLearningFocus } from '@/lib/learning/operation-focus';
import type { OperationAiRuntimeContext } from '@/lib/operations/ai-context';
import { getOperation } from '@/lib/operations/catalog';

const MODE_KEY = 'oxsig:cyber-lab-workspace-mode:v1';
type WorkspaceMode = 'runtime' | 'designer' | 'planner' | 'evidence' | 'readiness' | 'guest-service' | 'access-path';
type Stage = { mode: WorkspaceMode; label: string; longLabel: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY_STAGES: Stage[] = [
  { mode: 'runtime', label: 'My Lab', longLabel: 'Open and use your lab', icon: CloudCog },
  { mode: 'designer', label: 'Build', longLabel: 'Build or change a topology', icon: Boxes },
  { mode: 'evidence', label: 'Evidence', longLabel: 'Review deployment evidence', icon: ShieldCheck },
];

const ADVANCED_STAGES: Stage[] = [
  { mode: 'planner', label: 'Review plan', longLabel: 'Review a deployment plan', icon: FileCog },
  { mode: 'readiness', label: 'Runtime checks', longLabel: 'Inspect runtime readiness', icon: Activity },
  { mode: 'guest-service', label: 'Service checks', longLabel: 'Inspect guest service readiness', icon: MonitorCheck },
  { mode: 'access-path', label: 'Access checks', longLabel: 'Inspect access path readiness', icon: Route },
];

const ALL_MODES = new Set<WorkspaceMode>([...PRIMARY_STAGES, ...ADVANCED_STAGES].map((stage) => stage.mode));

export default function CyberLabWorkspace({
  operationSlug,
  operationMode,
  operationRunId,
  learningCapabilityId,
}: {
  operationSlug?: string;
  operationMode?: string;
  operationRunId?: string;
  learningCapabilityId?: string;
}) {
  const [mode, setMode] = React.useState<WorkspaceMode>('runtime');
  const [designerMounted, setDesignerMounted] = React.useState(false);
  const [plannerMounted, setPlannerMounted] = React.useState(false);
  const [evidenceMounted, setEvidenceMounted] = React.useState(false);
  const [readinessMounted, setReadinessMounted] = React.useState(false);
  const [guestServiceMounted, setGuestServiceMounted] = React.useState(false);
  const [accessPathMounted, setAccessPathMounted] = React.useState(false);
  const [operationAiContext, setOperationAiContext] = React.useState<OperationAiRuntimeContext | null>(null);
  const operation = operationSlug ? getOperation(operationSlug) : null;
  const learningFocus = getOperationLearningFocus(operationSlug, learningCapabilityId);
  const focusedObjectives = learningFocus?.objectives || operation?.objectives || [];
  const activeBlackDomain = Boolean(operationRunId && operationSlug === 'black-domain');

  React.useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY) as WorkspaceMode | null;
    if (!saved || !ALL_MODES.has(saved)) return;
    if (saved === 'designer') setDesignerMounted(true);
    if (saved === 'planner') setPlannerMounted(true);
    if (saved === 'evidence') setEvidenceMounted(true);
    if (saved === 'readiness') setReadinessMounted(true);
    if (saved === 'guest-service') setGuestServiceMounted(true);
    if (saved === 'access-path') setAccessPathMounted(true);
    setMode(saved);
  }, []);

  React.useEffect(() => {
    setOperationAiContext(null);
  }, [operationRunId, operationSlug, learningCapabilityId]);

  const selectMode = (next: WorkspaceMode) => {
    if (next === 'designer') setDesignerMounted(true);
    if (next === 'planner') setPlannerMounted(true);
    if (next === 'evidence') setEvidenceMounted(true);
    if (next === 'readiness') setReadinessMounted(true);
    if (next === 'guest-service') setGuestServiceMounted(true);
    if (next === 'access-path') setAccessPathMounted(true);
    setMode(next);
    window.localStorage.setItem(MODE_KEY, next);
  };

  const renderStage = (stage: Stage) => {
    const Icon = stage.icon;
    const active = mode === stage.mode;
    return (
      <Button
        key={stage.mode}
        id={`cyber-lab-tab-${stage.mode}`}
        role="tab"
        aria-selected={active}
        aria-controls={`cyber-lab-${stage.mode}`}
        size="sm"
        variant={active ? 'default' : 'ghost'}
        className="h-11 shrink-0 sm:h-9"
        onClick={() => selectMode(stage.mode)}
        onKeyDown={(event) => {
          const stages = PRIMARY_STAGES.some((item) => item.mode === stage.mode) ? PRIMARY_STAGES : ADVANCED_STAGES;
          const index = stages.findIndex((item) => item.mode === stage.mode);
          const nextIndex = event.key === 'ArrowRight' ? (index + 1) % stages.length
            : event.key === 'ArrowLeft' ? (index + stages.length - 1) % stages.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? stages.length - 1 : -1;
          if (nextIndex < 0) return;
          event.preventDefault();
          selectMode(stages[nextIndex].mode);
          document.getElementById(`cyber-lab-tab-${stages[nextIndex].mode}`)?.focus();
        }}
        title={stage.longLabel}
      >
        <Icon className="mr-1.5 h-4 w-4" />{stage.label}
      </Button>
    );
  };

  const advancedActive = ADVANCED_STAGES.some((stage) => stage.mode === mode);

  return (
    <>
      {operation && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.035] px-3 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><OperationIcon icon={operation.icon} className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xs font-semibold">{operation.codename}</p>
              {operationMode && <Badge variant="outline" className="h-5 text-[9px] capitalize">{operationMode}</Badge>}
              {learningFocus && <Badge variant="secondary" className="h-5 text-[9px]">{learningFocus.capabilityTitle}</Badge>}
            </div>
            <p className="truncate text-[10px] text-muted-foreground">{learningFocus ? `${learningFocus.pathTitle} · ${learningFocus.practiceLabel}` : operation.topology.join(' → ')}</p>
          </div>
          <div className="hidden max-w-sm flex-wrap gap-1.5 lg:flex">
            {focusedObjectives.slice(0, 3).map((objective, index) => (
              <Badge key={objective} variant="secondary" className="h-5 text-[9px]">{index + 1}. {objective}</Badge>
            ))}
          </div>
          <Button asChild size="sm" variant="outline" className="h-8"><Link href="/operations">Change</Link></Button>
        </div>
      )}

      <div className="mb-3 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="oxsig-scrollbar overflow-x-auto p-2" role="tablist" aria-label="Cyber Lab main tools">
          <div className="flex min-w-max items-center gap-1">{PRIMARY_STAGES.map(renderStage)}</div>
        </div>

        <details className="border-t" open={advancedActive || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between min-h-11 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted/30 hover:text-foreground">
            <span>Deployment &amp; checks</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="oxsig-scrollbar overflow-x-auto border-t bg-muted/10 p-2" role="tablist" aria-label="Cyber Lab advanced tools">
            <div className="flex min-w-max items-center gap-1">{ADVANCED_STAGES.map(renderStage)}</div>
          </div>
        </details>
      </div>

      {operation && operationSlug && (
        <div className="mb-3 flex justify-end">
          <OperationAiInstructor
            runId={operationAiContext?.runId || operationRunId || null}
            operationSlug={operationSlug}
            operationLabel={learningFocus ? `${operation.codename} · ${learningFocus.capabilityTitle}` : operation.codename}
            operationMode={operationAiContext?.operationMode || operationMode || null}
            objectives={focusedObjectives}
            nodes={operationAiContext?.nodes || []}
            selectedNode={operationAiContext?.selectedNode || null}
          />
        </div>
      )}

      <div id="cyber-lab-runtime" role="tabpanel" aria-labelledby="cyber-lab-tab-runtime" className={mode === 'runtime' ? 'block' : 'hidden'} aria-hidden={mode !== 'runtime'}>
        {activeBlackDomain && operationRunId ? (
          <OperationLabRuntimePanel runId={operationRunId} onAiContextChange={setOperationAiContext} />
        ) : (
          <LabTopologyDurableStateProvider>
            <LabRuntimePanel embedded />
          </LabTopologyDurableStateProvider>
        )}
      </div>

      {designerMounted && (
        <div id="cyber-lab-designer" role="tabpanel" aria-labelledby="cyber-lab-tab-designer" className={mode === 'designer' ? 'block' : 'hidden'} aria-hidden={mode !== 'designer'}>
          {activeBlackDomain && operationRunId ? <OperationTopologyBuild runId={operationRunId} /> : <InfrastructureDesigner />}
        </div>
      )}

      {plannerMounted && (
        <div id="cyber-lab-planner" role="tabpanel" aria-labelledby="cyber-lab-tab-planner" className={mode === 'planner' ? 'block' : 'hidden'} aria-hidden={mode !== 'planner'}>
          <DeploymentPlanner />
        </div>
      )}

      {evidenceMounted && (
        <div id="cyber-lab-evidence" role="tabpanel" aria-labelledby="cyber-lab-tab-evidence" className={mode === 'evidence' ? 'block' : 'hidden'} aria-hidden={mode !== 'evidence'}>
          <DeploymentEvidenceReview />
          <LabEvidenceTimeline />
        </div>
      )}

      {readinessMounted && (
        <div id="cyber-lab-readiness" role="tabpanel" aria-labelledby="cyber-lab-tab-readiness" className={mode === 'readiness' ? 'block' : 'hidden'} aria-hidden={mode !== 'readiness'}>
          <RuntimeReadinessReview />
        </div>
      )}

      {guestServiceMounted && (
        <div id="cyber-lab-guest-service" role="tabpanel" aria-labelledby="cyber-lab-tab-guest-service" className={mode === 'guest-service' ? 'block' : 'hidden'} aria-hidden={mode !== 'guest-service'}>
          <GuestServiceReadinessReview />
        </div>
      )}

      {accessPathMounted && (
        <div id="cyber-lab-access-path" role="tabpanel" aria-labelledby="cyber-lab-tab-access-path" className={mode === 'access-path' ? 'block' : 'hidden'} aria-hidden={mode !== 'access-path'}>
          <AccessPathReadinessReview />
        </div>
      )}
    </>
  );
}