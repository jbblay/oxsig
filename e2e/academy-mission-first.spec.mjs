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
      name: 'Choose your engineering path',
    })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Academy navigation' });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText('Engineering World');
    await expect(nav).toContainText('Mission Control');
    await expect(nav).toContainText('Explore skills');
    await expect(page.getByRole('link', { name: /DevOps & Cloud/ })).toHaveAttribute('href', '/academy/learn/devops');
    await expect(nav).not.toContainText('Current lesson');
    await expect(nav).not.toContainText('Learning paths');
    await expect(nav).not.toContainText('Prove capability');
    await expect(page.getByRole('link', { name: 'Enter Engineering World' })).toHaveAttribute('href', '/academy/engineering-world');
    await expect(page.getByRole('link', { name: 'Enter Docker workspace' })).toHaveAttribute('href','/academy/learn/docker');
    await expect(page.getByRole('link', { name: 'Open Mission Control' })).toHaveAttribute('href', '/academy/missions');

    await page.getByRole('link', { name: /DevOps & Cloud/ }).click();
    await expect(page).toHaveURL(/\/academy\/learn\/devops$/);
    await expect(page.getByRole('link', { name: 'Open Docker workspace' })).toHaveAttribute('href', '/academy/learn/docker');

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


for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test('Docker workspace prioritizes terminal and collapsible mission guidance at ' + viewport.width + 'px', async ({ page, context }) => {
    test.setTimeout(90000);
    await context.addCookies([{ name: 'oxsig-e2e-user', value: 'account-a', url: baseURL, sameSite: 'Lax' }]);
    await page.setViewportSize(viewport);
    await page.route('**/api/academy/missions', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ progress: [] }) });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/labs', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ instances: [], catalog: [], capabilities: { configured: true, supportsTerminal: true } }),
        });
      } else {
        await route.continue();
      }
    });
    await page.goto('/academy/learn/docker');
    await expect(page.getByRole('heading', { name: 'Docker Workspace' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Academy navigation' })).toContainText('DevOps & Cloud');
    await expect(page.getByRole('heading', { name: 'Linux terminal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Linux' })).toBeVisible();

    const missionPanel = page.getByRole('complementary', { name: 'Docker mission guidance' });
    await expect(missionPanel).toBeVisible();
    await expect(missionPanel.getByText('Mission 01')).toBeVisible();
    await expect(missionPanel.getByText('Docker daemon is accessible')).toBeVisible();
    await page.getByRole('button', { name: 'Hide mission panel' }).click();
    await expect(missionPanel).toBeHidden();
    await page.getByRole('button', { name: 'Show mission panel' }).click();
    await expect(missionPanel).toBeVisible();
    await page.getByRole('button', { name: 'AI mentor' }).click();
    await expect(page.getByRole('heading', { name: 'AI mentor' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linux terminal' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
