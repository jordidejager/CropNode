import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import pg from 'pg';

config({ path: resolve(__dirname, '../.env.local') });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('No SUPABASE_DB_URL'); process.exit(1); }

async function runMigration(file: string) {
  const sql = readFileSync(resolve(__dirname, '../supabase/migrations', file), 'utf-8');
  console.log(`\n=== Running ${file} ===`);
  
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(sql);
    console.log(`✅ ${file} completed`);
  } catch (err: any) {
    console.error(`❌ ${file} failed:`, err.message);
    // Show which statement failed
    if (err.position) {
      const pos = parseInt(err.position);
      const context = sql.substring(Math.max(0, pos - 100), pos + 100);
      console.error('Near:', context);
    }
  } finally {
    await client.end();
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npx tsx scripts/run-migration.ts <file1> [file2] ...');
  process.exit(1);
}

(async () => {
  for (const file of files) {
    await runMigration(file);
  }
})();
