import { test, expect } from "@playwright/test";
import pg from "pg";
const baseURL = "http://127.0.0.1:3100";
const owner = "00000000-0000-4000-8000-0000000000a1";
const databaseUrl = process.env.DATABASE_URL || "";
const pool = new pg.Pool({ connectionString: databaseUrl });
test.describe.configure({ mode: "serial" });
test.afterAll(async () => pool.end());
async function login(context, key) {
  await context.addCookies([
    { name: "oxsig-e2e-user", value: key, url: baseURL, sameSite: "Lax" },
  ]);
}
async function mutate(page, body) {
  return page.evaluate(async (body) => {
    const csrf = await fetch("/api/csrf-token").then((r) => r.json());
    const r = await fetch("/api/mentorship/evidence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf.token,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }, body);
}
for (const viewport of [
  { width: 1365, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Mentor Forge and Passport persist and enforce ownership at ${viewport.width}px`, async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(240000);
    if (
      !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):5432\/oxsig_ci$/.test(
        databaseUrl,
      )
    )
      throw Error(
        "Evidence fixture requires the disposable local oxsig_ci database.",
      );
    await page.setViewportSize(viewport);
    await login(context, "account-a");
    // Prewarm Next dev's server and API route before opening Chromium. Without
    // this, first-route compilation can trigger a full client reload and abort fetch.
    const warmHeaders = { Cookie: 'oxsig-e2e-user=account-a' };
    const warmPage = await request.get(baseURL+'/academy/mentor-forge', { headers: warmHeaders, timeout: 90000 });
    expect(warmPage.status(), 'Prewarmed Mentor Forge page').toBe(200);
    const warmEvidence = await request.get(baseURL+'/api/mentorship/evidence', { headers: warmHeaders, timeout: 90000 });
    expect(warmEvidence.status(), 'Prewarmed authenticated evidence API: '+(await warmEvidence.text()).slice(0,500)).toBe(200);
    // Diagnose SSR-only rendering and client hydration separately from API failures.
    const browserFaults = [];
    page.on('pageerror', error => browserFaults.push('pageerror: '+error.message.slice(0,400)));
    page.on('console', message => {
      if(message.type() === 'error') browserFaults.push('console: '+message.text().slice(0,400));
    });
    page.on('requestfailed', request => browserFaults.push('requestfailed: '+request.url()+' '+request.failure()?.errorText));
    const navigation = await page.goto("/academy/mentor-forge");
    await expect(page.getByRole("heading", {
      name: "Mentor Forge & Skills Passport", exact: true,
    })).toBeVisible();
    const probe = await page.evaluate(async () => {
      try {
        const result = await fetch('/api/mentorship/evidence', {cache:'no-store'});
        return {status: result.status, body: (await result.text()).slice(0,500)};
      } catch(error) { return {status: 0, body: String(error)}; }
    });
    console.log('[E2E evidence diagnostics]', JSON.stringify({
      server: navigation?.status(),
      headers: Object.fromEntries(Object.entries((await navigation?.allHeaders()) || {}).filter(([k]) => /content-security-policy|cross-origin|location/.test(k))),
      api: probe,
      browserFaults,
      pageUrl: page.url(),
    }));
    expect(probe.status, 'Evidence API: '+probe.body).toBe(200);
    try {
      await expect(page.getByText("Loading evidence…")).toHaveCount(0, {timeout:45000});
    } catch(error) {
      const client = await page.evaluate(() => ({
        scripts: document.scripts.length,
        e2eCookie: document.cookie.includes('oxsig-e2e-user='),
        ready: document.readyState,
        html: document.documentElement.getAttribute('class'),
      }));
      throw new Error('Evidence UI failed to hydrate: '+JSON.stringify({browserFaults,client})+'; '+String(error));
    }
    await pool.query("DELETE FROM mentor_forge_attempts WHERE owner_id=$1", [
      owner,
    ]);
    await pool.query("DELETE FROM mentor_applications WHERE applicant_id=$1", [
      owner,
    ]);
    await pool.query("DELETE FROM skills_passport_shares WHERE owner_id=$1", [
      owner,
    ]);
    const app = await pool.query(
      `INSERT INTO mentor_applications(applicant_id,track,headline,bio,specializations,motivation,timezone,code_of_conduct_version,code_of_conduct_accepted_at)
   VALUES($1,'external','Browser test teaching application',$2,ARRAY['linux-systems'],$3,'UTC','v1',NOW()) RETURNING id`,
      [
        owner,
        "Professional teaching background. ".repeat(5),
        "I help learners diagnose safely and explain their next steps.",
      ],
    );
    // Check server truth before testing whether the UI has hydrated the new option.
    const freshApi = await request.get(baseURL+'/api/mentorship/evidence', {
      headers: warmHeaders, timeout: 90000,
    });
    expect(freshApi.status(), 'Fresh mentor evidence API response').toBe(200);
    const freshState = await freshApi.json();
    expect(freshState.applications?.map(x => x.id), 'New mentor application was not returned by API').toContain(app.rows[0].id);
    await page.reload();
    const option = page.getByLabel("Application", { exact: true })
      .locator('option[value="'+app.rows[0].id+'"]');
    await expect(option, 'Rendered application selector did not receive API data').toHaveCount(1, { timeout: 30000 });
    await page.getByLabel("Application", { exact: true }).selectOption(app.rows[0].id);
    await page
      .getByLabel("Your guided explanation")
      .fill(
        "Port 8080 on the host forwards to port 80 inside the container. Open localhost:8080 and compare the observed response.",
      );
    await page
      .getByLabel("Diagnostic questions")
      .fill("Which URL did you open? What published port does docker ps show?");
    await page
      .getByLabel("Safe next steps and reasoning")
      .fill(
        "Ask the learner to inspect the mapping and retry the published host port. Keep the firewall enabled; explain the result before making any changes.",
      );
    await page.getByRole("button", { name: "Submit for human review" }).click();
    await expect(page.getByText("Audition · submitted")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Audition · submitted")).toBeVisible();
    await expect(page.locator("body")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const share = await mutate(page, {
      action: "share",
      consent: true,
      hours: 1,
    });
    expect(share.status).toBe(200);
    const publicUrl = `${baseURL}/api/passport/${share.body.token}`;
    const guest = await context.browser().newContext();
    const publicPage = await guest.newPage();
    const shared = await publicPage.goto(publicUrl);
    expect(shared.status()).toBe(200);
    const summary = await shared.json();
    expect(summary.version).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(
      /owner_id|lab_instance_id|email|token_hash|public_key/,
    );
    const revoked = await mutate(page, {
      action: "revoke_share",
      id: share.body.id,
    });
    expect(revoked.status).toBe(200);
    expect((await publicPage.goto(publicUrl)).status()).toBe(404);
    const expiring = await mutate(page, {
      action: "share",
      consent: true,
      hours: 1,
    });
    expect(expiring.status).toBe(200);
    await pool.query(
      `UPDATE skills_passport_shares SET created_at=NOW()-INTERVAL '2 hours',expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`,
      [expiring.body.id],
    );
    expect(
      (
        await publicPage.goto(`${baseURL}/api/passport/${expiring.body.token}`)
      ).status(),
    ).toBe(404);
    await guest.close();
    await login(context, "account-b");
    await page.reload();
    await expect(page.getByText("Audition · submitted")).toHaveCount(0);
    const forged = await mutate(page, {
      action: "forge",
      applicationId: app.rows[0].id,
      explanation: "x".repeat(40),
      questions: "x".repeat(20),
      reasoning: "x".repeat(40),
    });
    expect(forged.status).toBe(404);
    const denied = await page.evaluate(() =>
      fetch("/api/admin/mentorship-evidence").then((r) => r.status),
    );
    expect(denied).toBe(403);
  });
}
