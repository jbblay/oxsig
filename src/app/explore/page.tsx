import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'OXSIG Guest Dashboard',
  description: 'Browse the OXSIG dashboard and mission catalogue without an account.',
};

export default function ExplorePage() {
  redirect('/home');
}
