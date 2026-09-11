import { describe, expect, it } from 'vitest';
import { authPathWithReturnTo, safeAuthReturnTo } from './auth-return';

describe('safeAuthReturnTo', () => {
  it('preserves an internal mission path with query and hash state', () => {
    expect(safeAuthReturnTo('/explore?operation=black-domain&preview=2#live-environments'))
      .toBe('/explore?operation=black-domain&preview=2#live-environments');
  });

  it('uses the first value when Next search params contain duplicates', () => {
    expect(safeAuthReturnTo(['/operations?operation=black-domain', '/home']))
      .toBe('/operations?operation=black-domain');
  });

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    'javascript:alert(1)',
    '',
  ])('rejects unsafe return target %s', (value) => {
    expect(safeAuthReturnTo(value)).toBe('/home');
  });
});

describe('authPathWithReturnTo', () => {
  it('encodes the exact mission continuation in the auth URL', () => {
    expect(authPathWithReturnTo('/sign-up', '/explore?operation=black-domain&preview=1#live-environments'))
      .toBe('/sign-up?redirect_url=%2Fexplore%3Foperation%3Dblack-domain%26preview%3D1%23live-environments');
  });
});
