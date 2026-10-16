import { expect, test } from '@playwright/test';
import pg from 'pg';

const base = 'http://127.0.0.1:3100';
const dbUrl = process.env.DATABASE_URL || '';
const ownerA = '00000000-0000-4000-8000-0000000000a1';
const ownerB = '00000000-0000-4000-8000-0000000000b2';
const pool = new pg.Pool({ connectionString: dbUrl });
test.describe.configure({ mode: 'serial' });
test.afterAll(async () => { await pool.end(); });

function assertDisposableDb() {
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):5432\/oxsig_ci$/.test(dbUrl)) {
    throw new Error('Academy simulator E2E requires the disposable localhost oxisg_ci database.');
  }
}
async function login(context, account) {
  await context.addCookies([{ name: 'oxsig-e2e-user', value: account, url: base, sameSite: 'Lax' }]);
}
async function command(page, stageId, selections) {
  return page.evaluate(async input => {
    const token = (await (await fetch('/api/csrf-token')).json()).token;
    const r = await fetch('/api/academy/simulator', {
      method:'POST', headers:{'Content-Type':'application/json','x-csrf-token':token},
      credentials:'include', body:JSON.stringify(input)
    });
    return {status:r.status, body:await r.json()};
  }, {stageId,selections});
}
test('Docker castles persist, unlock sequentially, award idempotent practice SP and isolate accounts', async ({ page, context, request }) => {
  test.setTimeout(240000);
  assertDisposableDb();
  await pool.query('DELETE FROM academy_simulation_progress WHERE owner_id=ANY($1::uuid[])', [[ownerA,ownerB]]);
  await login(context,'account-a');
  const warmup=await request.get(base+'/academy/learn/docker/simulator',{headers:{Cookie:'oxsig-e2e-user=account-a'},timeout:90000});
  expect(warmup.status()).toBe(200);
  await page.goto('/academy/learn/docker/simulator');
  await expect(page.getByRole('heading',{name:'Docker Kingdom'})).toBeVisible();

  const locked = await command(page,'network',{publish:'18080:80',url:'http://localhost:18080'});
  expect(locked.status).toBe(409);
  await expect(page.getByRole('button',{name:/CASTLE 2/})).toBeDisabled();

  await page.locator('#slot-image').selectOption('nginx:alpine');
  await page.locator('#slot-name').selectOption('oxsig-academy-web');
  await page.getByRole('button',{name:'Check configuration'}).click();
  await expect(page.getByTestId('simulation-sp')).toContainText('25 SP', {timeout:30000});
  await expect(page.getByRole('button',{name:/CASTLE 2/})).toBeEnabled();
  const retry = await command(page,'container',{image:'nginx:alpine',name:'oxsig-academy-web'});
  expect(retry.status).toBe(200);
  expect(retry.body.state.practiceSp).toBe(25);

  await page.getByRole('button',{name:/CASTLE 2/}).click();
  await page.locator('#slot-publish').selectOption('18081:80');
  await page.locator('#slot-url').selectOption('http://localhost:18080');
  await page.getByRole('button',{name:'Check configuration'}).click();
  await expect(page.getByText('Needs another configuration')).toBeVisible({timeout:20000});
  await expect(page.getByTestId('simulation-sp')).toContainText('25 SP');
  await page.locator('#slot-publish').selectOption('18080:80');
  await page.getByRole('button',{name:'Check configuration'}).click();
  await expect(page.getByTestId('simulation-sp')).toContainText('50 SP', {timeout:20000});
  await expect(page.getByRole('button',{name:/CASTLE 3/})).toBeEnabled();

  await page.getByRole('button',{name:/CASTLE 3/}).click();
  await page.locator('#slot-mount').selectOption('oxsig_academy_data:/usr/share/nginx/html');
  await page.locator('#slot-marker').selectOption('OXSIG Academy persistent');
  await page.getByRole('button',{name:'Check configuration'}).click();
  await expect(page.getByTestId('simulation-sp')).toContainText('75 SP', {timeout:20000});
  const checkDb = await pool.query('SELECT count(*)::int n, sum(sp_awarded)::int sp FROM academy_simulation_progress WHERE owner_id=$1 AND verified_at IS NOT NULL',[ownerA]);
  expect(checkDb.rows[0]).toMatchObject({n:3,sp:75});

  await login(context,'account-b');
  await page.goto('/academy/learn/docker/simulator');
  await expect(page.getByTestId('simulation-sp')).toContainText('0 SP');
  await expect(page.getByRole('button',{name:/CASTLE 2/})).toBeDisabled();
  const other = await command(page,'storage',{mount:'oxsig_academy_data:/usr/share/nginx/html',marker:'OXSIG Academy persistent'});
  expect(other.status).toBe(409);
  const notMine = await pool.query('SELECT count(*)::int n FROM academy_simulation_progress WHERE owner_id=$1',[ownerB]);
  expect(notMine.rows[0].n).toBe(0);
});
test('Career categories and Docker workbench fit mobile without launching labs', async ({ page, context, request }) => {
  test.setTimeout(160000);
  await login(context,'account-a');
  const warm = await request.get(base+'/academy', {headers:{Cookie:'oxsig-e2e-user=account-a'},timeout:90000});
  expect(warm.status()).toBe(200);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/academy');
  await expect(page.getByRole('heading',{name:'Choose your engineering path'})).toBeVisible();
  await page.getByRole('link',{name:/Cybersecurity/}).click();
  await expect(page.getByText('Network Fundamentals')).toBeVisible();
  await page.goto('/academy');
  await page.getByRole('link',{name:/DevOps & Cloud/}).click();
  await page.getByRole('link',{name:/Docker.*Enter practical workspace/}).click();
  await expect(page.getByRole('heading',{name:'Docker Workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Show mission panel'}).click();
  // Client navigation must load the simulator's saved state before it can
  // render its heading. Wait for that contract rather than timing hydration
  // and development compilation against the heading's short assertion timeout.
  const simulatorState = page.waitForResponse(response =>
    response.url() === base + '/api/academy/simulator' && response.request().method() === 'GET',
  );
  await page.getByRole('link',{name:'Optional visual practice'}).click();
  await expect(page).toHaveURL(base + '/academy/learn/docker/simulator');
  expect((await simulatorState).status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Docker Kingdom'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
