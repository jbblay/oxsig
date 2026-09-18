import { test, expect } from '@playwright/test';

test.describe('critical guest flows', () => {
  test('landing page exposes the guest-first entry path', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Launch\. Operate\. Prove\./i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open guest dashboard/i })).toHaveAttribute('href', '/home');
    await expect(page.getByText('Browse before signup')).toBeVisible();
  });

  test('guest dashboard renders and keeps protected work behind sign-in', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
    await expect(page.getByText('Guest workspace')).toBeVisible();
    await expect(page.locator('a[href="/sign-in"]').first()).toBeVisible();
    await expect(page.locator('a[href="/sign-up"]').first()).toBeVisible();
  });

  test('explore compatibility route lands on the guest dashboard', async ({ page }) => {
    await page.goto('/explore');

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  });
});
