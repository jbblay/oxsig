import { redirect } from 'next/navigation';

/** Previously enrolled paths retain database evidence but no longer drive Academy navigation. */
export default function RetiredLearningPathsPage() {
  redirect('/academy/engineering-world');
}
