/**
 * product-quality-report.ts — Data Quality Report
 *
 * Prints a comprehensive report on product database completeness.
 * Run after migrations to verify data integrity.
 *
 * Usage: npx tsx scripts/product-quality-report.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pct = (n: number, t: number) => t === 0 ? 'N/A' : `${n}/${t} (${Math.round(n / t * 100)}%)`;

async function fetchAll(table: string, select: string = '*', filter?: { col: string; val: string }) {
  const all: any[] = [];
  let from = 0;
  const batchSize = 500;
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + batchSize - 1);
    if (filter) query = query.eq(filter.col, filter.val);
    const { data, error } = await query;
    if (error) {
      console.error(`  ⚠️ Fetch error for ${table} at offset ${from}: ${error.message}`);
      // Retry with smaller batch
      if (batchSize > 100) {
        const { data: retryData } = await supabase.from(table).select(select).range(from, from + 99);
        if (retryData && retryData.length > 0) { all.push(...retryData); from += 100; continue; }
      }
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return all;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CROPNODE PRODUCT DATABASE QUALITY REPORT');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════\n');

  // ========== UNIFIED PRODUCTS ==========
  console.log('━━━ 1. UNIFIED PRODUCTS TABLE ━━━\n');
  const products = await fetchAll('products', 'id, name, product_type, source, status');
  console.log(`Total products: ${products.length}`);

  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const p of products) {
    bySource[p.source || 'null'] = (bySource[p.source || 'null'] || 0) + 1;
    byType[p.product_type || 'null'] = (byType[p.product_type || 'null'] || 0) + 1;
    byStatus[p.status || 'null'] = (byStatus[p.status || 'null'] || 0) + 1;
  }

  console.log('\nBy source:');
  for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${c}`);
  console.log('\nBy product type:');
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${c}`);
  console.log('\nBy status:');
  for (const [s, c] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${c}`);

  // ========== CTGB DETAIL ==========
  console.log('\n\n━━━ 2. CTGB PRODUCTS DETAIL ━━━\n');
  const ctgbJson = await fetchAll('ctgb_products', 'toelatingsnummer, naam, werkzame_stoffen, samenstelling, gebruiksvoorschriften, etikettering, search_keywords');
  console.log(`CTGB products: ${ctgbJson.length}`);

  let hasWS = 0, hasSam = 0, hasEtik = 0, hasSK = 0, hasFT = 0;
  let totalGV = 0, gvDos = 0, gvPHI = 0, gvInt = 0, gvMax = 0, gvDoel = 0;

  for (const p of ctgbJson) {
    if (p.werkzame_stoffen?.length > 0) hasWS++;
    if (p.samenstelling && JSON.stringify(p.samenstelling) !== 'null') {
      hasSam++;
      if (p.samenstelling?.formuleringstype) hasFT++;
    }
    if (p.etikettering && JSON.stringify(p.etikettering) !== 'null') hasEtik++;
    if (p.search_keywords?.length > 0) hasSK++;

    for (const gv of (Array.isArray(p.gebruiksvoorschriften) ? p.gebruiksvoorschriften : [])) {
      totalGV++;
      if (gv.dosering) gvDos++;
      if (gv.veiligheidstermijn) gvPHI++;
      if (gv.interval) gvInt++;
      if (gv.maxToepassingen) gvMax++;
      if (gv.doelorganisme) gvDoel++;
    }
  }

  console.log(`\nField completeness:`);
  console.log(`  werkzame_stoffen: ${pct(hasWS, ctgbJson.length)}`);
  console.log(`  samenstelling: ${pct(hasSam, ctgbJson.length)}`);
  console.log(`  formuleringstype: ${pct(hasFT, ctgbJson.length)}`);
  console.log(`  etikettering: ${pct(hasEtik, ctgbJson.length)}`);
  console.log(`  search_keywords: ${pct(hasSK, ctgbJson.length)}`);

  console.log(`\nGebruiksvoorschriften (${totalGV} entries):`);
  console.log(`  dosering: ${pct(gvDos, totalGV)}`);
  console.log(`  doelorganisme: ${pct(gvDoel, totalGV)}`);
  console.log(`  maxToepassingen: ${pct(gvMax, totalGV)}`);
  console.log(`  veiligheidstermijn (PHI): ${pct(gvPHI, totalGV)}`);
  console.log(`  interval: ${pct(gvInt, totalGV)}`);

  // ========== TOP 20 FRUIT FARMING PRODUCTS ==========
  console.log('\n\n━━━ 3. TOP 20 FRUITTEELT-MIDDELEN COMPLETENESS ━━━\n');
  const top20Names = [
    'Merpan Spuitkorrel', 'Merpan 80 WG', 'Delan Pro', 'Delan WG',
    'Score 250 EC', 'Bellis', 'Luna Sensation', 'Captan 80 WG',
    'Scala', 'Geoxe', 'Chorus', 'Flint', 'Folicur',
    'Pirimor', 'Karate Zeon', 'Decis', 'Movento', 'Teppeki',
    'Coragen', 'Envidor',
  ];

  for (const name of top20Names) {
    const product = ctgbJson.find((p: any) => p.naam === name);
    if (!product) {
      console.log(`  ❌ ${name}: NOT FOUND`);
      continue;
    }

    const gvs = product.gebruiksvoorschriften || [];
    const fruitGVs = gvs.filter((g: any) => {
      const gw = (g.gewas || '').toLowerCase();
      return gw.includes('appel') || gw.includes('peer') || gw.includes('pitvruchten') || gw.includes('vruchtbomen') || gw.includes('pit');
    });

    const complete = fruitGVs.length > 0 && fruitGVs.every((g: any) =>
      g.dosering && g.maxToepassingen && g.veiligheidstermijn && g.interval
    );

    const hasDos = fruitGVs.some((g: any) => g.dosering);
    const hasMax = fruitGVs.some((g: any) => g.maxToepassingen);
    const hasPhi = fruitGVs.some((g: any) => g.veiligheidstermijn);
    const hasInt = fruitGVs.some((g: any) => g.interval);

    const status = complete ? '✅' : '⚠️';
    const missing: string[] = [];
    if (!hasDos) missing.push('dosering');
    if (!hasMax) missing.push('maxToepassingen');
    if (!hasPhi) missing.push('PHI');
    if (!hasInt) missing.push('interval');

    console.log(`  ${status} ${name}: ${fruitGVs.length} fruit-GV${fruitGVs.length !== 1 ? 's' : ''}${missing.length > 0 ? ` — missing: ${missing.join(', ')}` : ''}`);
  }

  // ========== MESTSTOFFEN ==========
  console.log('\n\n━━━ 4. MESTSTOFFEN DETAIL ━━━\n');
  const ferts = await fetchAll('fertilizers', '*');
  console.log(`Total fertilizers: ${ferts.length}`);

  let hasComp = 0, hasDesc = 0, hasDens = 0, hasDosF = 0;
  let hasN = 0, hasP = 0, hasK = 0;
  for (const f of ferts) {
    const c = f.composition || {};
    if (Object.keys(c).length > 0 && JSON.stringify(c) !== '{}') hasComp++;
    if (f.description) hasDesc++;
    if (f.density != null) hasDens++;
    if (f.dosage_fruit) hasDosF++;
    if (c.N != null) hasN++;
    if (c.P != null || c.P2O5 != null) hasP++;
    if (c.K != null || c.K2O != null) hasK++;
  }

  console.log(`  composition filled: ${pct(hasComp, ferts.length)}`);
  console.log(`  description: ${pct(hasDesc, ferts.length)}`);
  console.log(`  density: ${pct(hasDens, ferts.length)}`);
  console.log(`  dosage_fruit: ${pct(hasDosF, ferts.length)}`);
  console.log(`  N: ${pct(hasN, ferts.length)}, P: ${pct(hasP, ferts.length)}, K: ${pct(hasK, ferts.length)}`);

  // ========== ALIASES ==========
  console.log('\n\n━━━ 5. ALIAS COVERAGE ━━━\n');
  const aliases = await fetchAll('product_aliases_unified', 'id, product_id, alias, alias_type, source');
  console.log(`Total aliases: ${aliases.length}`);
  const aliasTypes: Record<string, number> = {};
  const aliasSources: Record<string, number> = {};
  for (const a of aliases) {
    aliasTypes[a.alias_type || 'null'] = (aliasTypes[a.alias_type || 'null'] || 0) + 1;
    aliasSources[a.source || 'null'] = (aliasSources[a.source || 'null'] || 0) + 1;
  }
  console.log('By type:');
  for (const [t, c] of Object.entries(aliasTypes).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${c}`);
  console.log('By source:');
  for (const [s, c] of Object.entries(aliasSources).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${c}`);

  // Products with aliases vs without
  const productsWithAlias = new Set(aliases.map(a => a.product_id));
  const ctgbProducts = products.filter(p => p.source === 'ctgb');
  const fertProducts = products.filter(p => p.source === 'fertilizer');
  console.log(`\nCTGB products with alias: ${pct([...productsWithAlias].filter(id => ctgbProducts.some(p => p.id === id)).length, ctgbProducts.length)}`);
  console.log(`Fertilizer products with alias: ${pct([...productsWithAlias].filter(id => fertProducts.some(p => p.id === id)).length, fertProducts.length)}`);

  // ========== SUPPORTING TABLES ==========
  console.log('\n\n━━━ 6. SUPPORTING TABLES ━━━\n');
  const substances = await fetchAll('active_substances', 'code, resistance_group, cas_number');
  console.log(`active_substances: ${substances.length}`);
  const withFRAC = substances.filter(s => s.resistance_group);
  const withCAS = substances.filter(s => s.cas_number);
  console.log(`  with FRAC/IRAC: ${pct(withFRAC.length, substances.length)}`);
  console.log(`  with CAS number: ${pct(withCAS.length, substances.length)}`);

  const prodSubst = await fetchAll('product_substances', 'id');
  console.log(`product_substances (junction): ${prodSubst.length}`);

  const restrictions = await fetchAll('ctgb_usage_restrictions', 'id');
  console.log(`ctgb_usage_restrictions: ${restrictions.length}`);

  const syncLogs = await fetchAll('sync_log', 'id, source, status, started_at');
  console.log(`sync_log: ${syncLogs.length}`);

  console.log('\n═══════════════════════════════════════════');
  console.log('  REPORT COMPLETE');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
