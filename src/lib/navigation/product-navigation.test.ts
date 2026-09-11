import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_NAVIGATION,
  isGuestPublicNavigationPath,
  isProtectedProductNavigationPath,
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

  it('allows guests to browse only public product destinations', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.status !== 'active') continue;

      expect(resolveProductNavigationHref(item, true), `${item.label} signed in`).toBe(item.href);

      const guestTarget = resolveProductNavigationHref(item, false);
      if (item.access === 'public') {
        expect(guestTarget, `${item.label} guest`).toBe(item.href);
      } else {
        expect(guestTarget, `${item.label} guest`).toBeNull();
      }
    }
  });

  it('never navigates a disabled product item', () => {
    const disabled: ProductNavigationItem = {
      id: 'academy',
      href: '/academy',
      label: 'Academy',
      access: 'authenticated',
      status: 'disabled',
    };

    expect(resolveProductNavigationHref(disabled, true)).toBeNull();
    expect(resolveProductNavigationHref(disabled, false)).toBeNull();
  });

  it('keeps mission browsing public while blocking persisted protected links after sign-out', () => {
    expect(resolveProductPathHref('/operations?operation=black-domain', false)).toBe('/operations?operation=black-domain');
    expect(resolveProductPathHref('/operations?operation=ghost-shell#briefing', false)).toBe('/operations?operation=ghost-shell#briefing');
    expect(resolveProductPathHref('/home', false)).toBe('/home');
    expect(resolveProductPathHref('/labs?tab=runtime', false)).toBeNull();
    expect(resolveProductPathHref('/collab/storyboards/board-123', false)).toBeNull();
    expect(resolveProductPathHref('/labs?tab=runtime', true)).toBe('/labs?tab=runtime');
  });

  it('routes legacy explore links to the guest dashboard', () => {
    expect(resolveProductPathHref('/explore', false)).toBe('/home');
    expect(resolveProductPathHref('/explore#ai', false)).toBe('/home');
    expect(resolveProductPathHref('/explore?operation=black-domain#live-environments', true)).toBe('/home');
  });

  it('rejects unknown guest routes instead of inventing a preview destination', () => {
    expect(resolveProductPathHref('/unknown-surface', false)).toBeNull();
    expect(resolveProductPathHref('/unknown-surface', true)).toBe('/unknown-surface');
  });

  it('defines public and protected request paths from the same contract', () => {
    expect(isGuestPublicNavigationPath('/home')).toBe(true);
    expect(isGuestPublicNavigationPath('/operations')).toBe(true);
    expect(isGuestPublicNavigationPath('/operations/anything')).toBe(true);
    expect(isGuestPublicNavigationPath('/academy')).toBe(false);
    expect(isGuestPublicNavigationPath('/warroom')).toBe(false);
    expect(isGuestPublicNavigationPath('/labs')).toBe(false);

    expect(isProtectedProductNavigationPath('/academy')).toBe(true);
    expect(isProtectedProductNavigationPath('/academy/paths')).toBe(true);
    expect(isProtectedProductNavigationPath('/collab/storyboards/board-123')).toBe(true);
    expect(isProtectedProductNavigationPath('/labs')).toBe(true);
    expect(isProtectedProductNavigationPath('/operations')).toBe(false);
    expect(isProtectedProductNavigationPath('/home')).toBe(false);
    expect(isProtectedProductNavigationPath('/not-a-product-route')).toBe(false);
  });
});
