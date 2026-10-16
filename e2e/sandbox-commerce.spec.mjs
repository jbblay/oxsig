import { test, expect } from '@playwright/test';
import pg from 'pg';

const baseURL = 'http://127.0.0.1:3100';
const dbUrl = process.env.DATABASE_URL || '';
const ownerA = '00000000-0000-4000-8000-0000000000a1';
const ownerB = '00000000-0000-4000-8000-0000000000b2';
const pool = new pg.Pool({ connectionString: dbUrl });

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => pool.end());

function assertDisposableDatabase() {
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):5432\/oxsig_ci$/.test(dbUrl)) {
    throw new Error('Sandbox browser tests require local, disposable oxsig_ci; refusing any other database.');
  }
}
async function signIn(context, key) {
  await context.addCookies([{ name: 'oxsig-e2e-user', value: key, url: baseURL, sameSite: 'Lax' }]);
}
async function apiAction(page, body) {
  return page.evaluate(async input => {
    const csrfResponse = await fetch('/api/csrf-token');
    const csrf = await csrfResponse.json();
    const response = await fetch('/api/academy/sandbox-commerce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }, body);
}
async function visit(page, route = '/academy/sandbox-commerce') {
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/academy/sandbox-commerce') && response.request().method() === 'GET',
    { timeout: 90000 }
  );
  await page.goto(route);
  const result = await responsePromise;
  expect(result.status(), 'Sandbox state API: ' + (await result.text()).slice(0, 500)).toBe(200);
  await expect(page.getByText('Loading sandbox records…')).toHaveCount(0, { timeout: 30000 });
}

for (const viewport of [{width:1365,height:900},{width:390,height:844}]) {
  test(`demo checkout, replay defense and cross-account isolation at ${viewport.width}px`, async ({page,context}) => {
    test.setTimeout(240000);
    assertDisposableDatabase();
    await page.setViewportSize(viewport);
    await signIn(context, 'account-a');
    // Clear only disposable E2E identities, never a production account.
    for(const owner of [ownerA,ownerB]) {
      await pool.query('DELETE FROM sandbox_credit_entries WHERE owner_id=$1',[owner]);
      await pool.query('DELETE FROM sandbox_subscriptions WHERE owner_id=$1',[owner]);
      await pool.query('DELETE FROM sandbox_mentor_earnings WHERE mentor_id=$1',[owner]);
      await pool.query('DELETE FROM sandbox_checkouts WHERE owner_id=$1',[owner]);
    }
    await visit(page);
    await expect(page.getByRole('heading',{name:'Sandbox Subscriptions & Learning Credits'})).toBeVisible();
    await expect(page.getByText('Simulation only.',{exact:false})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

    const first = await apiAction(page,{action:'checkout',productType:'credit_pack',productId:'starter',requestId:'11111111-1111-4111-8111-111111111111'});
    expect(first.status).toBe(200);
    expect(first.body.learningCredits).toBe(100);

    const repeat = await apiAction(page,{action:'checkout',productType:'credit_pack',productId:'starter',requestId:'11111111-1111-4111-8111-111111111111'});
    expect(repeat.status).toBe(200);
    expect(repeat.body.learningCredits).toBe(100);
    const count = await pool.query('SELECT COUNT(*)::int AS n FROM sandbox_checkouts WHERE owner_id=$1',[ownerA]);
    expect(count.rows[0].n).toBe(1);

    const mismatch = await apiAction(page,{action:'checkout',productType:'credit_pack',productId:'builder',requestId:'11111111-1111-4111-8111-111111111111'});
    expect(mismatch.status).toBe(409);
    const redemption = await apiAction(page,{action:'redeem',amount:25,requestId:'22222222-2222-4222-8222-222222222222'});
    expect(redemption.status).toBe(200);
    expect(redemption.body.learningCredits).toBe(75);
    const overdraw = await apiAction(page,{action:'redeem',amount:100,requestId:'33333333-3333-4333-8333-333333333333'});
    expect(overdraw.status).toBe(409);

    await signIn(context, 'account-b');
    await visit(page);
    const other = await page.evaluate(async()=> (await fetch('/api/academy/sandbox-commerce')).json());
    expect(other.learningCredits).toBe(0);
    expect(other.checkouts).toHaveLength(0);
    const forged = await apiAction(page,{action:'record_mentoring',sessionId:'44444444-4444-4444-8444-444444444444'});
    expect(forged.status).toBe(403);

    await signIn(context, 'account-a');
    await visit(page);
    const mine=await page.evaluate(async()=> (await fetch('/api/academy/sandbox-commerce')).json());
    expect(mine.learningCredits).toBe(75);
    expect(mine.checkouts).toHaveLength(1);
  });
}
