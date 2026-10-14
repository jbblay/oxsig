import Link from 'next/link';
import { UserProfile } from '@clerk/nextjs';
import { ArrowLeft } from 'lucide-react';

export default function AccountSecurityPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Account
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <h1 className="text-sm font-semibold">Sign-in &amp; security</h1>
      </div>
      <div className="flex justify-center">
        <UserProfile path="/account/security" routing="path" />
      </div>
    </div>
  );
}
