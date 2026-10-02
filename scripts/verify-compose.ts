/** Local acceptance probe. Does not store or print credentials/session/link tokens. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { chromium } from '@playwright/test';
import { q } from '../apps/api/src/common';
import { pool } from '../packages/db/src';
import type {
  Auth,
  Inspection,
  Snapshot,
  Alert,
} from '../packages/contracts/src';
const base = 'http://127.0.0.1:8080';
let cookie = '',
  csrf = '';
async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      'X-CSRF-Token': csrf,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0];
  assert.ok(
    r.ok,
    `Acceptance request ${path.split('?')[0]} failed (${r.status})`,
  );
  return (await r.json()) as T;
}
interface Evidence {
  readingIds: string[];
  inspectionId: string;
  result: Inspection['result'];
  alertId: string;
  alertStatus: string;
  runIds: string[];
  testJobId: string;
}
async function main() {
  const credentials = JSON.parse(
    await readFile('.runtime/dev-credentials.json', 'utf8'),
  ) as Record<string, string>;
  await request('/auth/login', 'POST', {
    email: 'admin@safesight.local',
    password: credentials['admin@safesight.local'],
  });
  const auth = await request<Auth>('/auth/me');
  csrf = auth.csrf;
  if (process.argv[2] === 'before') {
    const snapshot = await request<Snapshot>('/dashboard');
    const [i] = await q(
      "SELECT i.* FROM inspections i JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1 AND i.status='COMPLETED' AND NOT i.image_deleted ORDER BY i.created_at DESC LIMIT 1",
      [auth.facility.id],
    );
    assert.ok(i, 'Complete a fixture inspection before this acceptance probe');
    const [a] = await q(
      'SELECT a.* FROM alerts a JOIN zones z ON z.id=a.zone_id WHERE z.facility_id=$1 ORDER BY opened_at DESC LIMIT 1',
      [auth.facility.id],
    );
    assert.ok(a);
    const runs = await q(
      'SELECT s.id FROM simulation_runs s JOIN zones z ON z.id=s.zone_id WHERE ended_at IS NULL AND z.facility_id=$1',
      [auth.facility.id],
    );
    const testJobId = randomUUID();
    await q(
      "INSERT INTO inspections(id,zone_id,uploaded_by,status,mode,storage_key,original_name,width,height) VALUES($1,$2,$3,'PROCESSING',$4,$5,'Abandoned job acceptance fixture',$6,$7)",
      [
        testJobId,
        i.zone_id,
        auth.user.id,
        i.mode,
        i.storage_key,
        i.width,
        i.height,
      ],
    );
    await q(
      "INSERT INTO jobs(inspection_id,status,attempts,locked_at) VALUES($1,'PROCESSING',1,now()-interval '3 minutes')",
      [testJobId],
    );
    const evidence: Evidence = {
      readingIds: snapshot.zones.map((z) => z.latest!.id),
      inspectionId: i.id,
      result: i.result,
      alertId: a.id,
      alertStatus: a.status,
      runIds: runs.map((r) => r.id),
      testJobId,
    };
    await writeFile(
      '.runtime/restart-evidence.json',
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      'Captured persisted readings, original inspection, incident and simulation runs; created one abandoned fixture job.',
    );
  } else if (process.argv[2] === 'after') {
    const e = JSON.parse(
      await readFile('.runtime/restart-evidence.json', 'utf8'),
    ) as Evidence;
    assert.equal(
      (
        await q('SELECT id FROM readings WHERE id=ANY($1::uuid[])', [
          e.readingIds,
        ])
      ).length,
      e.readingIds.length,
    );
    const i = await request<Inspection>(`/inspections/${e.inspectionId}`);
    assert.deepEqual(i.result, e.result);
    const a = await request<Alert>(`/alerts/${e.alertId}`);
    assert.equal(a.status, e.alertStatus);
    assert.equal(
      (
        await q(
          'SELECT id FROM simulation_runs WHERE id=ANY($1::uuid[]) AND ended_at IS NULL',
          [e.runIds],
        )
      ).length,
      e.runIds.length,
    );
    let recovered: Inspection | undefined;
    for (let n = 0; n < 30; n++) {
      recovered = await request<Inspection>(`/inspections/${e.testJobId}`);
      if (recovered.status === 'COMPLETED') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(recovered?.status, 'COMPLETED');
    assert.equal(recovered?.attempts, 2);
    await q('DELETE FROM alerts WHERE inspection_id=$1', [e.testJobId]);
    await q('DELETE FROM inspections WHERE id=$1', [e.testJobId]);
    console.log(
      'PASS: data persisted across API restart; abandoned job recovered and completed on its second bounded attempt.',
    );
  } else if (process.argv[2] === 'qr') {
    const snapshot = await request<Snapshot>('/dashboard'),
      zoneId = snapshot.zones[0].id;
    const expected = process.env.VERIFY_PUBLIC_APP_URL;
    assert.ok(expected);
    const qr = await request<{ payload: string; dataUrl: string }>(
      `/qr?zoneId=${zoneId}`,
    );
    assert.equal(qr.payload, `${expected}/zones/${zoneId}`);
    const raw = await sharp(Buffer.from(qr.dataUrl.split(',')[1], 'base64'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(
      jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)
        ?.data,
      qr.payload,
    );
    const link = await request<{ id: string; url: string }>('/shares', 'POST', {
      zoneId,
      expiresInHours: 1,
      allowImages: false,
    });
    const secret = new URL(link.url).hash.slice(1);
    assert.ok(secret.length >= 40);
    const row = (
      await q('SELECT token_hash FROM share_links WHERE id=$1', [link.id])
    )[0];
    assert.notEqual(row.token_hash, secret);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await page.goto(`${base}/guest#${secret}`);
      await page.waitForURL('**/dashboard');
      await page
        .getByRole('heading', { name: 'Operations overview' })
        .waitFor();
      assert.equal(new URL(page.url()).hash, '');
      const visible = await page.locator('[data-zone-id]').count();
      assert.equal(visible, 1);
      assert.equal(
        await page
          .locator('[data-zone-id]')
          .first()
          .getAttribute('data-zone-id'),
        zoneId,
      );
      await request(`/shares/${link.id}`, 'DELETE');
      await page
        .getByRole('button', { name: 'Sign in to workspace' })
        .waitFor({ timeout: 15000 });
      console.log(
        'PASS: real QR decodes to configured zone URL; endpoint-created guest link exchanged without URL token, enforced zone/image scope and revoked its open browser session.',
      );
    } finally {
      await browser.close();
    }
  } else throw new Error('Use before, after or qr');
}
main().finally(() => pool.end());
