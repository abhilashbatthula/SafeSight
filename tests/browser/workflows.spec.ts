import { test, expect, type Page, type Locator } from '@playwright/test';
import sharp from 'sharp';
import type { Auth, Inspection } from '../../packages/contracts/src';
async function checkAnalysisScrolling(frame: Locator) {
  const paper = frame.getByRole('region', {
    name: 'Safety analysis',
    exact: true,
  });
  await expect(
    frame.getByText(
      /Analysis limitations|Visual review|What this photograph cannot verify/,
    ),
  ).toHaveCount(0);
  await expect(frame.locator('.window-body')).toHaveCSS('overflow-y', 'hidden');
  await expect(paper).toHaveCSS('overflow-y', 'auto');
  const photo = frame.locator('.photo-pane');
  const before = await photo.boundingBox();
  await paper.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await paper.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    0,
  );
  expect(
    await frame
      .locator('.window-body')
      .evaluate((element) => element.scrollTop),
  ).toBe(0);
  expect(await photo.boundingBox()).toEqual(before);
  await expect(
    frame.getByRole('button', { name: 'Save report' }),
  ).toBeInViewport();
  await expect(photo).toBeInViewport();
  await paper.evaluate((element) => {
    element.scrollTop = 0;
  });
}

async function open(page: Page, kind: 'human' | 'machinery' = 'human') {
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation', { name: 'Desktop applications' })
      .getByRole('button'),
  ).toHaveCount(4);
  const title = kind === 'human' ? 'Human analysis' : 'Machinery analysis';
  await page
    .getByRole('button', { name: `Open ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /sign in|sign out/i }),
  ).toHaveCount(0);
}
test('Windows 95 workspace has only essential navigation and works at 390px', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  for (const [path, title] of [
    ['/human', 'Human analysis'],
    ['/history', 'Inspection history'],
    ['/settings', 'Workspace settings'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(390);
    await expect(
      page.locator('.application-frame.focused .titlebar'),
    ).toHaveCSS('background-color', 'rgb(0, 0, 128)');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(0, 128, 128)',
    );
    await expect(
      page.getByRole('link', {
        name: /Overview|Facility zones|Analytics|Simulation|Alerts|QR/,
      }),
    ).toHaveCount(0);
  }
  await open(page);
  await expect(
    page.getByRole('button', { name: 'Browse images…' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await expect(page.getByLabel('Welding helmet')).toBeVisible();
  await expect(
    page.getByLabel('Protective gloves', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Required equipment' })
    .getByRole('button', { name: 'OK', exact: true })
    .click();
  await page.screenshot({ path: '.runtime/retro-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('fixture-driven UI: batch upload, full person inventories, uncertainty, pane scrolling, report and reanalysis', async ({
  page,
}) => {
  const buffer = await sharp({
    create: { width: 480, height: 320, channels: 3, background: '#eee' },
  })
    .png()
    .toBuffer();
  const ids = [
    '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000003',
  ];
  let uploads = 0,
    checklistSeen = false;
  const rows: Inspection[] = [];
  function record(id: string, original_name: string): Inspection {
    return {
      id,
      original_name,
      zone_id: '20000000-0000-4000-8000-000000000001',
      mode: 'REAL',
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
      requirements: {
        helmetRequired: false,
        vestRequired: false,
        equipment: ['Protective gloves'],
      },
      image_deleted: false,
      error: null,
      attempts: 1,
      width: 480,
      height: 320,
      reviews: [],
      result: {
        mode: 'REAL',
        analysisType: 'vision',
        provider: 'Google Gemini',
        modelVersion: 'gemini-2.5-flash',
        summary: 'Test fixture: two workers with visible equipment.',
        processingMs: 1200,
        width: 480,
        height: 320,
        coordinateSystem: 'xyxy_pixels',
        detections: [],
        warnings: ['Test fixture observations; no live AI call.'],
        machines: [],
        findings: [
          {
            personId: 'P1',
            description: 'Worker at the left.',
            helmet: 'unknown',
            vest: 'unknown',
            equipment: [
              {
                name: 'Welding helmet',
                category: 'ppe',
                status: 'worn',
                evidence: 'Lowered welding shield.',
              },
              {
                name: 'Protective gloves',
                category: 'ppe',
                status: 'worn',
                evidence: 'Gloves cover both hands.',
              },
              {
                name: 'Coveralls',
                category: 'workwear',
                status: 'worn',
                evidence: 'Dark full-length workwear.',
              },
              {
                name: 'Boots',
                category: 'workwear',
                status: 'worn',
                evidence: 'Visible boots; toe protection is unverifiable.',
              },
              {
                name: 'Welding torch',
                category: 'equipment',
                status: 'carried',
                evidence: 'Torch held in right hand.',
              },
              {
                name: 'Possible earplugs',
                category: 'ppe',
                status: 'uncertain',
                evidence: 'Ears obscured.',
              },
            ],
            requiredChecks: [
              {
                name: 'Protective gloves',
                status: 'observed',
                evidence: 'Both hands have gloves.',
              },
            ],
            limitations: ['Safety certification is unverifiable.'],
          },
          {
            personId: 'P2',
            description: 'Worker at the right.',
            helmet: 'unknown',
            vest: 'unknown',
            equipment: [
              {
                name: 'Hardhat',
                category: 'ppe',
                status: 'worn',
                evidence: 'Hard shell on head.',
              },
            ],
            requiredChecks: [
              {
                name: 'Protective gloves',
                status: 'uncertain',
                evidence: 'Hands outside the frame.',
              },
            ],
            limitations: ['Hands outside the frame.'],
          },
        ],
      },
    };
  }
  await page.route('**/api/workspace', (route) =>
    route.fulfill({
      json: {
        zoneId: '20000000-0000-4000-8000-000000000001',
        inference: {
          ready: true,
          reason: null,
          provider: 'Google Gemini',
          modelVersion: 'gemini-2.5-flash',
        },
      },
    }),
  );
  await page.route('**/api/inspections**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      id = path.split('/')[3];
    if (path.endsWith('/image'))
      return route.fulfill({ contentType: 'image/png', body: buffer });
    if (path.endsWith('/reanalyze')) {
      rows.push(record(ids[2], 'Reanalysis.png'));
      return route.fulfill({ status: 201, json: { id: ids[2] } });
    }
    if (request.method() === 'POST') {
      checklistSeen = (request.postDataBuffer()?.toString() ?? '').includes(
        'Protective gloves',
      );
      const next = record(ids[uploads], `inspection-${++uploads}.png`);
      rows.push(next);
      return route.fulfill({
        status: 201,
        json: { id: next.id, status: 'QUEUED' },
      });
    }
    return route.fulfill({
      json: id ? rows.find((i) => i.id === id) : { rows, page: 0, limit: 20 },
    });
  });
  await open(page);
  await page
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await page.getByLabel('Protective gloves', { exact: true }).check();
  await page
    .getByRole('dialog', { name: 'Required equipment' })
    .getByRole('button', { name: 'OK', exact: true })
    .click();
  await page.getByLabel('Site images').setInputFiles([
    { name: 'inspection-1.png', mimeType: 'image/png', buffer },
    { name: 'inspection-2.png', mimeType: 'image/png', buffer },
  ]);
  await page.getByRole('button', { name: 'Analyze PPE', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View analysis →' })).toHaveCount(
    2,
  );
  expect(checklistSeen).toBe(true);
  await page.getByRole('link', { name: 'View analysis →' }).first().click();
  const analysis = page.locator('.application-frame.focused');
  await expect(
    page
      .getByRole('region', { name: 'Human analysis window' })
      .locator('.requirements-summary'),
  ).toHaveAttribute('title', 'Protective gloves');
  await expect(
    analysis.getByRole('heading', { name: 'Person P1', exact: true }),
  ).toBeVisible();
  for (const item of [
    'Welding helmet',
    'Coveralls',
    'Boots',
    'Welding torch',
    'Possible earplugs',
  ])
    await expect(analysis.getByText(item, { exact: true })).toBeVisible();
  await expect(
    analysis.getByRole('heading', { name: 'Carried equipment 1' }),
  ).toBeVisible();
  await expect(
    analysis.getByRole('heading', { name: 'Uncertain identification 1' }),
  ).toBeVisible();
  await analysis.getByRole('button', { name: 'P2', exact: true }).click();
  await expect(analysis.getByText('Hardhat', { exact: true })).toBeVisible();
  await expect(
    analysis.getByText('Hands outside the frame.').first(),
  ).toBeVisible();
  await analysis.getByRole('button', { name: 'P1', exact: true }).click();
  await checkAnalysisScrolling(analysis);
  const report = page.waitForEvent('download');
  await analysis.getByRole('button', { name: 'Save report' }).click();
  expect((await report).suggestedFilename()).toBe(`safesight-${ids[0]}.json`);
  await page.screenshot({
    path: '.runtime/retro-result-fixture.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await checkAnalysisScrolling(analysis);
  await page.screenshot({ path: '.runtime/human-result-mobile.png' });
  await analysis.getByRole('button', { name: 'Analyze again' }).click();
  await expect(page).toHaveURL(new RegExp(ids[2]));
});
test('missing API key blocks analysis honestly; file validation and settings work without accounts', async ({
  page,
}) => {
  await open(page);
  const workspace = await (await page.request.get('/api/workspace')).json();
  const buffer = await sharp({
    create: { width: 80, height: 80, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Site images')
    .setInputFiles({ name: 'ready.png', mimeType: 'image/png', buffer });
  if (!workspace.inference.ready)
    await expect(
      page.getByRole('button', { name: 'Analyze PPE', exact: true }),
    ).toBeDisabled();
  await page.getByLabel('Site images').setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByText('Use a JPEG, PNG, or WebP image.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Open Settings', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Workspace name')).toBeVisible();
  await expect(page.getByLabel('Time zone', { exact: true })).toBeVisible();
  const auth = (await (await page.request.get('/api/auth/me')).json()) as Auth;
  expect('user' in auth).toBe(false);
  await open(page);
  await page.screenshot({ path: '.runtime/retro-desktop.png', fullPage: true });
});

test('machinery uploads preserve context and show hazards, operator PPE, all precaution phases and multiple machines', async ({
  page,
}) => {
  const id = '90000000-0000-4000-8000-000000000004';
  const context = 'Turning metal on a lathe; model unknown.';
  const buffer = await sharp({
    create: { width: 480, height: 320, channels: 3, background: '#eee' },
  })
    .png()
    .toBuffer();
  const machine = {
    machineId: 'M1',
    name: 'Metalworking lathe',
    identification: 'likely' as const,
    description: 'Test fixture: chuck and bed visible.',
    entanglementRisk: true,
    hazards: [
      {
        name: 'Chuck entanglement',
        basis: 'visible' as const,
        details: 'Test fixture visible chuck.',
      },
      {
        name: 'Flying chips',
        basis: 'typical' as const,
        details: 'Verify the material and process.',
      },
    ],
    recommendedWearables: [
      {
        name: 'Safety glasses',
        category: 'ppe' as const,
        usage: 'recommended' as const,
        purpose: 'Eye protection.',
        condition: 'Select protection for the assessed task.',
      },
      {
        name: 'Handling gloves',
        category: 'ppe' as const,
        usage: 'avoid_during_operation' as const,
        purpose: 'Handling sharp stock.',
        condition: 'Only after safe stopping and isolation.',
      },
    ],
    precautions: [
      {
        phase: 'before_use' as const,
        action: 'Check the machine manual and guards.',
        reason: 'Verify suitability.',
      },
      {
        phase: 'operation' as const,
        action: 'Keep clear of rotating parts.',
        reason: 'Avoid entanglement.',
      },
      {
        phase: 'maintenance' as const,
        action: 'Follow approved energy isolation.',
        reason: 'Prevent unexpected startup.',
      },
      {
        phase: 'emergency' as const,
        action: 'Summon trained assistance and prevent restart.',
        reason: 'Protect everyone nearby.',
      },
    ],
    limitations: ['A photograph cannot verify interlock function.'],
    questions: ['What is the machine model?'],
  };
  const row: Inspection = {
    id,
    original_name: 'lathe.png',
    zone_id: '20000000-0000-4000-8000-000000000001',
    mode: 'REAL',
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    requirements: {
      helmetRequired: false,
      vestRequired: false,
      equipment: [],
      operationContext: `Task: ${context}\nMachine/model: Training lathe\nMaterial: Steel stock\nEnvironment: Indoor workshop`,
    },
    image_deleted: false,
    error: null,
    attempts: 1,
    width: 480,
    height: 320,
    reviews: [],
    result: {
      mode: 'REAL',
      analysisType: 'vision',
      provider: 'Google Gemini',
      modelVersion: 'gemini-3.1-flash-lite',
      promptVersion: 'safety-v2',
      summary: 'Test fixture: machinery without people.',
      processingMs: 100,
      width: 480,
      height: 320,
      coordinateSystem: 'xyxy_pixels',
      detections: [],
      warnings: [],
      findings: [],
      machines: [
        machine,
        {
          ...machine,
          machineId: 'M2',
          name: 'Bench drill',
          description: 'Test fixture: drill spindle.',
        },
      ],
    },
  };
  let contextSeen = false;
  let machineChecklistSeen = false;
  await page.route('**/api/workspace', (route) =>
    route.fulfill({
      json: {
        zoneId: row.zone_id,
        inference: {
          ready: true,
          provider: 'Google Gemini',
          modelVersion: 'gemini-3.1-flash-lite',
        },
      },
    }),
  );
  await page.route('**/api/inspections**', (route) => {
    if (route.request().url().endsWith('/image'))
      return route.fulfill({ contentType: 'image/png', body: buffer });
    if (route.request().method() === 'POST') {
      const multipart = route.request().postDataBuffer()?.toString() ?? '';
      contextSeen = [
        'Assessment focus: Maintenance & isolation',
        'Task: ' + context,
        'Machine/model: Training lathe',
        'Material: Steel stock',
        'Environment: Indoor workshop',
      ].every((value) => multipart.includes(value));
      machineChecklistSeen = /name="requiredEquipment"\r\n\r\n\[\]/.test(
        multipart,
      );
      return route.fulfill({ status: 201, json: { id, status: 'QUEUED' } });
    }
    return route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/inspections'
          ? { rows: [row], page: 0, limit: 20 }
          : row,
    });
  });
  await open(page, 'machinery');
  await page.getByLabel('Task / operation').fill(context);
  await page.getByLabel('Machine / model').fill('Training lathe');
  await page
    .getByLabel('Assessment focus')
    .selectOption('Maintenance & isolation');
  await page.getByText('Material & work environment', { exact: true }).click();
  await page.getByLabel('Material / workpiece').fill('Steel stock');
  await page.getByLabel('Work environment').fill('Indoor workshop');
  await page
    .getByLabel('Site images')
    .setInputFiles({ name: 'lathe.png', mimeType: 'image/png', buffer });
  await page
    .getByRole('button', { name: 'Analyze machinery', exact: true })
    .click();
  await page.getByRole('link', { name: 'View analysis →' }).click();
  expect(contextSeen).toBe(true);
  expect(machineChecklistSeen).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Machinery safety', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Metalworking lathe', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No people identified', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Visible in image', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Typical risk · verify', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Avoid during operation', { exact: true }),
  ).toBeVisible();
  for (const name of [
    'Operator PPE & safety wearables',
    'Before use',
    'During operation',
    'Maintenance & energy isolation',
    'Emergency precautions',
    'Confirm before use',
  ])
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
  await checkAnalysisScrolling(page.locator('.application-frame.focused'));
  await page.screenshot({ path: '.runtime/machinery-result-desktop.png' });
  await page.getByLabel('Precaution phase').selectOption('maintenance');
  await expect(
    page.getByRole('heading', {
      name: 'Maintenance & energy isolation',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Before use', exact: true }),
  ).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(
    page.getByRole('region', { name: 'Safety analysis', exact: true }),
  ).toHaveCSS('overflow-y', 'visible');
  await expect(
    page.getByRole('heading', { name: 'Before use', exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('Precaution phase').selectOption('all');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save report' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.requirements.operationContext).toBe(
    row.requirements.operationContext,
  );
  expect(report.result.machines).toHaveLength(2);
  await page.getByRole('button', { name: 'M2', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Bench drill', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await checkAnalysisScrolling(page.locator('.application-frame.focused'));
  await page.screenshot({ path: '.runtime/machinery-result-mobile.png' });
  await page
    .locator('.application-frame.focused')
    .getByRole('link', { name: '← History', exact: true })
    .click();
  const history = page.getByRole('region', {
    name: 'Inspection history window',
  });
  await expect(history.getByRole('columnheader')).toHaveText([
    'Image',
    'Status',
    'People',
    'Machinery',
    'Saved',
  ]);
  const historyRow = history.getByRole('row').filter({ hasText: 'lathe.png' });
  await expect(historyRow.getByRole('cell').nth(2)).toHaveText('0');
  await expect(historyRow.getByRole('cell').nth(3)).toHaveText('2');
});
test('workspace properties: draft cancellation, validated Apply/OK, clock preview and failed saves', async ({
  page,
}) => {
  await page.goto('/');
  const auth = (await (await page.request.get('/api/auth/me')).json()) as Auth;
  auth.facility = { ...auth.facility, name: 'Workshop', timezone: 'UTC' };
  let writes = 0;
  let fail = false;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/settings', (route) => {
    writes++;
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Settings service unavailable.' } },
      });
    auth.facility = { ...auth.facility, ...route.request().postDataJSON() };
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/workspace', (route) =>
    route.fulfill({
      json: {
        zoneId: null,
        inference: { ready: false, reason: 'Gemini key missing.' },
      },
    }),
  );
  await page.clock.setFixedTime(new Date('2026-10-05T10:20:00Z'));
  await page.goto('/settings');
  const settings = page.getByRole('region', { name: 'Settings window' });
  const launch = () =>
    page.getByRole('button', { name: 'Open Settings', exact: true }).click();
  await expect(
    settings.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeDisabled();
  await expect(
    settings.getByText('Setup required', { exact: true }),
  ).toBeVisible();
  await expect(settings.getByRole('tab')).toHaveCount(0);
  await expect(settings.getByRole('textbox')).toHaveCount(1);
  await expect(settings.getByRole('combobox')).toHaveCount(1);
  await settings.getByLabel('Workspace name').fill('Unsaved workshop');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(settings).toHaveCount(0);
  expect(writes).toBe(0);
  await launch();
  await expect(settings.getByLabel('Workspace name')).toHaveValue('Workshop');
  await settings.getByLabel('Workspace name').fill(' ');
  await expect(settings.getByRole('alert')).toHaveText(
    'Enter a name with at least 3 characters.',
  );
  await expect(
    settings.getByRole('button', { name: 'OK', exact: true }),
  ).toBeDisabled();
  await settings.getByLabel('Workspace name').fill('College workshop');
  const indiaZone = await settings
    .getByLabel('Time zone', { exact: true })
    .locator('option')
    .filter({ hasText: /Asia\/(Calcutta|Kolkata)/ })
    .first()
    .getAttribute('value');
  await settings
    .getByLabel('Time zone', { exact: true })
    .selectOption(indiaZone!);
  await expect(settings.getByLabel('Clock preview')).toHaveText(
    '05 Oct 2026, 15:50',
  );
  await expect(
    page
      .getByRole('contentinfo', { name: 'Taskbar' })
      .getByTestId('taskbar-time'),
  ).toHaveText('10:20 AM');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    settings.getByText('Preferences saved.', { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Apply', exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole('contentinfo', { name: 'Taskbar' })
      .getByTestId('taskbar-time'),
  ).toHaveText('3:50 PM');
  expect(writes).toBe(1);
  await settings.getByLabel('Workspace name').fill('Discard this');
  await settings.getByLabel('Workspace name').press('Escape');
  await expect(settings).toHaveCount(0);
  await launch();
  await expect(settings.getByLabel('Workspace name')).toHaveValue(
    'College workshop',
  );
  await settings.getByLabel('Workspace name').fill('Saved with OK');
  await settings.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(settings).toHaveCount(0);
  expect(writes).toBe(2);
  await launch();
  await expect(settings.getByLabel('Workspace name')).toHaveValue(
    'Saved with OK',
  );
  await settings.getByRole('button', { name: 'OK', exact: true }).click();
  expect(writes).toBe(2);
  await launch();
  fail = true;
  await settings.getByLabel('Workspace name').fill('Failed change');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText(
    'Settings service unavailable.',
  );
  await expect(settings.getByLabel('Workspace name')).toHaveValue(
    'Failed change',
  );
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await launch();
  await expect(settings.getByLabel('Workspace name')).toHaveValue(
    'Saved with OK',
  );
  await page.screenshot({ path: '.runtime/settings-desktop.png' });
  await settings.getByText('Service details & setup', { exact: true }).click();
  await expect(
    settings.getByRole('link', { name: 'Google AI Studio key' }),
  ).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await expect(
    settings.getByRole('button', { name: 'OK', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: '.runtime/settings-mobile.png' });
});

test('computer desktop: icons, live clock, Start menu, independent windows and preserved minimized state', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-10-03T10:20:00Z'));
  await page.goto('/');
  const desktop = page.getByRole('navigation', {
    name: 'Desktop applications',
  });
  await expect(desktop.getByRole('button')).toHaveCount(4);
  await expect(page.locator('.application-frame')).toHaveCount(0);
  const taskbar = page.getByRole('contentinfo', { name: 'Taskbar' });
  await expect(taskbar.getByTestId('taskbar-time')).not.toHaveText('--:--');
  const auth = await (await page.request.get('/api/auth/me')).json();
  const date = new Date('2026-10-03T10:20:00Z');
  const formatTime = (value: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: auth.facility.timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(value);
  await expect(taskbar.getByTestId('taskbar-time')).toHaveText(
    formatTime(date),
  );
  await expect(taskbar.getByTestId('taskbar-date')).toHaveText(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: auth.facility.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
  );
  await page.clock.setFixedTime(new Date('2026-10-03T10:21:00Z'));
  await expect(taskbar.getByTestId('taskbar-time')).toHaveText(
    formatTime(new Date('2026-10-03T10:21:00Z')),
  );
  await expect(page.locator('body')).toHaveCSS('cursor', /cursors\/arrow.svg/);
  for (const cursor of ['arrow', 'text', 'hand', 'move'])
    expect((await page.request.get(`/cursors/${cursor}.svg`)).status()).toBe(
      200,
    );
  await page.screenshot({ path: '.runtime/computer-desktop.png' });
  await desktop
    .getByRole('button', { name: 'Open Human analysis', exact: true })
    .click();
  const human = page.getByRole('region', { name: 'Human analysis window' });
  await expect(
    human.getByRole('heading', { name: 'Human analysis', exact: true }),
  ).toBeVisible();
  await human
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await human.getByLabel('Other required equipment').fill('Knee pads');
  await expect(human.getByLabel('Other required equipment')).toHaveCSS(
    'cursor',
    /cursors\/text.svg/,
  );
  await human
    .getByRole('dialog', { name: 'Required equipment' })
    .getByRole('button', { name: 'OK', exact: true })
    .click();
  await human
    .getByLabel('Work activity')
    .fill('Worker changing tools after isolation.');
  const title = human.locator('.titlebar');
  const before = await human.boundingBox();
  const bar = await title.boundingBox();
  await page.mouse.move(bar!.x + 110, bar!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bar!.x + 155, bar!.y + 47, { steps: 5 });
  await page.mouse.up();
  const after = await human.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  expect(after!.y).toBeGreaterThan(before!.y);
  await human
    .getByRole('button', { name: 'Maximize window', exact: true })
    .click();
  await expect(human).toHaveClass(/maximized/);
  expect((await human.boundingBox())!.x).toBe(0);
  await human
    .getByRole('button', { name: 'Restore window', exact: true })
    .click();
  expect((await human.boundingBox())!.x).toBe(after!.x);
  await human
    .getByRole('button', { name: 'Minimize window', exact: true })
    .click();
  await expect(human).toBeHidden();
  await taskbar
    .getByRole('button', { name: 'Human analysis (minimized)', exact: true })
    .click();
  await expect(human).toBeVisible();
  await expect(human.locator('.requirements-summary')).toHaveAttribute(
    'title',
    'Knee pads',
  );
  await desktop
    .getByRole('button', { name: 'Open Machinery analysis', exact: true })
    .click();
  const machinery = page.getByRole('region', {
    name: 'Machinery analysis window',
  });
  await expect(
    machinery.getByRole('heading', { name: 'Machinery analysis', exact: true }),
  ).toBeVisible();
  await machinery.getByLabel('Machine / model').fill('Workshop lathe');
  await expect(human.locator('.requirements-summary')).toHaveAttribute(
    'title',
    'Knee pads',
  );
  await taskbar
    .getByRole('button', { name: 'Human analysis', exact: true })
    .click();
  await expect(human).toHaveClass(/focused/);
  await expect(machinery).toHaveClass(/unfocused/);
  await taskbar
    .getByRole('button', { name: 'Human analysis', exact: true })
    .click();
  await expect(human).toBeHidden();
  await taskbar.getByRole('button', { name: 'Start', exact: true }).click();
  const start = page.locator('.start-menu');
  await expect(start).toBeVisible();
  await start.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Settings window' });
  await expect(
    settings.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  await expect(start).toHaveCount(0);
  await taskbar.getByRole('button', { name: /^Date and time:/ }).click();
  const clock = page.getByRole('dialog', { name: 'Date / Time Properties' });
  await expect(clock).toBeVisible();
  await expect(
    clock.getByText(auth.facility.timezone, { exact: true }),
  ).toBeVisible();
  await clock.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(clock).toBeHidden();
  await settings
    .getByRole('button', { name: 'Close window', exact: true })
    .click();
  await expect(settings).toHaveCount(0);
  await expect(
    taskbar.getByRole('button', { name: 'Settings', exact: true }),
  ).toHaveCount(0);
  await taskbar.getByRole('button', { name: 'Start', exact: true }).click();
  await start
    .getByRole('button', { name: 'Show desktop', exact: true })
    .click();
  await expect(page.locator('.application-frame:visible')).toHaveCount(0);
  await taskbar
    .getByRole('button', {
      name: 'Machinery analysis (minimized)',
      exact: true,
    })
    .click();
  await expect(machinery.getByLabel('Machine / model')).toHaveValue(
    'Workshop lathe',
  );
  await page.screenshot({ path: '.runtime/computer-windows.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await expect(taskbar.getByTestId('taskbar-date')).toBeVisible();
  await machinery
    .getByRole('button', { name: 'Minimize window', exact: true })
    .click();
  await taskbar.getByRole('button', { name: 'Start', exact: true }).click();
  await start
    .getByRole('button', { name: 'Human analysis', exact: true })
    .click();
  await expect(human.locator('.requirements-summary')).toHaveAttribute(
    'title',
    'Knee pads',
  );
  await page.screenshot({ path: '.runtime/computer-mobile.png' });
  expect(errors).toEqual([]);
});

test('minimal classic workspaces: photograph inspection, requirement dialog, task focus and history-only records', async ({
  page,
}) => {
  const listRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/inspections' && request.method() === 'GET')
      listRequests.push(url.search);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const human = page.getByRole('region', { name: 'Human analysis window' });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('12px WIN95FA'))).toBe(
    true,
  );
  await expect(page.locator('html')).toHaveCSS('font-family', /WIN95FA/);
  for (const button of ['Minimize window', 'Maximize window', 'Close window']) {
    await expect(
      human.getByRole('button', { name: button, exact: true }),
    ).toHaveCSS('height', '18px');
    await expect(
      human.getByRole('button', { name: button, exact: true }),
    ).toHaveCSS('padding', '0px');
  }
  await expect(human.locator('.photo-properties')).not.toContainText(
    'undefined',
  );
  await expect(human.getByRole('checkbox')).toHaveCount(0);
  await expect(human.getByLabel('Work activity')).toBeVisible();
  await expect(human.locator('.section-heading')).toHaveCount(0);
  await expect(
    human.getByRole('button', { name: 'Analyze PPE', exact: true }),
  ).toBeVisible();
  await expect(human.locator('.photo-file-list')).toBeVisible();
  await human
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  const requirements = page.getByRole('dialog', {
    name: 'Required equipment',
    exact: true,
  });
  for (const name of ['Head & face', 'Body & hands', 'Footwear'])
    await expect(
      requirements.getByRole('group', { name, exact: true }),
    ).toBeVisible();
  await requirements.getByLabel('Protective gloves', { exact: true }).check();
  await requirements.getByLabel('Other required equipment').fill('Knee pads');
  await requirements
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(human.locator('.requirements-summary')).toHaveText(
    'Inventory all equipment',
  );
  await human
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await expect(
    requirements.getByLabel('Protective gloves', { exact: true }),
  ).not.toBeChecked();
  await requirements.getByLabel('Hardhat', { exact: true }).check();
  await requirements.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(human.locator('.requirements-summary')).toHaveAttribute(
    'title',
    'Hardhat',
  );
  await human
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await expect(
    requirements.getByLabel('Hardhat', { exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(requirements).toHaveCount(0);
  const photos = await Promise.all(
    ['#c0c0c0', '#000080'].map((background) =>
      sharp({ create: { width: 480, height: 240, channels: 3, background } })
        .png()
        .toBuffer(),
    ),
  );
  const files = photos.map((buffer, index) => ({
    name: `photo-${index + 1}.png`,
    mimeType: 'image/png',
    buffer,
  }));
  await human.getByLabel('Site images').setInputFiles(files);
  await expect(human.locator('.human-photo-stage img')).toHaveAttribute(
    'alt',
    'photo-1.png',
  );
  await human
    .getByRole('button', { name: 'Preview photo-2.png', exact: true })
    .click();
  await expect(human.locator('.human-photo-stage img')).toHaveAttribute(
    'alt',
    'photo-2.png',
  );
  await human.getByLabel('Photo zoom').selectOption('200');
  await expect(human.locator('.human-photo-stage img')).toHaveCSS(
    'width',
    '960px',
  );
  await human.getByLabel('Photo zoom').selectOption('fit');
  await expect(human.locator('.photo-properties')).toContainText('480 × 240');
  await page.screenshot({ path: '.runtime/human-researched-desktop.png' });
  expect(listRequests).toEqual([]);
  await page
    .getByRole('button', { name: 'Open Machinery analysis', exact: true })
    .click();
  const machinery = page.getByRole('region', {
    name: 'Machinery analysis window',
  });
  await expect(machinery.getByRole('checkbox')).toHaveCount(0);
  await expect(
    machinery.getByRole('heading', { name: 'Safety assessment', exact: true }),
  ).toBeVisible();
  for (const name of [
    'Assessment focus',
    'Task / operation',
    'Machine / model',
  ])
    await expect(machinery.getByLabel(name, { exact: true })).toBeVisible();
  await expect(machinery.getByLabel('Work environment')).toBeHidden();
  await machinery
    .getByText('Material & work environment', { exact: true })
    .click();
  await machinery.getByLabel('Assessment focus').selectOption('Before use');
  await machinery.getByLabel('Task / operation').fill('Drilling steel plate');
  await machinery.getByLabel('Machine / model').fill('Bench drill');
  await machinery.getByLabel('Material / workpiece').fill('Steel');
  await machinery.getByLabel('Work environment').fill('Indoor workshop');
  const caption = await machinery
    .getByRole('heading', { name: 'Safety assessment', exact: true })
    .boundingBox();
  const fields = await machinery
    .locator('.machine-context-fields')
    .boundingBox();
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(fields!.y);
  await machinery.getByLabel('Site images').setInputFiles(files);
  await machinery
    .getByRole('button', { name: 'Preview photo-2.png', exact: true })
    .click();
  await expect(machinery.locator('.machine-photo-stage img')).toHaveAttribute(
    'alt',
    'photo-2.png',
  );
  await machinery.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(machinery.locator('.machine-photo-stage img')).toHaveAttribute(
    'alt',
    'photo-1.png',
  );
  await expect(
    machinery.getByRole('button', { name: 'Preview photo-2.png', exact: true }),
  ).toHaveCount(0);
  for (const app of [human, machinery]) {
    await expect(
      app.getByText('Recent inspections', { exact: true }),
    ).toHaveCount(0);
    await expect(app.locator('table')).toHaveCount(0);
    await expect(
      app.locator('h1,h2,h3,label').filter({ hasText: '(optional)' }),
    ).toHaveCount(0);
  }
  expect(listRequests).toEqual([]);
  await page.screenshot({ path: '.runtime/machinery-researched-desktop.png' });
  await page
    .getByRole('contentinfo', { name: 'Taskbar' })
    .getByRole('button', { name: 'Human analysis', exact: true })
    .click();
  await human.evaluate((element) => {
    element.style.width = '650px';
    element.style.height = '400px';
  });
  await expect(human.getByLabel('Work activity')).toBeVisible();
  await expect(
    human.getByRole('button', { name: 'Analyze PPE', exact: true }),
  ).toBeVisible();
  const photographArea = await human
    .locator('.human-inspection-layout')
    .boundingBox();
  const activity = await human.getByLabel('Work activity').boundingBox();
  expect(photographArea!.y + photographArea!.height).toBeLessThanOrEqual(
    activity!.y,
  );
  await human.evaluate((element) => {
    element.style.width = '';
    element.style.height = '';
  });
  await page
    .getByRole('contentinfo', { name: 'Taskbar' })
    .getByRole('button', { name: 'Machinery analysis', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await machinery
    .getByRole('button', { name: 'Analyze machinery', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    machinery.getByRole('button', { name: 'Analyze machinery', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '.runtime/machinery-researched-mobile.png' });
  await machinery.getByLabel('Work environment').scrollIntoViewIfNeeded();
  await expect(machinery.getByLabel('Work environment')).toHaveValue(
    'Indoor workshop',
  );
  const taskbar = page.getByRole('contentinfo', { name: 'Taskbar' });
  await taskbar
    .getByRole('button', { name: 'Human analysis', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
  await expect(
    human.getByRole('button', { name: 'Analyze PPE', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: '.runtime/human-researched-mobile.png' });
  await human
    .getByRole('button', { name: 'Required equipment…', exact: true })
    .click();
  await expect(requirements).toBeVisible();
  await expect(
    requirements.getByRole('button', { name: 'OK', exact: true }),
  ).toBeVisible();
  await requirements
    .getByRole('button', { name: 'Clear requirements', exact: true })
    .click();
  await requirements.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(human.locator('.requirements-summary')).toHaveText(
    'Inventory all equipment',
  );
  await taskbar.getByRole('button', { name: 'Start', exact: true }).click();
  await page
    .locator('.start-menu')
    .getByRole('button', { name: 'Inspection history', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Inspection history', exact: true }),
  ).toBeVisible();
  await expect.poll(() => listRequests.length).toBeGreaterThan(0);
});

test('current batch tracks queued, analyzing, complete and failed jobs, stops polling finished jobs and clears files', async ({
  page,
}) => {
  const buffer = await sharp({
    create: { width: 480, height: 320, channels: 3, background: '#eee' },
  })
    .png()
    .toBuffer();
  const ids = [
    '90000000-0000-4000-8000-000000000011',
    '90000000-0000-4000-8000-000000000012',
  ];
  let uploads = 0;
  const state: Record<string, Inspection['status']> = {};
  const reads: Record<string, number> = {};
  await page.route('**/api/inspections**', async (route) => {
    const request = route.request(),
      id = new URL(request.url()).pathname.split('/')[3];
    if (request.method() === 'POST') {
      const next = ids[uploads++];
      state[next] = 'QUEUED';
      return route.fulfill({
        status: 201,
        json: { id: next, status: 'QUEUED' },
      });
    }
    reads[id] = (reads[id] ?? 0) + 1;
    const row: Inspection = {
      id,
      zone_id: '90000000-0000-4000-8000-000000000010',
      status: state[id],
      mode: 'REAL',
      created_at: new Date().toISOString(),
      requirements: {
        helmetRequired: false,
        vestRequired: false,
        equipment: [],
      },
      result: null,
      error:
        state[id] === 'FAILED'
          ? 'Test fixture: free quota exhausted. Retry later.'
          : null,
      attempts: 1,
      width: 480,
      height: 320,
      image_deleted: false,
      original_name: 'batch-photo.png',
    };
    return route.fulfill({
      json:
        new URL(route.request().url()).pathname === '/api/inspections'
          ? { rows: [row], page: 0, limit: 20 }
          : row,
    });
  });
  await open(page);
  const human = page.getByRole('region', { name: 'Human analysis window' });
  await human.getByLabel('Site images').setInputFiles(
    ids.map((_, i) => ({
      name: `batch-${i + 1}.png`,
      mimeType: 'image/png',
      buffer,
    })),
  );
  await human.getByRole('button', { name: 'Analyze PPE', exact: true }).click();
  await expect(
    human.locator('.file-job-status').filter({ hasText: 'Queued' }),
  ).toHaveCount(2);
  await expect(
    human.getByRole('progressbar', { name: 'Analysis progress' }),
  ).toHaveAttribute('value', '0');
  for (const id of ids) state[id] = 'PROCESSING';
  await expect(
    human.locator('.file-job-status').filter({ hasText: 'Analyzing…' }),
  ).toHaveCount(2);
  state[ids[0]] = 'COMPLETED';
  state[ids[1]] = 'FAILED';
  await expect(
    human.locator('.file-job-status').filter({ hasText: 'Complete' }),
  ).toHaveCount(1);
  await expect(
    human.locator('.file-job-status').filter({ hasText: 'Analysis failed' }),
  ).toHaveCount(1);
  await expect(
    human.getByRole('progressbar', { name: 'Analysis progress' }),
  ).toHaveAttribute('value', '2');
  await expect(human.locator('.batch-progress')).toContainText(
    '2 of 2 finished',
  );
  await expect(
    human.getByRole('link', { name: 'View analysis →' }),
  ).toHaveCount(2);
  await human
    .getByRole('button', { name: 'Preview batch-2.png', exact: true })
    .click();
  await expect(human.getByRole('alert')).toHaveText(
    'Test fixture: free quota exhausted. Retry later.',
  );
  const terminalReads = { ...reads };
  // Wait longer than the three-second polling interval to verify terminal jobs stop.
  await page.waitForTimeout(3500);
  expect(reads).toEqual(terminalReads);
  await human.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(
    human.getByRole('link', { name: 'View analysis →' }),
  ).toHaveCount(0);
  await expect(human.getByRole('progressbar')).toHaveCount(0);
  await expect(
    human.getByRole('button', { name: 'Analyze PPE', exact: true }),
  ).toBeDisabled();
});
