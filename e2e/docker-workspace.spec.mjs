import { expect, test } from '@playwright/test';

for (const width of [1365, 390]) {
  test(`Docker workspace resumes saved learning and recovers from lab failures at ${width}px`, async ({ page, context }) => {
    await context.addCookies([{ name: 'oxsig-e2e-user', value: 'account-a', url: 'http://127.0.0.1:3100', sameSite: 'Lax' }]);
    await page.setViewportSize({ width, height: 900 });
    let progress = [{ missionId: 'deploy', verifiedAt: '2026-10-15T00:00:00Z', notes: 'I published the host port.', checks: [], conceptAnswer: 'Containers share a kernel.', conceptFeedback: { answer: 'Correct: the host kernel is shared.' } }];
    await page.route('**/api/academy/missions', async route => {
      const body = route.request().postDataJSON();
      if (!body) return route.fulfill({ json: { progress } });
      if (body.action === 'concept') {
        progress[0].conceptAnswer = body.answer;
        return route.fulfill({ json: { saved: true, feedback: null } });
      }
      return route.fulfill({ status: 503, json: { error: 'AI unavailable' } });
    });
    await page.route('**/api/labs/reconcile', route => route.fulfill({ json: {} }));
    await page.route('**/api/labs', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { error: 'The environment could not start. Refresh status and retry.' } }) : route.fulfill({ json: { catalog: [], capabilities: { configured: true, supportsTerminal: true }, instances: [] } }));
    await page.goto('/academy/learn/docker');
    await expect(page.getByRole('heading', { name: 'Docker Workspace' })).toBeVisible();
    if (width < 1024) await page.getByRole('button', { name: 'Show mission panel' }).click();
    await page.getByText('Learn · Containers and virtual machines', { exact: true }).click();
    await expect(page.getByLabel(/How does a container differ/)).toHaveValue('Containers share a kernel.');
    if (width < 1024) await page.getByRole('button', { name: 'Close mission panel' }).click();
    await expect(page.getByText('Mission 02: Broken Deployment')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Linux' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Linux' }).click();
    await expect(page.getByText('The environment could not start. Refresh status and retry.')).toBeVisible();
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start Linux' })).toBeVisible();
    await page.getByRole('button', { name: 'Open AI mentor' }).click();
    await page.getByLabel('Ask the AI mentor').fill('Why is port mapping needed?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/The AI mentor is unavailable/)).toBeVisible();
    await page.getByRole('button', { name: 'Close AI mentor' }).click();
    await expect(page.getByText('Your live terminal will appear here')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Mission 02: Broken Deployment')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
