import { SignUp } from '@clerk/nextjs';
import { authPathWithReturnTo, safeAuthReturnTo } from '@/lib/auth-return';

type SearchParams = Promise<{ redirect_url?: string | string[] }>;

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = safeAuthReturnTo(params.redirect_url);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <SignUp
        signInUrl={authPathWithReturnTo('/sign-in', returnTo)}
        fallbackRedirectUrl={returnTo}
      />
    </main>
  );
}
