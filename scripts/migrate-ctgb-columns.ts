#!/usr/bin/env npx tsx
/**
 * Migrate CTGB validation columns
 * Adds missing columns to kb_products and kb_strategy_steps
 * Uses direct DB connection via SUPABASE_DB_URL
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env.local');
  process.exit(1);
}

async function main() {
  // Use pg library if available, otherwise use a fetch-based approach
  let pg: any;
  try {
    pg = await import('pg');
  } catch {
    console.error('pg module not found, installing...');
    const { execSync } = await import('child_process');
    execSync('npm install pg --no-save', { stdio: 'inherit' });
    pg = await import('pg');
  }

  const client = new pg.default.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected to database\n');

  const migrations = [
    // kb_products columns (may already exist)
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_status VARCHAR DEFAULT 'niet_gevalideerd'`,
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_product_id VARCHAR`,
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_max_dosage VARCHAR`,
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_max_applications INTEGER`,
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS dosage_exceeds_ctgb BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_crop_valid BOOLEAN DEFAULT TRUE`,
    // kb_strategy_steps columns
    `ALTER TABLE kb_strategy_steps ADD COLUMN IF NOT EXISTS ctgb_validated BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE kb_strategy_steps ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      const colName = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1] || 'unknown';
      console.log(`  ✅ ${colName}`);
    } catch (err: any) {
      console.error(`  ❌ ${sql}: ${err.message}`);
    }
  }

  await client.end();
  console.log('\n✅ Migration complete');
}

main().catch(console.error);
