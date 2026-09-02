import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { isClerkConfigured } from '@/lib/auth/clerk-config';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  if (!isClerkConfigured()) {
    redirect('/');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/home" />
    </main>
  );
}
