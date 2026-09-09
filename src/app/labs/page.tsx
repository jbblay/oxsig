import CyberLabWorkspace from '@/components/labs/CyberLabWorkspace';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';

type SearchParams = Promise<{ operation?: string; mode?: string; run?: string }>;

export default async function CyberLabPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <>
      {params.run ? <OperationRunStrip runId={params.run} /> : <OperationRunRecovery compact />}
      <CyberLabWorkspace operationSlug={params.operation} operationMode={params.mode} operationRunId={params.run} />
    </>
  );
}
