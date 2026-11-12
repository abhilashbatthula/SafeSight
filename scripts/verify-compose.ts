/** Read-only acceptance probe for the active image workspace. */
import assert from 'node:assert/strict';
import type { Auth } from '../packages/contracts/src';
const base = process.env.TEST_APP_URL || 'http://127.0.0.1:8080';
async function main() {
  const response = await fetch(`${base}/api/auth/me`);
  assert.equal(response.status, 200);
  const auth = (await response.json()) as Auth;
  assert.ok(auth.workspace.id);
  assert.equal('user' in auth, false);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  for (const path of ['/workspace', '/inspections?limit=1', '/settings']) {
    const result = await fetch(base + '/api' + path, {
      headers: { Cookie: cookie },
    });
    assert.equal(result.status, 200, path);
  }
  for (const path of [
    '/auth/login',
    '/dashboard',
    '/alerts',
    '/simulation/reset',
    '/qr',
  ]) {
    const result = await fetch(base + '/api' + path, {
      headers: { Cookie: cookie },
    });
    assert.equal(result.status, 404, path);
  }
  console.log(
    'PASS: account-free image workspace, history and settings; retired prototype routes are unavailable.',
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Acceptance check failed',
  );
  process.exitCode = 1;
});
