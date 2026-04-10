/**
 * Run all pending migrations in order.
 *
 * Usage:
 *   npx tsx scripts/run-all-migrations.ts           # apply pending migrations
 *   npx tsx scripts/run-all-migrations.ts --dry-run  # show what would run
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}

import { config } from 'dotenv';
import { resolve } from 'path';
import { readdirSync, readFileSync } from 'fs';
import pg from 'pg';

config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('No SUPABASE_DB_URL'); process.exit(1); }

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const migrationsDir = resolve(__dirname, '../supabase/migrations');
  const allFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Get already-applied migrations
  let applied = new Set<string>();
  try {
    const { rows } = await client.query('SELECT filename FROM public.schema_migrations');
    applied = new Set(rows.map(r => r.filename));
  } catch (err: any) {
    if (err.code !== '42P01') throw err;
    // schema_migrations doesn't exist yet — all migrations are pending
  }

  const pending = allFiles.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date');
    await client.end();
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);
  for (const file of pending) {
    console.log(`  ${dryRun ? '🔍' : '⏳'} ${file}`);
  }

  if (dryRun) {
    console.log('\n(dry run — no changes applied)');
    await client.end();
    return;
  }

  console.log('');

  for (const file of pending) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
    try {
      await client.query(sql);
      // Record as applied
      try {
        await client.query(
          'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [file]
        );
      } catch {
        // bootstrap migration seeds itself
      }
      console.log(`✅ ${file}`);
    } catch (err: any) {
      console.error(`\n❌ ${file} failed:`, err.message);
      if (err.position) {
        const pos = parseInt(err.position);
        const context = sql.substring(Math.max(0, pos - 100), pos + 100);
        console.error('Near:', context);
      }
      console.error('\nStopping — fix the issue and re-run.');
      await client.end();
      process.exit(1);
    }
  }

  console.log(`\n✅ All ${pending.length} migration(s) applied successfully`);
  await client.end();
}

main();
