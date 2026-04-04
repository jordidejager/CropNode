/**
 * parse-gv-restrictions.ts — Parse structured restrictions from GV opmerkingen
 *
 * Extracts BBCH stadiums, grondwater restricties, driftreductie,
 * bufferzones, and other structured data from the opmerkingen field
 * and stores them in ctgb_usage_restrictions.
 *
 * Usage:
 *   npx tsx scripts/parse-gv-restrictions.ts              # All products
 *   npx tsx scripts/parse-gv-restrictions.ts --limit=10   # First 10
 *   npx tsx scripts/parse-gv-restrictions.ts --dry-run    # Preview only
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

interface Restriction {
  product_toelatingsnummer: string;
  gv_index: number;
  gewas: string;
  restriction_type: string;
  value: string | null;
  raw_text: string;
  parameters: any;
}

function parseOpmerkingen(toelatingsnr: string, gvIndex: number, gewas: string, opmerkingen: any[]): Restriction[] {
  const restrictions: Restriction[] = [];

  for (const opm of opmerkingen) {
    // Structured grondwater restrictions (dict with category/parameters)
    if (typeof opm === 'object' && opm !== null && opm.category) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'grondwater',
        value: opm.sentenceNL || opm.orgSentenceNL || null,
        raw_text: JSON.stringify(opm),
        parameters: opm.parameters || null,
      });
      continue;
    }

    if (typeof opm !== 'string') continue;
    const lower = opm.toLowerCase();

    // BBCH stadiums
    const bbchMatch = opm.match(/BBCH\s+(\d+[-–]\d+(?:\s+en\s+BBCH\s+\d+[-–]\d+)?)/i);
    if (bbchMatch) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'bbch_stadiums',
        value: bbchMatch[1],
        raw_text: opm,
        parameters: null,
      });
    }

    // Driftreductie
    const driftMatch = opm.match(/driftreducti[eë][\s:]*(\d+)%|DRT[\s-]*(\d+)/i);
    if (driftMatch || lower.includes('driftreducti') || lower.includes('drt')) {
      const drtValue = driftMatch ? (driftMatch[1] || driftMatch[2]) + '%' : null;
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'drift',
        value: drtValue,
        raw_text: opm,
        parameters: null,
      });
    }

    // Bufferzone / teeltvrije zone
    const bufferMatch = opm.match(/(?:bufferzone|teeltvrije\s+zone)[\s:]*(\d+(?:,\d+)?)\s*(?:m|meter)/i);
    if (bufferMatch || lower.includes('bufferzone') || lower.includes('teeltvrije zone')) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'bufferzone',
        value: bufferMatch ? bufferMatch[1] + ' m' : null,
        raw_text: opm,
        parameters: null,
      });
    }

    // Grondwater (string version)
    if (lower.includes('grondwater') && !opm.includes('{')) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'grondwater',
        value: null,
        raw_text: opm,
        parameters: null,
      });
    }

    // Concentratie / spuitvolume
    const concMatch = opm.match(/(\d+(?:,\d+)?)\s*%\s*\(?\s*(\d+)\s*(?:g|ml)\s+per\s+100\s*l/i);
    if (concMatch || lower.includes('concentratie') || lower.includes('spuitvolume')) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'concentratie',
        value: concMatch ? `${concMatch[1]}% (${concMatch[2]} per 100L)` : null,
        raw_text: opm,
        parameters: null,
      });
    }

    // Resistentie
    if (lower.includes('resistentie')) {
      restrictions.push({
        product_toelatingsnummer: toelatingsnr,
        gv_index: gvIndex,
        gewas,
        restriction_type: 'resistentie',
        value: null,
        raw_text: opm,
        parameters: null,
      });
    }
  }

  return restrictions;
}

async function main() {
  console.log('🔍 Parse GV Restrictions');
  console.log(`   Dry run: ${isDryRun}`);
  console.log(`   Limit: ${limit === Infinity ? 'all' : limit}\n`);

  // Fetch products with gebruiksvoorschriften
  const allProducts: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ctgb_products')
      .select('toelatingsnummer, naam, gebruiksvoorschriften')
      .order('naam')
      .range(from, from + 199);
    if (error) { console.warn(`  Fetch error: ${error.message}`); await new Promise(r => setTimeout(r, 2000)); continue; }
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 200) break;
    from += 200;
  }

  console.log(`📦 Found ${allProducts.length} products\n`);

  const toProcess = allProducts.slice(0, limit);
  const allRestrictions: Restriction[] = [];
  const typeCounts: Record<string, number> = {};

  for (const product of toProcess) {
    const gvList = Array.isArray(product.gebruiksvoorschriften) ? product.gebruiksvoorschriften : [];
    for (let i = 0; i < gvList.length; i++) {
      const gv = gvList[i];
      const opmerkingen = gv.opmerkingen || [];
      if (opmerkingen.length === 0) continue;

      const restrictions = parseOpmerkingen(product.toelatingsnummer, i, gv.gewas || '', opmerkingen);
      for (const r of restrictions) {
        typeCounts[r.restriction_type] = (typeCounts[r.restriction_type] || 0) + 1;
      }
      allRestrictions.push(...restrictions);
    }
  }

  console.log(`📊 Parsed ${allRestrictions.length} restrictions:\n`);
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }

  // Insert into database
  if (!isDryRun && allRestrictions.length > 0) {
    // Clear existing data
    console.log('\n  Clearing existing restrictions...');
    await supabase.from('ctgb_usage_restrictions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert in batches
    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < allRestrictions.length; i += batchSize) {
      const batch = allRestrictions.slice(i, i + batchSize);
      const { error } = await supabase.from('ctgb_usage_restrictions').insert(batch);
      if (error) {
        console.error(`  ❌ Batch ${i}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }
    console.log(`\n  ✅ Inserted ${inserted} restrictions`);
  } else if (isDryRun) {
    console.log('\n  ⚠️ DRY RUN — no changes written');

    // Show some examples
    console.log('\n  Examples:');
    const examples = allRestrictions.filter(r => r.value).slice(0, 10);
    for (const ex of examples) {
      console.log(`    [${ex.restriction_type}] ${ex.gewas}: ${ex.value}`);
    }
  }
}

main().catch(console.error);
