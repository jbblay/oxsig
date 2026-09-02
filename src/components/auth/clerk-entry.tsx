'use client';

import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClerkEntry() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold">OxSig</h1>
          <p className="text-muted-foreground">
            Secure files, collaboration, and cyber labs in one workspace.
          </p>
        </div>

        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/home">
              Try now <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/sign-in">Log in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}