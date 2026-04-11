#!/usr/bin/env npx tsx
/**
 * Strip temporal references from knowledge_articles content.
 * Removes weekday names, "volgende week", "morgen", specific dates etc.
 * that leaked through from weekly advice articles.
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const dryRun = process.argv.includes('--dry-run');

// Temporal patterns to clean from article content
const REPLACEMENTS: Array<[RegExp, string]> = [
  // Weekday names with context: "op maandag", "tot woensdag", "vanaf dinsdag"
  [/\b(op|tot|vanaf|voor|na|t\/m|tot en met)\s+(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(middag|ochtend|avond)?\b/gi, '$1 geschikte omstandigheden'],
  // Standalone "maandagmiddag", "dinsdagochtend" etc
  [/\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)(middag|ochtend|avond)\b/gi, 'bij geschikte omstandigheden'],
  // "spuiten op maandag" → "spuiten bij geschikte omstandigheden"
  [/\bspuiten op (maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/gi, 'spuiten bij geschikte omstandigheden'],
  // "begin/eind volgende week"
  [/\b(begin|eind|midden)\s+volgende week\b/gi, 'bij geschikte omstandigheden'],
  // "volgende week" standalone
  [/\bvolgende week\b/gi, 'bij geschikte omstandigheden'],
  // "deze week nog"
  [/\bdeze week nog\b/gi, ''],
  // "deze week"
  [/\bdeze week\b/gi, 'in deze periode'],
  // "morgen" as timing (not "morgen" as in "tomorrow morning")
  [/\bmorgen\s+(zaterdag|zondag|maandag|dinsdag|woensdag|donderdag|vrijdag)\b/gi, 'bij geschikte omstandigheden'],
  // "dit weekend", "het weekend", "rondom het weekend"
  [/\b(rondom|rond|in|dit)\s+(het\s+)?weeke?nd\b/gi, 'bij geschikte omstandigheden'],
  // Specific dates: "rond 19/05/2025", "op 15 april"
  [/\b(rond|op|vanaf|tot)\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g, '$1 het geschikte moment'],
  [/\b(rond|op|vanaf|tot)\s+\d{1,2}\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/gi, '$1 het geschikte moment'],
  // "afgelopen maandag", "vorige week"
  [/\b(afgelopen|vorige)\s+(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|week)\b/gi, 'recent'],
  // Clean up double spaces
  [/  +/g, ' '],
];

async function main() {
  console.log(`=== Strip Temporal References (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);

  // Fetch articles with temporal terms
  let articles: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('id, title, content')
        .or('content.ilike.*maandag*,content.ilike.*dinsdag*,content.ilike.*woensdag*,content.ilike.*donderdag*,content.ilike.*vrijdag*,content.ilike.*volgende week*,content.ilike.*deze week*')
        .limit(500);
      if (error) throw new Error(error.message);
      articles = data ?? [];
      break;
    } catch (err: any) {
      console.warn(`  Fetch ${attempt}/10: ${(err.message ?? '').slice(0, 40)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }

  console.log(`${articles.length} artikelen met temporele referenties`);

  let updated = 0;
  let totalReplacements = 0;

  for (const article of articles) {
    let content = article.content as string;
    let replacements = 0;

    for (const [pattern, replacement] of REPLACEMENTS) {
      const before = content;
      content = content.replace(pattern, replacement);
      if (content !== before) {
        replacements += (before.match(pattern) ?? []).length;
      }
    }

    if (replacements > 0) {
      if (dryRun) {
        console.log(`  ${article.title?.slice(0, 50)}: ${replacements} replacements`);
      } else {
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const { error } = await supabase
              .from('knowledge_articles')
              .update({ content })
              .eq('id', article.id);
            if (error) throw new Error(error.message);
            break;
          } catch {
            if (attempt < 5) await new Promise(r => setTimeout(r, 1500 * attempt));
          }
        }
        console.log(`  ✓ ${article.title?.slice(0, 50)}: ${replacements} replacements`);
      }
      updated++;
      totalReplacements += replacements;
    }
  }

  console.log();
  console.log(`Klaar: ${updated} artikelen bijgewerkt, ${totalReplacements} temporele referenties gestript`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
