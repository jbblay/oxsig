'use client';

import * as React from 'react';
import { Activity, Boxes, CloudCog, FileCog, MonitorCheck, Route, ShieldCheck } from 'lucide-react';
import AccessPathReadinessReview from '@/components/labs/AccessPathReadinessReview';
import DeploymentEvidenceReview from '@/components/labs/DeploymentEvidenceReview';
import DeploymentPlanner from '@/components/labs/DeploymentPlanner';
import GuestServiceReadinessReview from '@/components/labs/GuestServiceReadinessReview';
import InfrastructureDesigner from '@/components/labs/InfrastructureDesigner';
import LabRuntimePanel from '@/components/labs/LabRuntimePanel';
import LabTopologyPersistenceBridge from '@/components/labs/LabTopologyPersistenceBridge';
import RuntimeReadinessReview from '@/components/labs/RuntimeReadinessReview';
import { Button } from '@/components/ui/button';

const MODE_KEY = 'oxsig:cyber-lab-workspace-mode:v1';
type WorkspaceMode = 'runtime' | 'designer' | 'planner' | 'evidence' | 'readiness' | 'guest-service' | 'access-path';

const STAGES: Array<{ mode: WorkspaceMode; label: string; longLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { mode: 'designer', label: 'Design', longLabel: 'Infrastructure Designer', icon: Boxes },
  { mode: 'planner', label: 'Plan', longLabel: 'Deployment Plan', icon: FileCog },
  { mode: 'runtime', label: 'Runtime', longLabel: 'Runtime Lab', icon: CloudCog },
  { mode: 'evidence', label: 'Evidence', longLabel: 'Evidence Review', icon: ShieldCheck },
  { mode: 'readiness', label: 'Readiness', longLabel: 'Runtime Readiness', icon: Activity },
  { mode: 'guest-service', label: 'Guest service', longLabel: 'Guest Service', icon: MonitorCheck },
  { mode: 'access-path', label: 'Access path', longLabel: 'Access Path', icon: Route },
];

export default function CyberLabWorkspace() {
  const [mode, setMode] = React.useState<WorkspaceMode>('runtime');
  const [designerMounted, setDesignerMounted] = React.useState(false);
  const [plannerMounted, setPlannerMounted] = React.useState(false);
  const [evidenceMounted, setEvidenceMounted] = React.useState(false);
  const [readinessMounted, setReadinessMounted] = React.useState(false);
  const [guestServiceMounted, setGuestServiceMounted] = React.useState(false);
  const [accessPathMounted, setAccessPathMounted] = React.useState(false);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'designer') {
      setDesignerMounted(true);
      setMode('designer');
    }
    if (saved === 'planner') {
      setPlannerMounted(true);
      setMode('planner');
    }
    if (saved === 'evidence') {
      setEvidenceMounted(true);
      setMode('evidence');
    }
    if (saved === 'readiness') {
      setReadinessMounted(true);
      setMode('readiness');
    }
    if (saved === 'guest-service') {
      setGuestServiceMounted(true);
      setMode('guest-service');
    }
    if (saved === 'access-path') {
      setAccessPathMounted(true);
      setMode('access-path');
    }
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

  return (
    <>
      <div className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="oxsig-scrollbar overflow-x-auto p-2" role="tablist" aria-label="Cyber Lab workflow stages">
          <div className="flex min-w-max items-center gap-1">
            {STAGES.map((stage, index) => {
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
                  <span className={`mr-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${active ? 'bg-primary-foreground/15' : 'bg-muted'}`}>{index + 1}</span>
                  <Icon className="mr-1.5 h-4 w-4" />{stage.label}
                </Button>
              );
            })}
          </div>
        </div>
        <p className="border-t px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          Follow the workflow from design to access validation, or jump directly to the stage you need. Each stage preserves its own authorization and evidence boundary.
        </p>
      </div>

      <div id="cyber-lab-runtime" role="tabpanel" className={mode === 'runtime' ? 'block' : 'hidden'} aria-hidden={mode !== 'runtime'}>
        <LabTopologyPersistenceBridge>
          <LabRuntimePanel />
        </LabTopologyPersistenceBridge>
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