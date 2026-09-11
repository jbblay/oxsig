import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_NAVIGATION,
  isGuestBrowseableNavigationPath,
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
  it('keeps every active destination backed by a real page', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.status !== 'active') continue;
      expect(existsSync(routeFileFor(item.href)), `${item.label} -> ${item.href}`).toBe(true);
    }
  });

  it('lets guests navigate public and preview surfaces while keeping auth-only surfaces closed', () => {
    for (const item of PRODUCT_NAVIGATION) {
      if (item.status !== 'active') continue;

      expect(resolveProductNavigationHref(item, true), `${item.label} signed in`).toBe(item.href);

      const guestTarget = resolveProductNavigationHref(item, false);
      if (item.access === 'authenticated') {
        expect(guestTarget, `${item.label} guest`).toBeNull();
      } else {
        expect(guestTarget, `${item.label} guest`).toBe(item.href);
      }
    }
  });

  it('never navigates a disabled product item', () => {
    const disabled: ProductNavigationItem = {
      id: 'academy',
      href: '/academy',
      label: 'Academy',
      access: 'guest-preview',
      status: 'disabled',
    };

    expect(resolveProductNavigationHref(disabled, true)).toBeNull();
    expect(resolveProductNavigationHref(disabled, false)).toBeNull();
  });

  it('keeps public URLs intact and normalizes protected recents to stable guest preview roots', () => {
    expect(resolveProductPathHref('/operations?operation=black-domain', false)).toBe('/operations?operation=black-domain');
    expect(resolveProductPathHref('/operations?operation=ghost-shell#briefing', false)).toBe('/operations?operation=ghost-shell#briefing');
    expect(resolveProductPathHref('/home', false)).toBe('/home');
    expect(resolveProductPathHref('/labs?tab=runtime', false)).toBe('/labs');
    expect(resolveProductPathHref('/collab/storyboards/board-123', false)).toBe('/collab/storyboards');
    expect(resolveProductPathHref('/academy/paths', false)).toBe('/academy');
    expect(resolveProductPathHref('/labs?tab=runtime', true)).toBe('/labs?tab=runtime');
  });

  it('routes legacy explore links to the guest dashboard', () => {
    expect(resolveProductPathHref('/explore', false)).toBe('/home');
    expect(resolveProductPathHref('/explore#ai', false)).toBe('/home');
    expect(resolveProductPathHref('/explore?operation=black-domain#live-environments', true)).toBe('/home');
  });

  it('rejects unknown guest routes instead of inventing a destination', () => {
    expect(resolveProductPathHref('/unknown-surface', false)).toBeNull();
    expect(resolveProductPathHref('/unknown-surface', true)).toBe('/unknown-surface');
  });

  it('distinguishes public, guest-preview and authenticated-only paths', () => {
    expect(isGuestPublicNavigationPath('/home')).toBe(true);
    expect(isGuestPublicNavigationPath('/operations')).toBe(true);
    expect(isGuestPublicNavigationPath('/academy')).toBe(false);

    expect(isGuestBrowseableNavigationPath('/home')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/operations/anything')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/academy')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/academy/paths')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/collab/storyboards/board-123')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/labs')).toBe(true);
    expect(isGuestBrowseableNavigationPath('/not-a-product-route')).toBe(false);

    expect(isProtectedProductNavigationPath('/academy')).toBe(false);
    expect(isProtectedProductNavigationPath('/labs')).toBe(false);
    expect(isProtectedProductNavigationPath('/operations')).toBe(false);
  });
});
