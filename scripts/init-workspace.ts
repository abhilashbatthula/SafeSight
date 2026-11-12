import { db, pool, schema } from '../packages/db/src';
import { settingsSchema } from '../packages/contracts/src';
import { z } from 'zod';
async function main() {
  const mode = process.env.APP_MODE || 'workspace';
  if (
    !['development', 'workspace'].includes(mode) ||
    (mode === 'development' && process.env.NODE_ENV === 'production')
  )
    throw new Error(
      'Workspace initialization requires APP_MODE=workspace, or development mode outside production',
    );
  const facilityId = z
    .uuid()
    .parse(
      process.env.APP_FACILITY_ID || '10000000-0000-4000-8000-000000000001',
    );
  const preferences = settingsSchema.parse({
    name: process.env.WORKSPACE_NAME || 'SafeSight Workspace',
    timezone: process.env.WORKSPACE_TIMEZONE || 'UTC',
  });
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.facilities)
      .values({ id: facilityId, ...preferences })
      .onConflictDoNothing();
    await tx
      .insert(schema.zones)
      .values({
        facilityId,
        name: 'Image inspections',
        ppeAlertsEnabled: false,
      })
      .onConflictDoNothing();
  });
  console.log(
    'Workspace initialized. Existing inspections and facility data preserved.',
  );
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Initialization failed',
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
