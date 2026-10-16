import { redirect } from 'next/navigation';

/** Replace lesson-generating exploration with the mission-based Academy. */
export default function RetiredAcademyExplorePage() {
  redirect('/academy/engineering-world');
}
