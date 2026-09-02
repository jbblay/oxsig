import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { isClerkConfigured } from '@/lib/auth/clerk-config';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    redirect('/');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/home" />
    </main>
  );
}
