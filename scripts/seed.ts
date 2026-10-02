import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../packages/db/src';
import { hashPassword } from './password';
async function main() {
  if (
    process.env.APP_MODE !== 'development' ||
    process.env.NODE_ENV === 'production'
  )
    throw new Error(
      'Development seeding requires APP_MODE=development and non-production NODE_ENV',
    );
  const facilityId = '10000000-0000-4000-8000-000000000001';
  await db
    .insert(schema.facilities)
    .values({
      id: facilityId,
      name: 'Pune Operations · Demo Facility',
      timezone: 'Asia/Kolkata',
    })
    .onConflictDoNothing();
  await db
    .insert(schema.facilities)
    .values({
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Authorization test facility',
      timezone: 'UTC',
    })
    .onConflictDoNothing();
  await mkdir('.runtime', { recursive: true });
  let credentials: Record<string, string> = {};
  try {
    credentials = JSON.parse(
      await readFile('.runtime/dev-credentials.json', 'utf8'),
    );
  } catch {
    /* first seed */
  }
  for (const [role, name] of [
    ['ADMIN', 'Demo Admin'],
    ['OFFICER', 'Safety Officer'],
    ['VIEWER', 'Read-only Viewer'],
  ] as const) {
    const email = `${role.toLowerCase()}@safesight.local`;
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (!existing.length) {
      const password = randomBytes(15).toString('base64url');
      credentials[email] = password;
      const [user] = await db
        .insert(schema.users)
        .values({ email, name, passwordHash: hashPassword(password) })
        .returning();
      await db
        .insert(schema.memberships)
        .values({ userId: user.id, facilityId, role })
        .onConflictDoNothing();
    }
  }
  await writeFile(
    '.runtime/dev-credentials.json',
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 },
  );
  for (const [i, name] of [
    'Production Floor',
    'Welding Area',
    'Warehouse',
    'Loading Bay',
    'Chemical Storage',
  ].entries()) {
    const zoneId = `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    await db
      .insert(schema.zones)
      .values({ id: zoneId, facilityId, name })
      .onConflictDoNothing();
    await db
      .insert(schema.simulationRuns)
      .values({ zoneId, scenario: 'normal', seed: 100 + i })
      .onConflictDoNothing();
    for (const [metric, threshold, hysteresis, severity] of [
      ['temperature', 35, 2, 'CRITICAL'],
      ['aqi', 100, 10, 'WARNING'],
      ['stale', 20, 0, 'WARNING'],
    ] as const) {
      await db
        .insert(schema.rules)
        .values({
          zoneId,
          metric,
          threshold,
          hysteresis,
          severity,
          consecutive: metric === 'stale' ? 1 : 3,
          recoveryReadings: 3,
        })
        .onConflictDoNothing();
    }
  }
  console.log(
    'Seed complete; generated credentials in .runtime/dev-credentials.json (not committed). Existing accounts/data preserved.',
  );
}
main().finally(() => pool.end());
