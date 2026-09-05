'use client';

import * as React from 'react';
import { Boxes, CloudCog, FileCog } from 'lucide-react';
import DeploymentPlanner from '@/components/labs/DeploymentPlanner';
import InfrastructureDesigner from '@/components/labs/InfrastructureDesigner';
import LabRuntimePanel from '@/components/labs/LabRuntimePanel';
import LabTopologyPersistenceBridge from '@/components/labs/LabTopologyPersistenceBridge';
import { Button } from '@/components/ui/button';

const MODE_KEY = 'oxsig:cyber-lab-workspace-mode:v1';
type WorkspaceMode = 'runtime' | 'designer' | 'planner';

export default function CyberLabWorkspace() {
  const [mode, setMode] = React.useState<WorkspaceMode>('runtime');
  const [designerMounted, setDesignerMounted] = React.useState(false);
  const [plannerMounted, setPlannerMounted] = React.useState(false);

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
  }, []);

  const selectMode = (next: WorkspaceMode) => {
    if (next === 'designer') setDesignerMounted(true);
    if (next === 'planner') setPlannerMounted(true);
    setMode(next);
    window.localStorage.setItem(MODE_KEY, next);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm">
        <Button size="sm" variant={mode === 'runtime' ? 'default' : 'ghost'} onClick={() => selectMode('runtime')}>
          <CloudCog className="mr-1.5 h-4 w-4" />Runtime Lab
        </Button>
        <Button size="sm" variant={mode === 'designer' ? 'default' : 'ghost'} onClick={() => selectMode('designer')}>
          <Boxes className="mr-1.5 h-4 w-4" />Infrastructure Designer
        </Button>
        <Button size="sm" variant={mode === 'planner' ? 'default' : 'ghost'} onClick={() => selectMode('planner')}>
          <FileCog className="mr-1.5 h-4 w-4" />Deployment Plan
        </Button>
        <p className="ml-auto px-2 text-[11px] text-muted-foreground">Design → plan → authorize → runtime. Each boundary remains explicit.</p>
      </div>

      <div className={mode === 'runtime' ? 'block' : 'hidden'} aria-hidden={mode !== 'runtime'}>
        <LabTopologyPersistenceBridge>
          <LabRuntimePanel />
        </LabTopologyPersistenceBridge>
      </div>

      {designerMounted && (
        <div className={mode === 'designer' ? 'block' : 'hidden'} aria-hidden={mode !== 'designer'}>
          <InfrastructureDesigner />
        </div>
      )}

      {plannerMounted && (
        <div className={mode === 'planner' ? 'block' : 'hidden'} aria-hidden={mode !== 'planner'}>
          <DeploymentPlanner />
        </div>
      )}
    </>
  );
}
