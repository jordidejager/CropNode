import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';

config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('No SUPABASE_DB_URL'); process.exit(1); }

const force = process.argv.includes('--force');

async function runMigration(file: string) {
  const sql = readFileSync(resolve(__dirname, '../supabase/migrations', file), 'utf-8');

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();

    // Check if already applied (skip check if schema_migrations doesn't exist yet)
    if (!force) {
      try {
        const { rows } = await client.query(
          'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
          [file]
        );
        if (rows.length > 0) {
          console.log(`⏭️  ${file} — already applied, skipping`);
          return;
        }
      } catch (err: any) {
        // Table doesn't exist yet — this is fine for the bootstrap migration
        if (err.code !== '42P01') throw err;
      }
    }

    console.log(`\n=== Running ${file} ===`);
    await client.query(sql);

    // Record that this migration was applied
    try {
      await client.query(
        'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [file]
      );
    } catch {
      // Table might not exist if this IS the bootstrap migration — that's OK, it seeds itself
    }

    console.log(`✅ ${file} completed`);
  } catch (err: any) {
    console.error(`❌ ${file} failed:`, err.message);
    if (err.position) {
      const pos = parseInt(err.position);
      const context = sql.substring(Math.max(0, pos - 100), pos + 100);
      console.error('Near:', context);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (files.length === 0) {
  console.error('Usage: npx tsx scripts/run-migration.ts <file1> [file2] ...');
  console.error('  --force   Run even if already applied');
  process.exit(1);
}

(async () => {
  for (const file of files) {
    await runMigration(file);
  }
})();
