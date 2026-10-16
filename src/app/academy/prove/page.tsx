import { redirect } from 'next/navigation';

/** New capability evidence is verified by missions, not the retired path quiz UI. */
export default function RetiredCapabilityAssessmentPage() {
  redirect('/academy/missions');
}
