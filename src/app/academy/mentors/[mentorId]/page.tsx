import MentorProfileView from '@/components/mentorship/MentorProfileView';

export default async function AcademyMentorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ mentorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { mentorId } = await params;
  const query = await searchParams;
  const topic = typeof query.topic === 'string' ? query.topic.slice(0, 160) : undefined;
  return <MentorProfileView mentorId={mentorId} helpTopic={topic} shareLesson={query.share === 'lesson'} />;
}
