import { redirect } from 'next/navigation';

export default function LegacyIdentityPage() {
  redirect('/account');
}
