import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Auth, Snapshot } from '../../packages/contracts/src';
async function login(page: Page, role = 'officer') {
  const credentials = JSON.parse(
    await readFile('.runtime/dev-credentials.json', 'utf8'),
  ) as Record<string, string>;
  await page.goto('/');
  await page.getByLabel('Work email').fill(`${role}@safesight.local`);
  await page
    .getByLabel('Password', { exact: true })
    .fill(credentials[`${role}@safesight.local`]);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Operations overview' }),
  ).toBeVisible();
  await expect(page.getByText('Live stream', { exact: true })).toBeVisible();
}
test('officer completes fixture inspection, reviews with an audit trail, and logs out', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page
    .getByRole('link', { name: 'PPE inspections', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run review sample' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inspection review', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByText('DEMO fixture · no real AI', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.image-overlay svg rect')).toHaveCount(6);
  await page
    .getByLabel('Review notes (required)')
    .fill('Browser verification: confirmed schematic annotations.');
  await page.getByRole('button', { name: 'Save human review' }).click();
  await expect(
    page.getByText('Browser verification: confirmed schematic annotations.'),
  ).toBeVisible();
  await page.screenshot({
    path: '.runtime/inspection-desktop.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in to workspace' }),
  ).toBeVisible();
});
test('390px viewer can navigate all permitted pages without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'viewer');
  for (const [path, heading] of [
    ['/dashboard', 'Operations overview'],
    ['/zones', 'Facility zones'],
    ['/inspections', 'PPE inspections'],
    ['/alerts', 'Alerts & incidents'],
    ['/analytics', 'Analytics & reports'],
    ['/settings', 'Settings & QR access'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
        })),
      )
      .toEqual({ width: 390, viewport: 390 });
  }
  await page.goto('/inspections');
  await expect(
    page.getByRole('button', { name: 'Upload for inspection' }),
  ).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.locator('[data-zone-id]').first()).toBeVisible();
  await expect(page.getByText('Live stream', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '.runtime/dashboard-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(
    page.getByRole('link', { name: 'Simulation controls' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close menu' }).click();
});
test('two clients share server readings; reconnect fetches current authoritative state', async ({
  browser,
}) => {
  const first = await browser.newContext(),
    second = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  const a = await first.newPage(),
    b = await second.newPage();
  try {
    await login(a, 'viewer');
    await login(b, 'officer');
    const selector = '[data-zone-id="20000000-0000-4000-8000-000000000001"]';
    const initial = await a.locator(selector).getAttribute('data-reading-id');
    await expect
      .poll(
        async () => {
          const av = await a.locator(selector).getAttribute('data-reading-id'),
            bv = await b.locator(selector).getAttribute('data-reading-id');
          return av !== initial && av === bv;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await second.setOffline(true);
    await a.waitForTimeout(6500);
    await second.setOffline(false);
    await expect(b.getByText('Live stream', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(
        async () =>
          (await a.locator(selector).getAttribute('data-reading-id')) ===
          (await b.locator(selector).getAttribute('data-reading-id')),
        { timeout: 15000 },
      )
      .toBe(true);
  } finally {
    await first.close();
    await second.close();
  }
});
test('admin simulator and settings work; unconfigured QR is explained and no credentials enter JS', async ({
  page,
}) => {
  await login(page, 'admin');
  await page.goto('/simulation');
  await expect(
    page.getByRole('heading', { name: 'Simulation controls', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Target zone')
    .selectOption('20000000-0000-4000-8000-000000000004');
  await page
    .getByLabel('Scenario', { exact: true })
    .selectOption('interrupted');
  await page.getByRole('button', { name: 'Start scenario' }).click();
  await expect(page.getByText('Current persisted run:')).toContainText(
    'interrupted',
  );
  await page.getByLabel('Scenario', { exact: true }).selectOption('normal');
  await page.getByRole('button', { name: 'Start scenario' }).click();
  await expect(page.getByText('Current persisted run:')).toContainText(
    'normal',
  );
  await page.goto('/settings');
  await expect(page.getByText(/Set PUBLIC_APP_URL/)).toBeVisible();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/settings') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save preferences' }).click();
  expect((await saved).status()).toBe(200);
  await page.goto('/dashboard');
  await expect(page.locator('[data-zone-id]').first()).toBeVisible();
  await expect(page.getByText('Live stream', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '.runtime/dashboard-desktop.png',
    fullPage: true,
  });
  const env = await readFile('.env', 'utf8');
  const inferenceKey = env.match(/^INFERENCE_KEY=(.+)$/m)![1];
  for (const src of await page
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src')!))) {
    const response = await page.request.get(src);
    expect(await response.text()).not.toContain(inferenceKey);
  }
  const auth = (await (await page.request.get('/api/auth/me')).json()) as Auth;
  const snapshot = (await (
    await page.request.get('/api/dashboard')
  ).json()) as Snapshot;
  expect(snapshot.zones.length).toBe(5);
  expect(auth.user.role).toBe('ADMIN');
});
