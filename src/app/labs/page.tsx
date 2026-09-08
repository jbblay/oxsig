import CyberLabWorkspace from '@/components/labs/CyberLabWorkspace';

type SearchParams = Promise<{ operation?: string; mode?: string }>;

export default async function CyberLabPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <CyberLabWorkspace operationSlug={params.operation} operationMode={params.mode} />;
}
