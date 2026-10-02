import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../packages/db/src';
awaitMain();
async function awaitMain() {
  try {
    await migrate(db, { migrationsFolder: 'packages/db/migrations' });
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}
