import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { pool } from '../packages/db/src';
import { q, passwordHash, hash, token } from '../apps/api/src/common';
import type {
  Auth,
  Inspection,
  Snapshot,
  Alert,
  Reading,
} from '../packages/contracts/src';
const base = process.env.TEST_APP_URL || 'http://127.0.0.1:8080';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function poll<T>(
  fn: () => Promise<T>,
  check: (v: T) => boolean,
  timeout = 30000,
) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (check(value)) return value;
    await wait(600);
  }
  throw new Error('Timed out waiting for persisted state');
}
class Client {
  cookie = '';
  csrf = '';
  async request(path: string, method = 'GET', body?: unknown, withCsrf = true) {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: {
        Origin: base,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(withCsrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    const cookie = res.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return res;
  }
  async json<T>(path: string) {
    const r = await this.request(path);
    assert.equal(r.status, 200, await r.clone().text());
    return (await r.json()) as T;
  }
  async login(email: string, password: string) {
    const r = await this.request('/auth/login', 'POST', { email, password });
    assert.equal(r.status, 201, await r.clone().text());
    assert.ok(r.headers.get('set-cookie')?.includes('HttpOnly'));
    const me = await this.json<Auth>('/auth/me');
    this.csrf = me.csrf;
    return me;
  }
}
test(
  'live application authorization, jobs, rules, incidents, scoped sessions and persistence',
  { timeout: 180000 },
  async (t) => {
    const facilityId = randomUUID(),
      zoneId = randomUUID(),
      otherZone = randomUUID();
    const userIds: string[] = [];
    const clients: Client[] = [];
    const password = token();
    await q('INSERT INTO facilities(id,name,timezone) VALUES($1,$2,$3)', [
      facilityId,
      'Isolated API verification',
      'Asia/Kolkata',
    ]);
    await q(
      'INSERT INTO zones(id,facility_id,name) VALUES($1,$3,$4),($2,$3,$5)',
      [zoneId, otherZone, facilityId, 'Verification zone', 'Other scoped zone'],
    );
    await q(
      "INSERT INTO simulation_runs(zone_id,scenario,seed) VALUES($1,'normal',42),($2,'normal',43)",
      [zoneId, otherZone],
    );
    await q(
      "INSERT INTO rules(zone_id,metric,threshold,consecutive,hysteresis,recovery_readings,severity) VALUES($1,'temperature',30,3,1,3,'CRITICAL'),($1,'stale',5,1,0,1,'WARNING')",
      [zoneId],
    );
    for (const role of ['ADMIN', 'OFFICER', 'VIEWER']) {
      const id = randomUUID(),
        email = `${id}@test.local`;
      userIds.push(id);
      await q(
        'INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',
        [id, email, role + ' test', passwordHash(password)],
      );
      await q(
        'INSERT INTO memberships(user_id,facility_id,role) VALUES($1,$2,$3)',
        [id, facilityId, role],
      );
      const client = new Client();
      await client.login(email, password);
      clients.push(client);
    }
    const [admin, officer, viewer] = clients;
    let sampleId = '';
    try {
      await t.test(
        'auth, CSRF, cross-facility and role restrictions',
        async () => {
          assert.equal((await new Client().request('/dashboard')).status, 401);
          assert.equal(
            (
              await admin.request(
                '/facilities/10000000-0000-4000-8000-000000000001/dashboard',
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await viewer.request('/simulation', 'POST', {
                zoneId,
                scenario: 'temperature',
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await officer.request('/settings', 'PATCH', {
                name: 'Hacked',
                timezone: 'UTC',
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await admin.request(
                '/simulation',
                'POST',
                { zoneId, scenario: 'normal' },
                false,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await admin.request('/simulation', 'POST', {
                zoneId: 'bad',
                scenario: 'normal',
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        'server persists readings and same clients see the same committed observation',
        async () => {
          await poll(
            () => admin.json<Snapshot>('/dashboard'),
            (s) => s.zones.every((z) => !!z.latest),
          );
          const [a, b] = await Promise.all([
            admin.json<Snapshot>('/dashboard'),
            viewer.json<Snapshot>('/dashboard'),
          ]);
          assert.equal(a.zones[0].latest?.id, b.zones[0].latest?.id);
          assert.equal(a.zones[0].latest?.source, 'SIMULATOR');
          assert.equal(a.zones[0].latest?.aqi_scale, 'SIMULATED_US_AQI');
        },
      );
      await t.test(
        'valid signature upload queues a sample, completes fixture inference, preserves immutable original and review audit',
        async () => {
          const form = new FormData();
          form.set('zoneId', zoneId);
          form.set(
            'image',
            new Blob(
              [
                new Uint8Array(
                  await readFile('services/inference/fixtures/review.png'),
                ),
              ],
              { type: 'image/png' },
            ),
            'review.png',
          );
          const uploaded = await officer.request('/inspections', 'POST', form);
          assert.equal(uploaded.status, 201, await uploaded.clone().text());
          const created = (await uploaded.json()) as {
            id: string;
            status: string;
          };
          sampleId = created.id;
          assert.equal(created.status, 'QUEUED');
          const completed = await poll(
            () => officer.json<Inspection>(`/inspections/${sampleId}`),
            (i) => i.status === 'COMPLETED',
          );
          assert.equal(completed.result?.mode, 'DEMO');
          assert.equal(completed.result?.findings.length, 2);
          const original = JSON.stringify(completed.result);
          assert.equal(
            (await new Client().request(`/inspections/${sampleId}/image`))
              .status,
            401,
          );
          assert.equal(
            (
              await viewer.request(`/inspections/${sampleId}/reviews`, 'POST', {
                findings: completed.result?.findings,
                note: 'test review',
              })
            ).status,
            403,
          );
          const findings = completed.result!.findings;
          assert.equal(
            (
              await officer.request(
                `/inspections/${sampleId}/reviews`,
                'POST',
                { findings, note: 'Confirmed schematic fixture violation' },
              )
            ).status,
            201,
          );
          const corrected = findings.map((f) => ({ ...f, helmet: 'detected' }));
          assert.equal(
            (
              await officer.request(
                `/inspections/${sampleId}/reviews`,
                'POST',
                {
                  findings: corrected,
                  note: 'Corrected after closer inspection',
                },
              )
            ).status,
            201,
          );
          const updated = await officer.json<Inspection>(
            `/inspections/${sampleId}`,
          );
          assert.equal(updated.reviews?.length, 2);
          assert.equal(JSON.stringify(updated.result), original);
        },
      );
      await t.test(
        'PPE requirements are role-protected and change applicable review alerts',
        async () => {
          const config = {
            helmetRequired: false,
            vestRequired: true,
            alertsEnabled: true,
          };
          assert.equal(
            (await viewer.request(`/zones/${zoneId}/ppe`, 'PATCH', config))
              .status,
            403,
          );
          assert.equal(
            (await admin.request(`/zones/${zoneId}/ppe`, 'PATCH', config))
              .status,
            200,
          );
          const form = new FormData();
          form.set('zoneId', zoneId);
          form.set(
            'image',
            new Blob(
              [
                new Uint8Array(
                  await readFile('services/inference/fixtures/review.png'),
                ),
              ],
              { type: 'image/png' },
            ),
            'Optional-helmet fixture.png',
          );
          const response = await officer.request('/inspections', 'POST', form);
          assert.equal(response.status, 201);
          const { id } = (await response.json()) as { id: string };
          const completed = await poll(
            () => officer.json<Inspection>(`/inspections/${id}`),
            (i) => i.status === 'COMPLETED',
          );
          assert.equal(
            (await q('SELECT id FROM alerts WHERE inspection_id=$1', [id]))
              .length,
            0,
          );
          await admin.request(`/zones/${zoneId}/ppe`, 'PATCH', {
            ...config,
            helmetRequired: true,
          });
          assert.equal(
            (
              await officer.request(`/inspections/${id}/reviews`, 'POST', {
                findings: completed.result!.findings,
                note: 'Required helmet confirmed missing in fixture',
              })
            ).status,
            201,
          );
          const [alert] = await q(
            'SELECT * FROM alerts WHERE inspection_id=$1 AND condition_active=true',
            [id],
          );
          assert.equal(alert.severity, 'CRITICAL');
          await officer.request(`/alerts/${alert.id}/actions`, 'POST', {
            action: 'acknowledge',
            note: 'Reviewing explicit snapshot finding',
          });
          await officer.request(`/alerts/${alert.id}/actions`, 'POST', {
            action: 'resolve',
            override: true,
            note: 'Explicit audited active-condition override for acceptance test',
          });
          const overridden = await officer.json<Alert>(`/alerts/${alert.id}`);
          assert.equal(overridden.status, 'RESOLVED');
          assert.equal(overridden.condition_active, true);
          assert.equal(
            (await admin.json<Snapshot>('/dashboard')).zones.find(
              (z) => z.id === zoneId,
            )?.state,
            'critical',
          );
          await admin.request(`/zones/${zoneId}/ppe`, 'PATCH', {
            ...config,
            helmetRequired: true,
            alertsEnabled: false,
          });
          assert.equal(
            (await officer.json<Alert>(`/alerts/${alert.id}`)).condition_active,
            false,
          );
          await admin.request(`/zones/${zoneId}/ppe`, 'PATCH', {
            ...config,
            helmetRequired: true,
            alertsEnabled: true,
          });
        },
      );
      await t.test(
        'invalid signature rejected; arbitrary valid image honestly fails, bounded retries and controlled deletion',
        async () => {
          const bad = new FormData();
          bad.set('zoneId', zoneId);
          bad.set(
            'image',
            new Blob(['not an image'], { type: 'image/png' }),
            'bad.png',
          );
          assert.equal(
            (await officer.request('/inspections', 'POST', bad)).status,
            400,
          );
          const bytes = await sharp({
            create: {
              width: 80,
              height: 80,
              channels: 3,
              background: '#f04f45',
            },
          })
            .png()
            .toBuffer();
          const form = new FormData();
          form.set('zoneId', zoneId);
          form.set(
            'image',
            new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
            'arbitrary.png',
          );
          const r = await officer.request('/inspections', 'POST', form);
          assert.equal(r.status, 201);
          const { id } = (await r.json()) as { id: string };
          let failed = await poll(
            () => officer.json<Inspection>(`/inspections/${id}`),
            (i) => i.status === 'FAILED',
          );
          assert.match(failed.error ?? '', /bundled schematic/);
          for (let n = 2; n <= 3; n++) {
            assert.equal(
              (await officer.request(`/inspections/${id}/retry`, 'POST'))
                .status,
              201,
            );
            failed = await poll(
              () => officer.json<Inspection>(`/inspections/${id}`),
              (i) => i.status === 'FAILED' && i.attempts === n,
            );
          }
          assert.equal(
            (await officer.request(`/inspections/${id}/retry`, 'POST')).status,
            409,
          );
          assert.equal(
            (await officer.request(`/inspections/${id}/image`, 'DELETE'))
              .status,
            200,
          );
          assert.equal(
            (await officer.request(`/inspections/${id}/image`)).status,
            404,
          );
        },
      );
      await t.test(
        'delayed breach, database deduplication, stale state retains critical alert, recovery and audited incident workflow',
        async () => {
          assert.equal(
            (
              await admin.request('/simulation', 'POST', {
                zoneId,
                scenario: 'temperature',
              })
            ).status,
            201,
          );
          const early = await admin.json<{ rows: Alert[] }>('/alerts');
          assert.equal(
            early.rows.filter((a) => a.rule_id && a.severity === 'CRITICAL')
              .length,
            0,
          );
          const breached = await poll(
            () => admin.json<{ rows: Alert[] }>('/alerts'),
            (v) => v.rows.some((a) => !!a.rule_id && a.severity === 'CRITICAL'),
            45000,
          );
          const alert = breached.rows.find(
            (a) => !!a.rule_id && a.severity === 'CRITICAL',
          )!;
          await wait(6000);
          const dedup = await admin.json<{ rows: Alert[] }>('/alerts');
          assert.equal(
            dedup.rows.filter(
              (a) => a.rule_id === alert.rule_id && a.condition_active,
            ).length,
            1,
          );
          assert.equal(
            (
              await officer.request(`/alerts/${alert.id}/actions`, 'POST', {
                action: 'acknowledge',
                note: 'Investigating temperature',
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await officer.request(`/alerts/${alert.id}/actions`, 'POST', {
                action: 'resolve',
                note: 'No override provided',
              })
            ).status,
            409,
          );
          await admin.request('/simulation', 'POST', {
            zoneId,
            scenario: 'interrupted',
          });
          const stale = await poll(
            () => admin.json<Snapshot>('/dashboard'),
            (v) => v.zones.find((z) => z.id === zoneId)?.stale === true,
            15000,
          );
          assert.equal(
            stale.zones.find((z) => z.id === zoneId)?.state,
            'critical',
          );
          await admin.request('/simulation', 'POST', {
            zoneId,
            scenario: 'recovery',
          });
          await poll(
            () => admin.json<Alert>(`/alerts/${alert.id}`),
            (a) => !a.condition_active,
            60000,
          );
          assert.equal(
            (
              await officer.request(`/alerts/${alert.id}/actions`, 'POST', {
                action: 'resolve',
                note: 'Recovered across required consecutive observations',
              })
            ).status,
            201,
          );
          const resolved = await officer.json<Alert>(`/alerts/${alert.id}`);
          assert.equal(resolved.status, 'RESOLVED');
          assert.ok(resolved.recovered_at);
        },
      );
      await t.test(
        'exports are authorized, filtered and private; QR refuses localhost when unconfigured',
        async () => {
          for (const kind of ['readings', 'inspections', 'incidents']) {
            const res = await viewer.request(
              `/exports/${kind}?zoneId=${zoneId}&range=1h`,
            );
            assert.equal(res.status, 200);
            assert.ok(res.headers.get('content-type')?.includes('text/csv'));
            assert.match(await res.text(), /zone_id/);
          }
          if (!process.env.PUBLIC_APP_URL)
            assert.equal((await admin.request('/qr')).status, 400);
          const history = await admin.json<{ rows: Reading[] }>(
            `/history?zoneId=${zoneId}&range=1h`,
          );
          assert.ok(history.rows.length > 0);
          assert.equal((await admin.request('/history?range=999')).status, 400);
        },
      );
      await t.test(
        'guest scope, private images, expiry/revocation on existing SSE and token hashing',
        async () => {
          const secret = token(),
            shareId = randomUUID();
          await q(
            "INSERT INTO share_links(id,facility_id,zone_id,token_hash,expires_at,allow_images,created_by) VALUES($1,$2,$3,$4,now()+interval '1 hour',false,$5)",
            [shareId, facilityId, zoneId, hash(secret), userIds[0]],
          );
          const guest = new Client();
          assert.equal(
            (await guest.request('/shares/exchange', 'POST', { token: secret }))
              .status,
            201,
          );
          const auth = await guest.json<Auth>('/auth/me');
          guest.csrf = auth.csrf;
          assert.equal(auth.user.role, 'GUEST');
          assert.equal(
            (await guest.json<Snapshot>('/dashboard')).zones.length,
            1,
          );
          assert.equal(
            (await guest.request(`/readings?zoneId=${otherZone}`)).status,
            403,
          );
          assert.equal(
            (await guest.request(`/inspections/${sampleId}/image`)).status,
            403,
          );
          assert.equal((await guest.request('/exports/readings')).status, 403);
          assert.equal(
            (
              await guest.request('/simulation', 'POST', {
                zoneId,
                scenario: 'temperature',
              })
            ).status,
            403,
          );
          const controller = new AbortController();
          const stream = await fetch(base + '/api/events', {
            headers: { Cookie: guest.cookie },
            signal: controller.signal,
          });
          assert.equal(stream.status, 200);
          const reader = stream.body!.getReader();
          assert.match(
            new TextDecoder().decode((await reader.read()).value),
            /event: ready/,
          );
          await admin.request(`/shares/${shareId}`, 'DELETE');
          await poll(
            async () => {
              const read = await reader.read();
              return read.done;
            },
            Boolean,
            12000,
          );
          assert.equal((await guest.request('/dashboard')).status, 401);
          controller.abort();
          const exp = token();
          await q(
            "INSERT INTO share_links(facility_id,zone_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()-interval '1 second',$4)",
            [facilityId, zoneId, hash(exp), userIds[0]],
          );
          assert.equal(
            (
              await new Client().request('/shares/exchange', 'POST', {
                token: exp,
              })
            ).status,
            401,
          );
        },
      );
      await t.test(
        'guest expiry terminates an already-open live connection',
        async () => {
          const secret = token(),
            shareId = randomUUID();
          await q(
            "INSERT INTO share_links(id,facility_id,zone_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5)",
            [shareId, facilityId, zoneId, hash(secret), userIds[0]],
          );
          const guest = new Client();
          assert.equal(
            (await guest.request('/shares/exchange', 'POST', { token: secret }))
              .status,
            201,
          );
          const stream = await fetch(base + '/api/events', {
            headers: { Cookie: guest.cookie },
            signal: AbortSignal.timeout(12000),
          });
          const reader = stream.body!.getReader();
          assert.match(
            new TextDecoder().decode((await reader.read()).value),
            /event: ready/,
          );
          await q(
            "UPDATE share_links SET expires_at=now()+interval '1 second' WHERE id=$1",
            [shareId],
          );
          let done = false;
          while (!done) done = !!(await reader.read()).done;
          assert.equal((await guest.request('/dashboard')).status, 401);
        },
      );
      await t.test(
        'login/logout invalidates existing cookie; database evidence exists independently of browser',
        async () => {
          const before = await q(
            'SELECT count(*)::int AS n FROM readings WHERE zone_id=$1',
            [zoneId],
          );
          assert.ok(before[0].n > 0);
          assert.equal(
            (await viewer.request('/auth/logout', 'POST')).status,
            201,
          );
          assert.equal((await viewer.request('/dashboard')).status, 401);
        },
      );
      await t.test(
        'confirmed reset is scoped and preserves accounts and configured requirements',
        async () => {
          const before = await q(
            'SELECT id FROM memberships WHERE facility_id=$1',
            [facilityId],
          );
          assert.equal(
            (
              await admin.request('/simulation/reset', 'POST', {
                confirmation: 'wrong',
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await admin.request('/simulation/reset', 'POST', {
                confirmation: 'RESET DEMO',
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await q(
                'SELECT i.id FROM inspections i JOIN zones z ON z.id=i.zone_id WHERE z.facility_id=$1',
                [facilityId],
              )
            ).length,
            0,
          );
          assert.equal(
            (
              await q('SELECT id FROM memberships WHERE facility_id=$1', [
                facilityId,
              ])
            ).length,
            before.length,
          );
          const current = await admin.json<Snapshot>('/dashboard');
          assert.equal(current.zones.length, 2);
          assert.ok(
            current.zones.every((z) => z.scenario === 'normal' && z.running),
          );
          assert.equal(
            (
              await q('SELECT id FROM facilities WHERE id=$1', [
                '10000000-0000-4000-8000-000000000001',
              ])
            ).length,
            1,
          );
        },
      );
    } finally {
      await q(
        'DELETE FROM alerts WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        [facilityId],
      );
      await q(
        'DELETE FROM inspections WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        [facilityId],
      );
      await q(
        'DELETE FROM readings WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        [facilityId],
      );
      await q(
        'DELETE FROM rules WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        [facilityId],
      );
      await q(
        'DELETE FROM simulation_runs WHERE zone_id IN(SELECT id FROM zones WHERE facility_id=$1)',
        [facilityId],
      );
      await q('DELETE FROM sessions WHERE facility_id=$1', [facilityId]);
      await q('DELETE FROM share_links WHERE facility_id=$1', [facilityId]);
      await q('DELETE FROM zones WHERE facility_id=$1', [facilityId]);
      await q('DELETE FROM memberships WHERE facility_id=$1', [facilityId]);
      await q('DELETE FROM facilities WHERE id=$1', [facilityId]);
      await q('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
      await pool.end();
    }
  },
);
