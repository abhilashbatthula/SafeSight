import { db, pool, schema } from '../packages/db/src';
async function main() {
  if (
    process.env.APP_MODE !== 'development' ||
    process.env.NODE_ENV === 'production'
  )
    throw new Error(
      'Development seeding requires APP_MODE=development and non-production NODE_ENV',
    );
  const facilityId =
    process.env.APP_FACILITY_ID || '10000000-0000-4000-8000-000000000001';
  await db
    .insert(schema.facilities)
    .values({
      id: facilityId,
      name: 'Pune Operations',
      timezone: 'Asia/Kolkata',
    })
    .onConflictDoNothing();
  await pool.query(
    "UPDATE facilities SET name='Pune Operations' WHERE id=$1 AND name='Pune Operations · Demo Facility'",
    [facilityId],
  );
  await db
    .insert(schema.zones)
    .values({
      id: '20000000-0000-4000-8000-000000000001',
      facilityId,
      name: 'Image inspections',
      ppeAlertsEnabled: false,
    })
    .onConflictDoNothing();
  console.log(
    'Workspace initialized. Existing inspections and facility data preserved.',
  );
}
main().finally(() => pool.end());
