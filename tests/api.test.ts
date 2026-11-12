import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { q, hash, token, workspaceFacilityId } from '../apps/api/src/common';
import { pool } from '../packages/db/src';
import type { Auth, Inspection } from '../packages/contracts/src';
const base = process.env.TEST_APP_URL || 'http://127.0.0.1:8080';
const exerciseInference = process.env.TEST_VISION_PROVIDER === 'mock';
class Client {
  cookie = '';
  csrf = '';
  async request(
    path: string,
    method = 'GET',
    body?: unknown,
    csrf = true,
    origin = base,
  ) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: this.cookie,
        ...(csrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return response;
  }
  async json<T>(path: string) {
    const response = await this.request(path);
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()) as T;
  }
  async open() {
    const response = await this.request('/auth/me');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /HttpOnly/);
    const auth = (await response.json()) as Auth;
    assert.equal(auth.workspace.id, workspaceFacilityId());
    assert.equal('user' in auth, false);
    this.csrf = auth.csrf;
    return auth;
  }
}
async function completed(client: Client, id: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const inspection = await client.json<Inspection>(`/inspections/${id}`);
    if (['COMPLETED', 'FAILED'].includes(inspection.status)) {
      assert.equal(
        inspection.status,
        'COMPLETED',
        inspection.error || 'Inference failed',
      );
      return inspection;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Analysis did not complete');
}
test(
  'shared workspace: no accounts, protected mutations, real image jobs, requirements, review and isolation',
  { timeout: 180000 },
  async (t) => {
    const client = new Client(),
      other = new Client(),
      zoneId = randomUUID(),
      foreignId = randomUUID(),
      foreignZone = randomUUID();
    const inspectionIds: string[] = [];
    try {
      await client.open();
      await other.open();
      await q('INSERT INTO zones(id,facility_id,name) VALUES($1,$2,$3)', [
        zoneId,
        workspaceFacilityId(),
        'Image analysis verification',
      ]);
      await q('INSERT INTO facilities(id,name,timezone) VALUES($1,$2,$3)', [
        foreignId,
        'Isolated facility',
        'UTC',
      ]);
      await q('INSERT INTO zones(id,facility_id,name) VALUES($1,$2,$3)', [
        foreignZone,
        foreignId,
        'Foreign zone',
      ]);
      await t.test(
        'workspace boots without login and sessions are anonymous and hashed',
        async () => {
          const [session] = await q(
            'SELECT * FROM sessions WHERE token_hash=$1',
            [hash(client.cookie.split('=')[1])],
          );
          assert.equal(session.user_id, null);
          assert.equal(session.share_id, null);
          assert.notEqual(client.cookie, other.cookie);
          assert.equal(
            (await client.request('/auth/login', 'POST', {})).status,
            404,
          );
          const workspace = await client.json<{
            zoneId: string;
            inference: { ready: boolean; provider: string };
          }>('/workspace');
          assert.equal(typeof workspace.inference.ready, 'boolean');
          assert.equal(workspace.inference.provider, 'Google Gemini');
          assert.notEqual(workspace.zoneId, foreignZone);
          for (const path of [
            '/dashboard',
            '/simulation/reset',
            '/alerts',
            '/qr',
          ])
            assert.equal((await client.request(path)).status, 404);
        },
      );
      await t.test(
        'same-origin and session-specific CSRF are required for every write',
        async () => {
          const preferences = (await client.json<Auth>('/auth/me')).facility;
          assert.equal(
            (await client.request('/settings', 'PATCH', preferences, false))
              .status,
            403,
          );
          assert.equal(
            (
              await client.request(
                '/settings',
                'PATCH',
                preferences,
                true,
                'https://foreign.invalid',
              )
            ).status,
            403,
          );
          const csrf = client.csrf;
          client.csrf = other.csrf;
          assert.equal(
            (await client.request('/settings', 'PATCH', preferences)).status,
            403,
          );
          client.csrf = csrf;
          assert.equal(
            (await client.request('/settings', 'PATCH', preferences)).status,
            200,
          );
          assert.equal(
            (await client.request(`/inspections?zoneId=${foreignZone}`)).status,
            403,
          );
          assert.equal((await new Client().request('/workspace')).status, 401);
          const response = await fetch(`${base}/api/auth/me`, {
            headers: { 'Sec-Fetch-Site': 'cross-site' },
          });
          assert.equal(response.status, 403);
        },
      );
      const image = await sharp({
        create: {
          width: 320,
          height: 240,
          channels: 4,
          background: { r: 44, g: 55, b: 66, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      function upload(
        bytes: Buffer,
        zone = zoneId,
        equipment: string[] = [],
        operationContext = '',
      ) {
        const form = new FormData();
        form.set('zoneId', zone);
        form.set('requiredEquipment', JSON.stringify(equipment));
        form.set('operationContext', operationContext);
        form.set(
          'image',
          new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
          'site-photo.png',
        );
        return client.request('/inspections', 'POST', form);
      }
      await t.test(
        'image jobs complete through the HTTP test provider with saved equipment selections',
        { skip: !exerciseInference },
        async () => {
          for (const equipment of [
            [],
            ['Protective gloves', 'Welding helmet'],
          ]) {
            const context = 'Workshop activity; machine model unknown.';
            const response = await upload(image, zoneId, equipment, context);
            assert.equal(response.status, 201, await response.clone().text());
            const { id } = (await response.json()) as { id: string };
            inspectionIds.push(id);
            const inspection = await completed(client, id);
            assert.equal(inspection.mode, 'REAL');
            assert.equal(inspection.result?.mode, 'REAL');
            assert.deepEqual(inspection.requirements.equipment, equipment);
            assert.equal(inspection.requirements.operationContext, context);
            assert.deepEqual(inspection.result?.machines, []);
            assert.equal(inspection.result?.promptVersion, 'safety-v2');
            if (!equipment.length)
              assert.deepEqual(inspection.result?.findings, []);
            else {
              const person = inspection.result?.findings[0];
              assert.deepEqual(
                person?.equipment?.map((item) => item.name),
                [
                  'Welding helmet',
                  'Protective gloves',
                  'Boots',
                  'Welding torch',
                ],
              );
              assert.equal(person?.equipment?.[3].status, 'carried');
              assert.deepEqual(
                person?.requiredChecks?.map((check) => check.name).sort(),
                [...equipment].sort(),
              );
            }
            assert.equal(inspection.result?.analysisType, 'vision');
            assert.equal(inspection.result?.provider, 'Google Gemini');
            assert.equal(
              inspection.result?.modelVersion,
              process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
            );
            const delivered = await other.request(`/inspections/${id}/image`);
            assert.equal(delivered.status, 200);
            const stats = await sharp(
              Buffer.from(await delivered.arrayBuffer()),
            ).stats();
            assert.ok(
              stats.channels.every((channel) => channel.mean === 255),
              'Transparent uploads must composite to white',
            );
            const [record] = await q(
              'SELECT uploaded_by,result FROM inspections WHERE id=$1',
              [id],
            );
            assert.equal(record.uploaded_by, null);
            assert.deepEqual(record.result, inspection.result);
          }
        },
      );
      await t.test(
        'reject invalid images, invalid checklists, and foreign zones',
        async () => {
          assert.equal(
            (await upload(image, zoneId, [], 'x'.repeat(1001))).status,
            400,
          );
          assert.equal(
            (await upload(Buffer.from('<script>invalid</script>'))).status,
            400,
          );
          assert.equal(
            (
              await upload(
                image,
                zoneId,
                Array.from({ length: 21 }, (_, i) => `Equipment ${i}`),
              )
            ).status,
            400,
          );
          assert.equal((await upload(image, foreignZone)).status, 403);
          assert.equal(
            (
              await upload(
                await sharp({
                  create: {
                    width: 16,
                    height: 16,
                    channels: 3,
                    background: 'white',
                  },
                })
                  .png()
                  .toBuffer(),
              )
            ).status,
            400,
          );
          assert.equal(
            (await upload(Buffer.alloc(8 * 1024 * 1024 + 1))).status,
            413,
          );
        },
      );
      await t.test(
        'reviews remain append-only, reanalysis creates a new record, and deletion preserves evidence',
        { skip: !exerciseInference },
        async () => {
          const id = inspectionIds[0],
            before = await client.json<Inspection>(`/inspections/${id}`);
          assert.equal(
            (
              await client.request(`/inspections/${id}/reviews`, 'POST', {
                findings: [],
                note: 'Empty scene visually reviewed.',
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await other.request(`/inspections/${id}/reviews`, 'POST', {
                findings: [],
                note: 'Second independent review.',
              })
            ).status,
            201,
          );
          const after = await client.json<Inspection>(`/inspections/${id}`);
          assert.deepEqual(after.result, before.result);
          assert.equal(after.reviews?.length, 2);
          assert.equal(after.reviews?.[0].reviewer_name, 'Workspace review');
          assert.equal(
            (
              await client.request(`/inspections/${id}/reviews`, 'POST', {
                findings: [
                  { personId: 'Made up', helmet: 'detected', vest: 'detected' },
                ],
                note: 'Invalid person',
              })
            ).status,
            400,
          );
          assert.equal(
            (await client.request(`/inspections/${id}/retry`, 'POST')).status,
            409,
          );
          const reanalyzed = await client.request(
            `/inspections/${id}/reanalyze`,
            'POST',
          );
          assert.equal(reanalyzed.status, 201);
          const nextId = ((await reanalyzed.json()) as { id: string }).id;
          inspectionIds.push(nextId);
          assert.notEqual(nextId, id);
          const copied = await completed(client, nextId);
          assert.deepEqual(copied.requirements, before.requirements);
          assert.deepEqual(
            (await client.json<Inspection>(`/inspections/${id}`)).result,
            before.result,
          );
          const search = await client.json<{ rows: Inspection[] }>(
            `/inspections?zoneId=${zoneId}&search=does-not-exist`,
          );
          assert.equal(search.rows.length, 0);
          const exported = await other.request(
            `/exports/inspections?zoneId=${zoneId}&range=1h`,
          );
          assert.equal(exported.status, 200);
          assert.match(await exported.text(), /site-photo.png/);
          assert.equal(
            (await client.request(`/inspections/${id}/image`, 'DELETE')).status,
            200,
          );
          assert.equal(
            (await other.request(`/inspections/${id}/image`)).status,
            404,
          );
          assert.equal(
            (await other.json<Inspection>(`/inspections/${id}`)).reviews
              ?.length,
            2,
          );
        },
      );
      if (!exerciseInference)
        await t.test(
          'unconfigured AI is explicit and never falls back to the detector',
          async () => {
            const workspace = await client.json<{
              inference: { ready: boolean };
            }>('/workspace');
            if (!workspace.inference.ready)
              assert.equal((await upload(image)).status, 400);
          },
        );
      await t.test(
        'legacy or expired sessions cannot access the workspace',
        async () => {
          const expired = token();
          await q(
            "INSERT INTO sessions(token_hash,csrf,facility_id,expires_at) VALUES($1,$2,$3,now()-interval '1 second')",
            [hash(expired), token(), workspaceFacilityId()],
          );
          const old = new Client();
          old.cookie = `safesight_session=${expired}`;
          assert.equal((await old.request('/workspace')).status, 401);
          await old.open();
          assert.equal((await old.request('/workspace')).status, 200);
        },
      );
    } finally {
      const records = await q(
        'SELECT storage_key FROM inspections WHERE zone_id=$1',
        [zoneId],
      );
      const { deleteImage } = await import('../apps/api/src/storage');
      for (const record of records) await deleteImage(record.storage_key);
      await q('DELETE FROM alerts WHERE zone_id=$1', [zoneId]);
      await q('DELETE FROM inspections WHERE zone_id=$1', [zoneId]);
      await q('DELETE FROM zones WHERE id=ANY($1::uuid[])', [
        [zoneId, foreignZone],
      ]);
      await q('DELETE FROM facilities WHERE id=$1', [foreignId]);
      for (const c of [client, other])
        if (c.cookie)
          await q('DELETE FROM sessions WHERE token_hash=$1', [
            hash(c.cookie.split('=')[1]),
          ]);
      await pool.end();
    }
  },
);
