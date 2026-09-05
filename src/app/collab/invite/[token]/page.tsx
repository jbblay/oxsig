import CollaborationInviteAcceptance from '@/components/collab/CollaborationInviteAcceptance';

export default async function CollaborationInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CollaborationInviteAcceptance token={token} />;
}
