#!/usr/bin/env npx tsx
/**
 * Cleanup deprecated knowledge base sources.
 *
 * After the new RAG pipeline (knowledge_articles) is verified working, this
 * script removes the old per-factsheet tables (kb_topics, kb_products,
 * kb_strategy_steps, kb_variety_susceptibility) and the markdown files in
 * /studio/knowledge-base/.
 *
 * SAFETY:
 * - Tables are DELETED but not DROPPED (rollback possible by re-running import)
 * - Markdown files are removed only if --remove-markdown is passed
 * - Requires explicit env var CONFIRM_DELETE=yes to actually delete anything
 *
 * Usage:
 *   CONFIRM_DELETE=yes npx tsx scripts/cleanup-deprecated-kb.ts
 *   CONFIRM_DELETE=yes npx tsx scripts/cleanup-deprecated-kb.ts --remove-markdown
 *   npx tsx scripts/cleanup-deprecated-kb.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const removeMarkdown = args.includes('--remove-markdown');
const confirmed = process.env.CONFIRM_DELETE === 'yes';

if (!dryRun && !confirmed) {
  console.error('REFUSED: dit script wijzigt productie data.');
  console.error('Run met CONFIRM_DELETE=yes om te bevestigen, of --dry-run om te previewen.');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const KB_TABLES = [
  'kb_variety_susceptibility',
  'kb_strategy_steps',
  'kb_products',
  'kb_topics',
];

const KB_MARKDOWN_DIR = '/Users/jordidejager/studio/studio/knowledge-base';

async function main() {
  console.log('========================================');
  console.log('Deprecated KB Cleanup');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log();

  // 1. Check the new pipeline has data before we delete the old
  const { count: newCount, error: countError } = await supabase
    .from('knowledge_articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  if (countError) {
    console.error(`Kan knowledge_articles niet bevragen: ${countError.message}`);
    console.error('Cleanup geannuleerd.');
    process.exit(1);
  }

  console.log(`knowledge_articles published: ${newCount ?? 0}`);

  if ((newCount ?? 0) < 50) {
    console.error(`Te weinig artikelen in de nieuwe kennisbank (${newCount}). Voer eerst de backfill uit.`);
    process.exit(1);
  }

  // 2. Truncate de oude tabellen (delete only, geen drop)
  for (const table of KB_TABLES) {
    if (dryRun) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      console.log(`  [dry-run] zou ${count ?? 0} rijen wissen uit ${table}`);
    } else {
      console.log(`  → wissen ${table}...`);
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.error(`    fout: ${error.message}`);
      } else {
        console.log(`    ✓ gewist`);
      }
    }
  }

  // 3. Markdown files (alleen als expliciet gevraagd)
  if (removeMarkdown) {
    if (!fs.existsSync(KB_MARKDOWN_DIR)) {
      console.log(`Markdown directory bestaat niet: ${KB_MARKDOWN_DIR}`);
    } else {
      const files = walk(KB_MARKDOWN_DIR).filter((f) => f.endsWith('.md'));
      console.log();
      console.log(`Markdown bestanden: ${files.length}`);
      if (dryRun) {
        for (const f of files.slice(0, 5)) console.log(`  [dry-run] zou verwijderen: ${path.relative(KB_MARKDOWN_DIR, f)}`);
        if (files.length > 5) console.log(`  ... en ${files.length - 5} meer`);
      } else {
        for (const f of files) {
          fs.unlinkSync(f);
        }
        console.log(`  ✓ ${files.length} bestanden verwijderd`);
      }
    }
  } else {
    console.log();
    console.log('Markdown directory NIET aangeraakt (gebruik --remove-markdown om ook die te wissen)');
  }

  console.log();
  console.log('Klaar.');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

main().catch((err) => {
  console.error('Cleanup fataal:', err);
  process.exit(1);
});
