/**
 * test-whatsapp-queries.ts — WhatsApp Bot Readiness Test
 *
 * Simulates example questions using direct Supabase queries
 * (avoids RPC timeout issues on slow connections).
 *
 * Usage: npx tsx scripts/test-whatsapp-queries.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TestResult {
  question: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  answer: string;
}

const results: TestResult[] = [];

/** Find CTGB product by name or alias, return with gebruiksvoorschriften */
async function findCtgbProduct(name: string) {
  const fields = 'naam, toelatingsnummer, werkzame_stoffen, product_types, status, vervaldatum, toelatingshouder, gebruiksvoorschriften';

  // 1. Try alias FIRST (handles "Captan" → "Merpan Spuitkorrel", "Score" → "Score 250 EC")
  const { data: alias } = await supabase
    .from('product_aliases_unified')
    .select('product_id')
    .ilike('alias', name)
    .limit(1);

  if (alias && alias.length > 0) {
    const { data: prod } = await supabase
      .from('products')
      .select('source_id')
      .eq('id', alias[0].product_id)
      .eq('source', 'ctgb')
      .single();

    if (prod) {
      const { data: ctgb } = await supabase
        .from('ctgb_products')
        .select(fields)
        .eq('toelatingsnummer', prod.source_id)
        .single();
      if (ctgb) return ctgb;
    }
  }

  // 2. Try exact/partial name match
  const { data: exact } = await supabase
    .from('ctgb_products')
    .select(fields)
    .ilike('naam', `%${name}%`)
    .limit(3);

  if (exact && exact.length > 0) return exact[0];

  // 3. Try werkzame stof match
  const { data: substMatch } = await supabase
    .from('ctgb_products')
    .select(fields)
    .contains('werkzame_stoffen', [name.toLowerCase()])
    .limit(3);

  if (substMatch && substMatch.length > 0) return substMatch[0];

  return null;
}

/** Find GV entries matching a crop (with hierarchy) */
function findGVForCrop(gvs: any[], crop: string): any[] {
  const lower = crop.toLowerCase();
  return gvs.filter((gv: any) => {
    const g = (gv.gewas || '').toLowerCase();
    return g.includes(lower)
      || lower.includes(g)
      || ((['appel', 'peer', 'appels', 'peren'].includes(lower)) && (g.includes('pitvruchten') || g.includes('vruchtbomen') || g.includes('fruitgewassen')));
  });
}

async function test1() {
  const q = 'Mag ik Captan gebruiken op Conference peer?';
  console.log(`\n🔍 Test 1: "${q}"`);
  const prod = await findCtgbProduct('Captan');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }
  const fruitGVs = findGVForCrop(prod.gebruiksvoorschriften || [], 'peer');
  const answer = fruitGVs.length > 0
    ? `Ja, ${prod.naam} is toegelaten voor ${fruitGVs[0].gewas}. Dosering: ${fruitGVs[0].dosering || 'onbekend'}.`
    : `${prod.naam} gevonden, maar geen toelating voor peer.`;
  console.log(`  ${fruitGVs.length > 0 ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: fruitGVs.length > 0 ? 'PASS' : 'PARTIAL', answer });
}

async function test2() {
  const q = 'Wat is de maximale dosering van Score op appel?';
  console.log(`\n🔍 Test 2: "${q}"`);
  const prod = await findCtgbProduct('Score');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }
  const gvs = findGVForCrop(prod.gebruiksvoorschriften || [], 'appel');
  const dosering = gvs[0]?.dosering;
  const answer = dosering ? `${prod.naam}: dosering ${dosering} voor ${gvs[0].gewas}` : `${prod.naam} gevonden, dosering ontbreekt`;
  console.log(`  ${dosering ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: dosering ? 'PASS' : 'PARTIAL', answer });
}

async function test3() {
  const q = 'Hoelang moet ik wachten na Merpan voor oogst?';
  console.log(`\n🔍 Test 3: "${q}"`);
  const prod = await findCtgbProduct('Merpan');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }
  const gvs = findGVForCrop(prod.gebruiksvoorschriften || [], 'appel');
  const phi = gvs.find((g: any) => g.veiligheidstermijn)?.veiligheidstermijn;
  const answer = phi ? `Veiligheidstermijn ${prod.naam}: ${phi}` : `${prod.naam} gevonden, PHI ontbreekt`;
  console.log(`  ${phi ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: phi ? 'PASS' : 'PARTIAL', answer });
}

async function test4() {
  const q = 'Hoe vaak mag ik Delan per seizoen spuiten?';
  console.log(`\n🔍 Test 4: "${q}"`);
  const prod = await findCtgbProduct('Delan');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }
  const gvs = findGVForCrop(prod.gebruiksvoorschriften || [], 'appel');
  const max = gvs.find((g: any) => g.maxToepassingen)?.maxToepassingen;
  const answer = max ? `${prod.naam}: max ${max}x per seizoen` : `${prod.naam} gevonden, maxToepassingen ontbreekt`;
  console.log(`  ${max ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: max ? 'PASS' : 'PARTIAL', answer });
}

async function test5() {
  const q = 'Welke fungiciden zijn toegelaten voor schurft in peer?';
  console.log(`\n🔍 Test 5: "${q}"`);

  // Query products with product_type=fungicide, then check gebruiksvoorschriften
  const { data: prods } = await supabase
    .from('ctgb_products')
    .select('naam, toelatingsnummer, gebruiksvoorschriften')
    .contains('product_types', ['Fungicide'])
    .limit(500);

  if (!prods) { results.push({ question: q, status: 'FAIL', answer: 'Query mislukt' }); console.log('  ❌ Query mislukt'); return; }

  const matches: string[] = [];
  for (const prod of prods) {
    const gvs = (prod.gebruiksvoorschriften || []) as any[];
    const hasSchurft = gvs.some((gv: any) =>
      (gv.doelorganisme || '').toLowerCase().includes('schurft')
      && findGVForCrop([gv], 'peer').length > 0
    );
    if (hasSchurft) matches.push(prod.naam);
  }

  const answer = matches.length > 0
    ? `${matches.length} fungiciden voor schurft in peer: ${matches.slice(0, 8).join(', ')}`
    : 'Geen fungiciden gevonden voor schurft in peer';
  console.log(`  ${matches.length > 0 ? '✅' : '❌'} ${answer}`);
  results.push({ question: q, status: matches.length > 0 ? 'PASS' : 'FAIL', answer });
}

async function test6() {
  const q = 'Wat is de resistentiegroep van Luna Sensation?';
  console.log(`\n🔍 Test 6: "${q}"`);
  const prod = await findCtgbProduct('Luna Sensation');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }

  // Look up FRAC codes via product_substances → active_substances
  const { data: subs } = await supabase
    .from('product_substances')
    .select('substance_code, active_substances(name, resistance_group)')
    .eq('product_id', prod.toelatingsnummer);

  const frac = subs?.map((s: any) => `${s.active_substances?.name}: FRAC ${s.active_substances?.resistance_group}`)
    .filter((s: string) => !s.includes('null'));

  const answer = frac && frac.length > 0
    ? `${prod.naam}: ${frac.join(', ')}`
    : `${prod.naam} gevonden, FRAC code niet gekoppeld (werkzame stoffen: ${prod.werkzame_stoffen.join(', ')})`;
  console.log(`  ${frac && frac.length > 0 ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: frac && frac.length > 0 ? 'PASS' : 'PARTIAL', answer });
}

async function test7() {
  const q = 'Is Decis nog toegelaten?';
  console.log(`\n🔍 Test 7: "${q}"`);
  const prod = await findCtgbProduct('Decis');
  if (!prod) { results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' }); console.log('  ❌ Niet gevonden'); return; }
  const isValid = prod.status === 'Valid';
  const answer = isValid
    ? `${prod.naam}: JA, toegelaten tot ${prod.vervaldatum || 'onbekend'}`
    : `${prod.naam}: NEE (status: ${prod.status})`;
  console.log(`  ✅ ${answer}`);
  results.push({ question: q, status: 'PASS', answer });
}

async function test8() {
  const q = 'Hoeveel Kali 60 moet ik strooien per hectare?';
  console.log(`\n🔍 Test 8: "${q}"`);

  // Search in fertilizers
  const { data: ferts } = await supabase
    .from('fertilizers')
    .select('name, dosage_fruit, composition, category')
    .or('name.ilike.%Kali%60%,name.ilike.%Kalizout%')
    .limit(3);

  if (!ferts || ferts.length === 0) {
    results.push({ question: q, status: 'FAIL', answer: 'Product niet gevonden' });
    console.log('  ❌ Niet gevonden');
    return;
  }

  const f = ferts[0];
  const answer = f.dosage_fruit
    ? `${f.name}: ${f.dosage_fruit} (ADVIES, niet wettelijk bindend)`
    : `${f.name} gevonden, dosering-advies niet beschikbaar`;
  console.log(`  ${f.dosage_fruit ? '✅' : '⚠️'} ${answer}`);
  results.push({ question: q, status: f.dosage_fruit ? 'PASS' : 'PARTIAL', answer });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  WHATSAPP BOT READINESS TEST');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  await test1();
  await test2();
  await test3();
  await test4();
  await test5();
  await test6();
  await test7();
  await test8();

  console.log('\n═══════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════\n');

  const pass = results.filter(r => r.status === 'PASS').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const fail = results.filter(r => r.status === 'FAIL').length;

  console.log(`  ✅ PASS: ${pass}/${results.length}`);
  console.log(`  ⚠️  PARTIAL: ${partial}/${results.length}`);
  console.log(`  ❌ FAIL: ${fail}/${results.length}`);

  if (fail > 0 || partial > 0) {
    console.log('\nIssues:');
    for (const r of results.filter(r => r.status !== 'PASS')) {
      console.log(`  ${r.status === 'FAIL' ? '❌' : '⚠️'} ${r.question}`);
      console.log(`     → ${r.answer}`);
    }
  }

  console.log(`\nReadiness: ${pass}/${results.length} vragen volledig beantwoord`);
}

main().catch(console.error);
