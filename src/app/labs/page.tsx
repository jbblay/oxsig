import LabAccessReadinessBanner from '@/components/labs/LabAccessReadinessBanner';
import CyberLabWorkspace from '@/components/labs/CyberLabWorkspace';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';

type SearchParams = Promise<{ operation?: string; mode?: string; run?: string; capability?: string }>;

export default async function CyberLabPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <>
      {params.run ? <OperationRunStrip runId={params.run} /> : <OperationRunRecovery compact />}
      {!params.run && <LabAccessReadinessBanner />}
      <CyberLabWorkspace
        operationSlug={params.operation}
        operationMode={params.mode}
        operationRunId={params.run}
        learningCapabilityId={params.capability}
      />
    </>
  );
}
