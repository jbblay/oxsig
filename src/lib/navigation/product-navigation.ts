export type ProductNavigationId =
  | 'home'
  | 'collab'
  | 'live'
  | 'boards'
  | 'manage'
  | 'academy'
  | 'operations'
  | 'warroom'
  | 'labs'
  | 'vault'
  | 'account';

export type ProductNavigationAccess = 'public' | 'guest-preview' | 'authenticated';
export type ProductNavigationStatus = 'active' | 'disabled';

export type ProductNavigationItem = {
  id: ProductNavigationId;
  href: string;
  label: string;
  access: ProductNavigationAccess;
  status: ProductNavigationStatus;
};

export const PRODUCT_NAVIGATION: readonly ProductNavigationItem[] = [
  { id: 'home', href: '/home', label: 'Dashboard', access: 'public', status: 'active' },
  { id: 'collab', href: '/collab', label: 'Collaboration', access: 'guest-preview', status: 'active' },
  { id: 'live', href: '/live', label: 'Live Workspace', access: 'guest-preview', status: 'active' },
  { id: 'boards', href: '/collab/storyboards', label: 'Boards', access: 'guest-preview', status: 'active' },
  { id: 'manage', href: '/manage', label: 'Resources', access: 'guest-preview', status: 'active' },
  { id: 'academy', href: '/academy', label: 'Academy', access: 'guest-preview', status: 'active' },
  { id: 'operations', href: '/operations', label: 'Operations', access: 'public', status: 'active' },
  { id: 'warroom', href: '/warroom', label: 'WarRoom', access: 'guest-preview', status: 'active' },
  { id: 'labs', href: '/labs', label: 'Cyber Lab', access: 'guest-preview', status: 'active' },
  { id: 'vault', href: '/vault', label: 'Vault', access: 'guest-preview', status: 'active' },
  { id: 'account', href: '/account', label: 'Account', access: 'guest-preview', status: 'active' },
] as const;

const PRODUCT_NAVIGATION_BY_ID = new Map(PRODUCT_NAVIGATION.map((item) => [item.id, item]));
const PRODUCT_NAVIGATION_BY_HREF = new Map(PRODUCT_NAVIGATION.map((item) => [item.href, item]));

export function getProductNavigationItem(id: ProductNavigationId) {
  return PRODUCT_NAVIGATION_BY_ID.get(id) ?? null;
}

export function getProductNavigationItemByHref(href: string) {
  return PRODUCT_NAVIGATION_BY_HREF.get(href) ?? null;
}

/**
 * Navigation is open for guest-browseable surfaces. Authentication gates the
 * actions inside those surfaces, not the user's ability to inspect the product.
 */
export function resolveProductNavigationHref(
  itemOrId: ProductNavigationItem | ProductNavigationId,
  isAuthenticated: boolean,
) {
  const item = typeof itemOrId === 'string' ? getProductNavigationItem(itemOrId) : itemOrId;
  if (!item || item.status !== 'active') return null;
  if (isAuthenticated || item.access === 'public' || item.access === 'guest-preview') return item.href;
  return null;
}

function localPathname(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    return new URL(value, 'https://oxsig.local').pathname;
  } catch {
    return null;
  }
}

function matchingNavigationItem(pathname: string) {
  return [...PRODUCT_NAVIGATION]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? null;
}

export function resolveProductPathHref(href: string, isAuthenticated: boolean) {
  const pathname = localPathname(href);
  if (!pathname) return null;

  if (pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
    return href;
  }

  if (pathname.startsWith('/explore')) return '/home';

  const item = matchingNavigationItem(pathname);
  if (item?.status === 'disabled') return null;
  if (!item) return isAuthenticated ? href : null;
  if (isAuthenticated || item.access === 'public') return href;
  if (item.access === 'guest-preview') return item.href;
  return null;
}

export function isGuestPublicNavigationPath(pathname: string) {
  const item = matchingNavigationItem(pathname);
  return Boolean(item && item.status === 'active' && item.access === 'public');
}

export function isGuestBrowseableNavigationPath(pathname: string) {
  const item = matchingNavigationItem(pathname);
  return Boolean(item && item.status === 'active' && (item.access === 'public' || item.access === 'guest-preview'));
}

export function isProtectedProductNavigationPath(pathname: string) {
  const item = matchingNavigationItem(pathname);
  return Boolean(item && item.status === 'active' && item.access === 'authenticated');
}

export function productNavigationLabelForPath(pathname: string) {
  return matchingNavigationItem(pathname)?.label ?? null;
}
