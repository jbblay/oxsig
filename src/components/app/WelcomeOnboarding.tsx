'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  EXPERIENCE_LEVELS,
  FOCUS_AREAS,
  recommendedStart,
  type ExperienceLevel,
  type FocusArea,
} from '@/lib/account/profile-contract';
import { useAuth } from '@/lib/auth/use-auth';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { cn } from '@/lib/utils';

/**
 * One screen, every field optional, prefilled from the sign-up identity.
 * Closing it in any way marks onboarding done so it never comes back.
 */
export default function WelcomeOnboarding() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [open, setOpen] = React.useState(true);
  const [name, setName] = React.useState(user?.displayName || '');
  const [level, setLevel] = React.useState<ExperienceLevel | null>(null);
  const [focus, setFocus] = React.useState<FocusArea[]>([]);
  const [saving, setSaving] = React.useState(false);
  const finished = React.useRef(false);

  React.useEffect(() => {
    if (!name && user?.displayName) setName(user.displayName);
  }, [name, user?.displayName]);

  async function finish(withAnswers: boolean) {
    if (finished.current) return;
    finished.current = true;
    setSaving(true);
    const body: Record<string, unknown> = { onboarded: true };
    if (withAnswers) {
      if (name.trim().length >= 2 && name.trim() !== user?.displayName) body.displayName = name.trim();
      if (level) body.experienceLevel = level;
      if (focus.length) body.focusAreas = focus;
    }
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save');
      setOpen(false);
      await refresh();
      if (withAnswers) {
        const start = recommendedStart(level);
        toast.success(`Welcome aboard. ${start.label}.`);
        router.push(start.href);
      }
    } catch (error) {
      finished.current = false;
      // Never trap the user: close anyway, and they can complete their profile later.
      setOpen(false);
      if (withAnswers) toast.error(error instanceof Error ? error.message : 'Could not save your answers. You can edit them in Account.');
    } finally {
      setSaving(false);
    }
  }

  const start = recommendedStart(level);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void finish(false); }}>
      <DialogContent className="w-[calc(100%_-_1.5rem)] max-w-xl gap-0 overflow-hidden rounded-2xl p-0">
        <div className="relative border-b bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 py-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25"><Sparkles className="h-5 w-5" /></span>
          <DialogTitle className="mt-4 text-xl font-semibold tracking-tight">Welcome to OXSIG</DialogTitle>
          <DialogDescription className="mt-1 text-sm">Three quick taps so we can drop you in the right place. Everything is optional.</DialogDescription>
        </div>

        <form
          className="space-y-5 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void finish(true);
          }}
        >
          <div>
            <label htmlFor="welcome-name" className="mb-1.5 block text-xs font-medium">What should teammates call you?</label>
            <Input id="welcome-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 100))} autoComplete="name" />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium">Your experience</legend>
            <div className="grid grid-cols-2 gap-2">
              {EXPERIENCE_LEVELS.map((option) => {
                const active = level === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLevel(active ? null : option.id)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition',
                      active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <span className="flex items-center justify-between text-sm font-medium">{option.label}{active ? <Check className="h-4 w-4 text-primary" /> : null}</span>
                    <span className="text-[11px] text-muted-foreground">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium">What do you want to get sharper at?</legend>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_AREAS.map((area) => {
                const active = focus.includes(area.id);
                return (
                  <button
                    key={area.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocus((current) => active ? current.filter((id) => id !== area.id) : [...current, area.id])}
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary/40'
                    )}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                    {area.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => void finish(false)}>Skip for now</Button>
            <Button type="submit" className="sm:ml-auto" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {start.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
