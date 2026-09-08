'use client';

import * as React from 'react';
import { Activity, Boxes, ChevronDown, CloudCog, FileCog, MonitorCheck, Route, ShieldCheck } from 'lucide-react';
import AccessPathReadinessReview from '@/components/labs/AccessPathReadinessReview';
import DeploymentEvidenceReview from '@/components/labs/DeploymentEvidenceReview';
import DeploymentPlanner from '@/components/labs/DeploymentPlanner';
import GuestServiceReadinessReview from '@/components/labs/GuestServiceReadinessReview';
import InfrastructureDesigner from '@/components/labs/InfrastructureDesigner';
import LabRuntimePanel from '@/components/labs/LabRuntimePanel';
import LabTopologyDurableStateProvider from '@/components/labs/LabTopologyDurableStateProvider';
import RuntimeReadinessReview from '@/components/labs/RuntimeReadinessReview';
import { Button } from '@/components/ui/button';

const MODE_KEY = 'oxsig:cyber-lab-workspace-mode:v1';
type WorkspaceMode = 'runtime' | 'designer' | 'planner' | 'evidence' | 'readiness' | 'guest-service' | 'access-path';
type Stage = { mode: WorkspaceMode; label: string; longLabel: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY_STAGES: Stage[] = [
  { mode: 'runtime', label: 'My Lab', longLabel: 'Open and use your lab', icon: CloudCog },
  { mode: 'designer', label: 'Build', longLabel: 'Build or change a topology', icon: Boxes },
];

const ADVANCED_STAGES: Stage[] = [
  { mode: 'planner', label: 'Review plan', longLabel: 'Review a deployment plan', icon: FileCog },
  { mode: 'evidence', label: 'Evidence', longLabel: 'Review deployment evidence', icon: ShieldCheck },
  { mode: 'readiness', label: 'Runtime checks', longLabel: 'Inspect runtime readiness', icon: Activity },
  { mode: 'guest-service', label: 'Service checks', longLabel: 'Inspect guest service readiness', icon: MonitorCheck },
  { mode: 'access-path', label: 'Access checks', longLabel: 'Inspect access path readiness', icon: Route },
];

const ALL_MODES = new Set<WorkspaceMode>([...PRIMARY_STAGES, ...ADVANCED_STAGES].map((stage) => stage.mode));

export default function CyberLabWorkspace() {
  const [mode, setMode] = React.useState<WorkspaceMode>('runtime');
  const [designerMounted, setDesignerMounted] = React.useState(false);
  const [plannerMounted, setPlannerMounted] = React.useState(false);
  const [evidenceMounted, setEvidenceMounted] = React.useState(false);
  const [readinessMounted, setReadinessMounted] = React.useState(false);
  const [guestServiceMounted, setGuestServiceMounted] = React.useState(false);
  const [accessPathMounted, setAccessPathMounted] = React.useState(false);

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
        role="tab"
        aria-selected={active}
        aria-controls={`cyber-lab-${stage.mode}`}
        size="sm"
        variant={active ? 'default' : 'ghost'}
        className="h-9 shrink-0"
        onClick={() => selectMode(stage.mode)}
        title={stage.longLabel}
      >
        <Icon className="mr-1.5 h-4 w-4" />{stage.label}
      </Button>
    );
  };

  const advancedActive = ADVANCED_STAGES.some((stage) => stage.mode === mode);

  return (
    <>
      <div className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Lab tools</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Start in My Lab. Use Build only when you want to create or change the environment.</p>
          </div>
          <div className="flex items-center gap-1" role="tablist" aria-label="Cyber Lab main tools">
            {PRIMARY_STAGES.map(renderStage)}
          </div>
        </div>

        <details className="border-t" open={advancedActive || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/30 hover:text-foreground">
            <span>Advanced checks and deployment tools</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="oxsig-scrollbar overflow-x-auto border-t bg-muted/10 p-2" role="tablist" aria-label="Cyber Lab advanced tools">
            <div className="flex min-w-max items-center gap-1">{ADVANCED_STAGES.map(renderStage)}</div>
          </div>
        </details>
      </div>

      <div id="cyber-lab-runtime" role="tabpanel" className={mode === 'runtime' ? 'block' : 'hidden'} aria-hidden={mode !== 'runtime'}>
        <LabTopologyDurableStateProvider>
          <LabRuntimePanel embedded />
        </LabTopologyDurableStateProvider>
      </div>

      {designerMounted && (
        <div id="cyber-lab-designer" role="tabpanel" className={mode === 'designer' ? 'block' : 'hidden'} aria-hidden={mode !== 'designer'}>
          <InfrastructureDesigner />
        </div>
      )}

      {plannerMounted && (
        <div id="cyber-lab-planner" role="tabpanel" className={mode === 'planner' ? 'block' : 'hidden'} aria-hidden={mode !== 'planner'}>
          <DeploymentPlanner />
        </div>
      )}

      {evidenceMounted && (
        <div id="cyber-lab-evidence" role="tabpanel" className={mode === 'evidence' ? 'block' : 'hidden'} aria-hidden={mode !== 'evidence'}>
          <DeploymentEvidenceReview />
        </div>
      )}

      {readinessMounted && (
        <div id="cyber-lab-readiness" role="tabpanel" className={mode === 'readiness' ? 'block' : 'hidden'} aria-hidden={mode !== 'readiness'}>
          <RuntimeReadinessReview />
        </div>
      )}

      {guestServiceMounted && (
        <div id="cyber-lab-guest-service" role="tabpanel" className={mode === 'guest-service' ? 'block' : 'hidden'} aria-hidden={mode !== 'guest-service'}>
          <GuestServiceReadinessReview />
        </div>
      )}

      {accessPathMounted && (
        <div id="cyber-lab-access-path" role="tabpanel" className={mode === 'access-path' ? 'block' : 'hidden'} aria-hidden={mode !== 'access-path'}>
          <AccessPathReadinessReview />
        </div>
      )}
    </>
  );
}
