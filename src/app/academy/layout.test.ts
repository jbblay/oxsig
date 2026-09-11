import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');

describe('Academy route wiring', () => {
  it('preloads authenticated durable state and provides it to Academy pages', () => {
    expect(source).toContain("import AcademyDurableStateProvider from '@/components/academy/AcademyDurableStateProvider'");
    expect(source).toContain("import { getAcademyState } from '@/lib/academy/persistence'");
    expect(source).toContain("import { getClerkAuthenticatedUser } from '@/lib/auth/clerk-user'");
    expect(source).toContain('initialState = await getAcademyState(user.id)');
    expect(source).toContain('<AcademyDurableStateProvider initialState={initialState}>');
    expect(source).toContain('</AcademyDurableStateProvider>');
  });
});
