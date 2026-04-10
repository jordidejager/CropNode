#!/usr/bin/env npx tsx
/**
 * Run raw SQL against the Supabase database via pg driver.
 * Usage:
 *   npx tsx scripts/run-sql.ts "SELECT count(*) FROM knowledge_articles"
 *   npx tsx scripts/run-sql.ts --file supabase/migrations/048_fix_vector_index.sql
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import pg from 'pg';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set');
  process.exit(1);
}

const args = process.argv.slice(2);
let sql: string;

if (args[0] === '--file') {
  sql = readFileSync(args[1], 'utf-8');
  console.log(`Running file: ${args[1]} (${sql.length} chars)`);
} else {
  sql = args.join(' ');
  console.log(`Running: ${sql.slice(0, 200)}`);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  try {
    const result = await client.query(sql);
    if (result.rows && result.rows.length > 0) {
      console.table(result.rows.slice(0, 50));
    } else {
      console.log('OK —', result.command, result.rowCount ?? 0, 'rows');
    }
  } catch (err: any) {
    console.error('SQL Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
