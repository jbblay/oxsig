import type { Metadata } from 'next';
import GuestExploreExperience from '@/components/auth/GuestExploreExperience';

export const metadata: Metadata = {
  title: 'Explore OXSIG — Real technical environments',
  description: 'Explore OXSIG missions, technical environments, AI-assisted operations, team collaboration and evidence workflows before creating an account.',
};

export default function ExplorePage() {
  return <GuestExploreExperience />;
}
