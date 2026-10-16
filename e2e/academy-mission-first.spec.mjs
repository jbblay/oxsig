import { expect, test } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test(`Academy is mission-first and legacy entry points redirect at ${viewport.width}px`, async ({ page, context, request }) => {
    test.setTimeout(180000);
    await context.addCookies([
      { name: 'oxsig-e2e-user', value: 'account-a', url: baseURL, sameSite: 'Lax' },
    ]);
    await page.setViewportSize(viewport);

    // Warm the authenticated page on small CI workers before starting Chromium.
    const warmup = await request.get(baseURL + '/academy', {
      headers: { Cookie: 'oxsig-e2e-user=account-a' }, timeout: 90000,
    });
    expect(warmup.status()).toBe(200);
    await page.goto('/academy');

    await expect(page.getByRole('heading', {
      name: 'Learn by doing. Prove it in a real environment.',
    })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Academy navigation' });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText('Engineering World');
    await expect(nav).toContainText('Mission Control');
    await expect(nav).not.toContainText('Current lesson');
    await expect(nav).not.toContainText('Learning paths');
    await expect(nav).not.toContainText('Prove capability');
    await expect(page.getByRole('link', { name: 'Enter Engineering World' })).toHaveAttribute('href', '/academy/engineering-world');
    await expect(page.getByRole('link', { name: 'Open Mission Control' })).toHaveAttribute('href', '/academy/missions');

    await page.goto('/academy/paths');
    await expect(page).toHaveURL(/\/academy\/engineering-world$/);
    await page.goto('/academy/prove');
    await expect(page).toHaveURL(/\/academy\/missions$/);
    await page.goto('/academy/explore');
    await expect(page).toHaveURL(/\/academy\/engineering-world$/);

    await page.goto('/academy');
    await expect(page.getByRole('link', { name: 'Past skill records' })).toHaveAttribute('href', '/academy/transcript');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Academy guest preview promotes missions rather than old lessons', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/academy');
  await expect(page.getByText('Guest preview // Engineering missions')).toBeVisible();
  await expect(page.getByText('Sample engineering mission')).toBeVisible();
  await expect(page.getByText('Sample learning path')).toHaveCount(0);
});
