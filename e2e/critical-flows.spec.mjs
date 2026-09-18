import { test, expect } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
const authCookie = 'oxsig-e2e-user';

async function useAccount(context, key) {
  await context.addCookies([
    {
      name: authCookie,
      value: key,
      url: baseURL,
      sameSite: 'Lax',
    },
  ]);
}

test.describe.configure({ mode: 'serial' });

test('Cyber Lab opens AI Practitioner from the command palette and hides Operations-only profiles', async ({ page, context }) => {
  await useAccount(context, 'account-a');
  await page.goto('/labs');

  await expect(page.getByLabel('Open AI Practitioner')).toBeVisible();

  const labsSnapshot = await page.evaluate(async () => {
    const response = await fetch('/api/labs', { cache: 'no-store' });
    return {
      status: response.status,
      body: await response.json(),
    };
  });

  expect(labsSnapshot.status).toBe(200);
  const managedProfile = (labsSnapshot.body.catalog || []).find(
    (lab) => lab.slug === 'operation-black-domain-operator'
  );
  expect(managedProfile).toMatchObject({
    slug: 'operation-black-domain-operator',
    launchSurface: 'operation',
  });
  await expect(page.getByText('Black Domain Operator', { exact: true })).toHaveCount(0);

  await page.keyboard.press('Control+K');
  const contextualAi = page.getByRole('button', { name: /Ask AI in current context/i });
  await expect(contextualAi).toBeVisible();
  await expect(contextualAi).toContainText('AI Practitioner');
  await contextualAi.click();

  await expect(page.getByRole('heading', { name: 'AI Practitioner', exact: true })).toBeVisible();
  await expect(page.getByLabel('Close AI Practitioner')).toBeVisible();
});

test('Board recovery drafts remain isolated when the browser switches accounts', async ({ page, context }) => {
  const title = `E2E account A recovery ${Date.now()}`;

  await useAccount(context, 'account-a');
  await page.goto('/collab/storyboards');

  const titleInput = page.getByPlaceholder('Board title');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);

  const canvas = page.getByLabel('Storyboard drawing canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Storyboard canvas did not expose a drawable bounding box');

  await page.mouse.move(box.x + Math.min(80, box.width * 0.15), box.y + Math.min(80, box.height * 0.2));
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(260, box.width * 0.45), box.y + Math.min(180, box.height * 0.45), { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText('Recovery saved', { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await useAccount(context, 'account-b');
  await page.reload();
  await expect(page.getByPlaceholder('Board title')).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(page.getByText('No local drafts match this view.', { exact: true })).toBeVisible();

  await useAccount(context, 'account-a');
  await page.reload();
  await expect(page.getByPlaceholder('Board title')).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});
