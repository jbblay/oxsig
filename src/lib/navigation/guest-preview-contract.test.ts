import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAVIGATION } from './product-navigation';

const PREVIEW_GATE_FILES: Partial<Record<(typeof PRODUCT_NAVIGATION)[number]['id'], string>> = {
  collab: 'src/app/collab/page.tsx',
  live: 'src/app/live/layout.tsx',
  boards: 'src/app/collab/storyboards/layout.tsx',
  manage: 'src/app/manage/layout.tsx',
  academy: 'src/app/academy/layout.tsx',
  warroom: 'src/app/warroom/layout.tsx',
  labs: 'src/app/labs/layout.tsx',
  vault: 'src/app/vault/layout.tsx',
  account: 'src/app/account/layout.tsx',
};

describe('guest preview route contract', () => {
  it('gates every guest-preview product surface before protected page code mounts', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.access !== 'guest-preview' || item.status !== 'active') continue;
      const file = PREVIEW_GATE_FILES[item.id];
      expect(file, `${item.label} must declare a guest preview gate`).toBeTruthy();
      const source = readFileSync(join(process.cwd(), file!), 'utf8');
      expect(source, `${item.label} must render GuestProductSurface`).toContain('GuestProductSurface');
      expect(source, `${item.label} must check authentication`).toContain('isAuthenticated');
    }
  });

  it('keeps the guest AI preview isolated from authenticated AI APIs', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/ai/page.tsx'), 'utf8');
    expect(source).toContain('Guest preview // AI Operator');
    expect(source).not.toContain("fetch('/api/ai");
    expect(source).not.toContain('getCsrfToken');
  });
});
