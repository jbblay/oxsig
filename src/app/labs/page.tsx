import LabAccessReadinessBanner from '@/components/labs/LabAccessReadinessBanner';
import CyberLabWorkspace from '@/components/labs/CyberLabWorkspace';
import { OperationRunProvider } from '@/components/operations/OperationRunProvider';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';

type SearchParams = Promise<{ operation?: string; mode?: string; run?: string; capability?: string }>;

export default async function CyberLabPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const workspace = (
    <CyberLabWorkspace
      operationSlug={params.operation}
      operationMode={params.mode}
      operationRunId={params.run}
      learningCapabilityId={params.capability}
    />
  );

  if (params.run) {
    return (
      <OperationRunProvider runId={params.run}>
        <OperationRunStrip runId={params.run} />
        {workspace}
      </OperationRunProvider>
    );
  }

  return (
    <>
      <OperationRunRecovery compact />
      <LabAccessReadinessBanner />
      {workspace}
    </>
  );
}
