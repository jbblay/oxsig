import MentorDirectory from '@/components/mentorship/MentorDirectory';
import { getMentorSpecialization } from '@/lib/mentorship/specializations';

export default async function AcademyMentorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const topic = typeof query.topic === 'string' ? query.topic.slice(0, 160) : '';
  const specialization = typeof query.specialization === 'string' && getMentorSpecialization(query.specialization) ? query.specialization : '';
  return <MentorDirectory helpTopic={topic} shareLesson={query.share === 'lesson'} initialSpecialization={specialization} />;
}
