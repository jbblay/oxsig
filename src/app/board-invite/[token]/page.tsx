import StoryboardInviteAcceptance from '@/components/storyboards/StoryboardInviteAcceptance';

export default async function StoryboardInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StoryboardInviteAcceptance token={token} />;
}
