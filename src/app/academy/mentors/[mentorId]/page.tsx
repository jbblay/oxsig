import MentorProfileView from '@/components/mentorship/MentorProfileView';

export default async function AcademyMentorProfilePage({ params }: { params: Promise<{ mentorId: string }> }) {
  const { mentorId } = await params;
  return <MentorProfileView mentorId={mentorId} />;
}
