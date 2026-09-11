import { SignIn } from '@clerk/nextjs';
import { authPathWithReturnTo, safeAuthReturnTo } from '@/lib/auth-return';

type SearchParams = Promise<{ redirect_url?: string | string[] }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = safeAuthReturnTo(params.redirect_url);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <SignIn
        signUpUrl={authPathWithReturnTo('/sign-up', returnTo)}
        fallbackRedirectUrl={returnTo}
      />
    </main>
  );
}
