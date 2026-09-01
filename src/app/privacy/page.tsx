import { redirect } from 'next/navigation';

export default function LegacyPrivacyPage() {
  redirect('/account');
}
