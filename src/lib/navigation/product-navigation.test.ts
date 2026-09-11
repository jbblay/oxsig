import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_NAVIGATION,
  isGuestPublicNavigationPath,
  resolveProductNavigationHref,
  resolveProductPathHref,
  type ProductNavigationItem,
} from './product-navigation';

function routeFileFor(href: string) {
  const pathname = new URL(href, 'https://oxsig.local').pathname;
  const segments = pathname.split('/').filter(Boolean);
  return join(process.cwd(), 'src', 'app', ...segments, 'page.tsx');
}

describe('product navigation contract', () => {
  it('keeps every active authenticated destination backed by a real page', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.status !== 'active') continue;
      expect(existsSync(routeFileFor(item.href)), `${item.label} -> ${item.href}`).toBe(true);
    }
  });

  it('gives every active destination deterministic signed-in and signed-out behavior', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.status !== 'active') continue;

      expect(resolveProductNavigationHref(item, true), `${item.label} signed in`).toBe(item.href);

      const guestTarget = resolveProductNavigationHref(item, false);
      if (item.access === 'public') {
        expect(guestTarget, `${item.label} guest`).toBe(item.href);
      } else {
        expect(guestTarget, `${item.label} guest target`).toBeTruthy();
        expect(guestTarget, `${item.label} must not expose protected route`).not.toBe(item.href);
      }
    }
  });

  it('keeps guest preview anchors real instead of silently linking to nowhere', () => {
    const guestExperience = readFileSync(
      join(process.cwd(), 'src', 'components', 'auth', 'GuestExploreExperience.tsx'),
      'utf8',
    );

    for (const item of PRODUCT_NAVIGATION) {
      const guestHref = item.guestHref;
      if (!guestHref?.startsWith('/explore#')) continue;
      const anchor = guestHref.slice('/explore#'.length);
      expect(guestExperience, `${item.label} preview anchor #${anchor}`).toContain(`id="${anchor}"`);
    }
  });

  it('never navigates a disabled product item', () => {
    const disabled: ProductNavigationItem = {
      id: 'academy',
      href: '/academy',
      label: 'Academy',
      access: 'authenticated',
      status: 'disabled',
      guestHref: '/explore#learn',
    };

    expect(resolveProductNavigationHref(disabled, true)).toBeNull();
    expect(resolveProductNavigationHref(disabled, false)).toBeNull();
  });

  it('routes persisted protected links through guest-safe destinations after sign-out', () => {
    expect(resolveProductPathHref('/labs?tab=runtime', false)).toBe('/explore#live-environments');
    expect(resolveProductPathHref('/collab/storyboards/board-123', false)).toBe('/explore#platform');
    expect(resolveProductPathHref('/operations?operation=black-domain', false)).toBe('/operations?operation=black-domain');
    expect(resolveProductPathHref('/labs?tab=runtime', true)).toBe('/labs?tab=runtime');
  });

  it('defines guest-public workspace paths from the same contract', () => {
    expect(isGuestPublicNavigationPath('/home')).toBe(true);
    expect(isGuestPublicNavigationPath('/operations')).toBe(true);
    expect(isGuestPublicNavigationPath('/academy')).toBe(false);
    expect(isGuestPublicNavigationPath('/warroom')).toBe(false);
  });
});
