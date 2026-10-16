import { expect, test } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lab = { id: labId, slug: 'ubuntu-security-lab', name: 'Review Linux', status: 'running', expiresAt: '2099-01-01T00:00:00Z' };
const catalog = [{ slug: lab.slug, platform: 'linux', launchSurface: 'cyber-lab' }];
async function login(context) {
  await context.addCookies([{ name: 'oxsig-e2e-user', value: 'account-a', url: baseURL, sameSite: 'Lax' }]);
}
async function screenshot(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  console.log('REVIEW264 geometry', name, await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight })));
  // Viewport captures on desktop match the working area; mobile captures include the scrollable page.
  const bytes = await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: page.viewportSize().width < 1024, animations: 'disabled' });
  await info.attach(name, { body: bytes, contentType: 'image/png' });
  // Explicit opt-in permits retrieval from an isolated review build without
  // publishing application data or introducing a persistent artifact service.
  if (process.env.OXSIG_REVIEW_EMIT_SCREENSHOTS === 'true') {
    const encoded = bytes.toString('base64');
    const total = Math.ceil(encoded.length / 16000);
    for (let i = 0; i < total; i++) console.log(`SHOT264|${name}|${i}/${total}|${encoded.slice(i * 16000, (i + 1) * 16000)}`);
  }
}
for (const width of [1440, 390]) {
  test(`career → straight roadmap → terminal workspace at ${width}px`, async ({ page, context }, info) => {
    test.setTimeout(180000);
    await login(context);
    await page.setViewportSize({ width, height: 960 });
    let verified = false;
    let verificationRequests = 0;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedCommand = text; } } });
    });
    await page.route('**/api/academy/missions', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { progress: verified ? ['deploy','repair','persist'].map(missionId => ({ missionId, verifiedAt: '2026-10-16T10:00:00Z', checks: [] })) : [] } });
      const body = route.request().postDataJSON();
      if (body.action === 'verify') verificationRequests++;
      return route.fulfill({ status: 503, json: { error: 'Review fixture: AI is unavailable. Practice remains available.' } });
    });
    await page.route('**/api/labs/reconcile', route => route.fulfill({ json: {} }));
    await page.route('**/api/labs', route => route.fulfill({ json: { instances: [], catalog, capabilities: { configured: true, supportsTerminal: true } } }));
    await page.goto('/academy');
    await expect(page.getByRole('heading', { name: 'Choose your engineering path' })).toBeVisible();
    await screenshot(page, info, `home-${width}`);
    await page.getByRole('link', { name: /DevOps & Cloud.*Open career roadmap/ }).click();
    await expect(page).toHaveURL(/\/academy\/learn\/devops$/);
    const nodes = page.locator('.academy-roadmap__node');
    await expect(nodes).toHaveCount(4);
    const geometry = await nodes.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom }; }));
    expect(Math.max(...geometry.map(r => r.x)) - Math.min(...geometry.map(r => r.x))).toBeLessThan(1);
    await expect(page.locator('.academy-roadmap__connector')).toHaveCount(3);
    const rails = await page.locator('.academy-roadmap__connector').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom }; }));
    for (let i = 0; i < rails.length; i++) {
      expect(Math.abs(rails[i].x - geometry[i].x)).toBeLessThan(1);
      expect(Math.abs(rails[i].top - geometry[i].bottom)).toBeLessThan(1);
      expect(Math.abs(rails[i].bottom - geometry[i + 1].top)).toBeLessThan(1);
    }
    await expect(page.getByRole('link', { name: /Docker.*Enter practical workspace/ }).locator('.academy-roadmap__node--active')).toBeVisible();
    expect(await page.locator('.academy-roadmap__beam').evaluate(el => getComputedStyle(el).animationName)).toBe('academy-beam-flow');
    await screenshot(page, info, `roadmap-${width}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.academy-roadmap__beam').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.getByRole('button', { name: /Linux Fundamentals/ }).click();
    await expect(page.getByRole('heading', { name: /Linux Fundamentals.*Module preview/ })).toBeInViewport();
    await expect(page.getByText('These are curriculum outlines, not playable lessons yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Close module preview' }).click();
    await expect(page.getByRole('button', { name: /Linux Fundamentals/ })).toBeFocused();
    await page.getByRole('link', { name: /Docker.*Enter practical workspace/ }).click();
    await expect(page.getByRole('heading', { name: 'Docker Workspace' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Linux', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Linux terminal' })).toBeInViewport();
    const panel = page.getByRole('complementary', { name: 'Docker mission guidance' });
    if (width < 1024) {
      await expect(panel).toBeHidden();
      await screenshot(page, info, `workspace-${width}`);
      await page.getByRole('button', { name: 'Show mission panel' }).click();
    }
    await expect(panel.getByRole('button', { name: /First Deployment.*Ready to practice/ })).toBeVisible();
    await screenshot(page, info, width < 1024 ? 'mission-panel-mobile' : 'workspace-desktop');
    await panel.getByText('Guidance and suggested commands', { exact: true }).click();
    await panel.getByRole('button', { name: 'Copy command: docker info', exact: true }).click();
    expect(await page.evaluate(() => window.__copiedCommand)).toBe('docker info');
    expect(verificationRequests).toBe(0);
    await screenshot(page, info, width < 1024 ? 'commands-mobile' : 'commands-desktop');
    await page.getByRole('button', { name: width < 1024 ? 'Close mission panel' : 'Hide mission panel', exact: true }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Open AI mentor', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'AI mentor chat' })).toBeVisible();
    await expect(page.getByLabel('Ask the AI mentor')).toBeFocused();
    await page.getByLabel('Ask the AI mentor').fill('Help me understand ports');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/The AI mentor is unavailable/)).toBeVisible();
    await screenshot(page, info, `mentor-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'AI mentor chat' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open AI mentor', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    verified = true;
    await page.goto('/academy/learn/devops');
    await expect(page.getByRole('link', { name: /Docker.*Skill verified/ }).locator('.academy-roadmap__node--complete')).toBeVisible();
    await expect(page.getByRole('button', { name: /Linux Fundamentals/ }).locator('.academy-roadmap__node--complete')).toHaveCount(0);
    if (width === 1440) await screenshot(page, info, 'roadmap-verified');
  });
}

test('real terminal component survives mentor and sidebar toggles with unavailable transport', async ({ page, context }) => {
  test.setTimeout(90000);
  await login(context);
  await page.route('**/api/labs/reconcile', route => route.fulfill({ json: {} }));
  await page.route('**/api/labs', route => route.fulfill({ json: { instances: [lab], catalog, capabilities: { configured: true, supportsTerminal: true } } }));
  await page.route('**/api/academy/missions', route => route.fulfill({ json: route.request().method() === 'GET' ? { progress: [] } : { state: 'ready' } }));
  await page.route(`**/api/labs/instances/${labId}/session`, route => route.fulfill({ status: 503, json: { error: 'Review fixture: terminal transport unavailable' } }));
  await page.goto('/academy/learn/docker');
  const terminal = page.locator('.xterm-screen');
  await expect(terminal).toBeVisible();
  await terminal.evaluate(el => { window.__terminalNode = el; });
  await page.getByRole('button', { name: 'Open AI mentor' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Hide mission panel' }).click();
  await page.getByRole('button', { name: 'Show mission panel' }).click();
  expect(await terminal.evaluate(el => el === window.__terminalNode)).toBe(true);
});

test('Operations never expose destructive Academy lifecycle controls', async ({ page, context }) => {
  await login(context);
  await page.route('**/api/academy/missions', route => route.fulfill({ json: { progress: [] } }));
  await page.route('**/api/labs/reconcile', route => route.fulfill({ json: {} }));
  await page.route('**/api/labs', route => route.fulfill({ json: { instances: [{ ...lab, name: 'Black Domain operator', slug: 'operation-black-domain-operator', metadata: { operationManaged: true } }], catalog: [{ slug: 'operation-black-domain-operator', platform: 'linux', launchSurface: 'operation' }], capabilities: { configured: true, supportsTerminal: true } } }));
  await page.goto('/academy/learn/docker');
  await expect(page.getByText(/Academy will not manage its machines/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Destroy machine' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Resume/ })).toHaveCount(0);
});
