/**
 * enrich-ctgb-batch.ts — Two-phase CTGB enrichment
 *
 * Phase 1: Fetch ALL product details from MST API → save to local JSON
 * Phase 2: Read local JSON → batch update Supabase
 *
 * This approach is network-resilient: if phase 1 completes but phase 2 fails,
 * you can re-run phase 2 without re-fetching from the API.
 *
 * Usage:
 *   npx tsx scripts/enrich-ctgb-batch.ts                    # Both phases
 *   npx tsx scripts/enrich-ctgb-batch.ts --phase=1          # Only fetch API
 *   npx tsx scripts/enrich-ctgb-batch.ts --phase=2          # Only write DB
 *   npx tsx scripts/enrich-ctgb-batch.ts --limit=50         # First 50 products
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
config({ path: resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MST_API_BASE = 'https://public.mst.ctgb.nl/public-api/1.0';
const DATA_FILE = resolve(__dirname, '../.ctgb-enrichment-cache.json');

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const phaseArg = args.find(a => a.startsWith('--phase='));
const phase = phaseArg ? parseInt(phaseArg.split('=')[1], 10) : 0; // 0 = both

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function supabaseGet(path: string): any {
  const result = execSync(
    `curl -s --max-time 30 "${SUPABASE_URL}/rest/v1/${path}" -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}"`,
    { encoding: 'utf-8', timeout: 40000 }
  );
  return JSON.parse(result);
}

function supabasePatch(table: string, matchCol: string, matchVal: string, data: any): boolean {
  const { tmpdir } = require('os');
  const { join } = require('path');
  const { writeFileSync: wf, unlinkSync } = require('fs');
  const tmpFile = join(tmpdir(), `sb-patch-${Date.now()}.json`);
  wf(tmpFile, JSON.stringify(data));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = execSync(
        `curl -s --max-time 60 -X PATCH "${SUPABASE_URL}/rest/v1/${table}?${matchCol}=eq.${encodeURIComponent(matchVal)}" ` +
        `-H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" ` +
        `-H "Content-Type: application/json" -H "Prefer: return=minimal" -d @${tmpFile}`,
        { encoding: 'utf-8', timeout: 90000 }
      );
      try { unlinkSync(tmpFile); } catch {}
      return !result.includes('"code"');
    } catch (err: any) {
      if (attempt === 3) {
        try { unlinkSync(tmpFile); } catch {}
        return false;
      }
      execSync('sleep 3');
    }
  }
  try { require('fs').unlinkSync(tmpFile); } catch {}
  return false;
}

async function fetchMST(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) { await sleep(attempt * 5000); continue; }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err: any) {
      if (attempt === retries) throw err;
      await sleep(attempt * 2000);
    }
  }
}

function extractCropNames(targetCrops: any[]): string[] {
  const crops: string[] = [];
  function traverse(items: any[]) {
    for (const item of items) {
      if (item.crop && item.selected && !crops.includes(item.crop)) crops.push(item.crop);
      if (item.items) traverse(item.items);
    }
  }
  if (Array.isArray(targetCrops)) traverse(targetCrops);
  return crops;
}

function extractOrganismNames(targetOrganisms: any[]): string[] {
  const organisms: string[] = [];
  function traverse(items: any[]) {
    for (const item of items) {
      if (item.diseases && Array.isArray(item.diseases) && item.selected) {
        for (const d of item.diseases) if (!organisms.includes(d)) organisms.push(d);
      }
      if (item.items) traverse(item.items);
    }
  }
  if (Array.isArray(targetOrganisms)) traverse(targetOrganisms);
  return organisms;
}

function buildEnrichedGV(data: any): any[] {
  const uses = data.uses || [];
  const wCodes: string[] = [];
  if (data.authorisation?.actual) {
    for (const actual of data.authorisation.actual) {
      if (actual.wCodings) {
        for (const wc of actual.wCodings) {
          if (wc.wCode && !wCodes.includes(wc.wCode)) wCodes.push(wc.wCode);
        }
      }
    }
  }

  return uses.map((usage: any) => {
    const gewassen = extractCropNames(usage.targetCrops || []);
    if (gewassen.length === 0 && usage.nameOfUse?.usesSummary) gewassen.push(usage.nameOfUse.usesSummary);
    const doelorganismen = extractOrganismNames(usage.targetOrganisms || []);

    let dosering: string | undefined;
    if (usage.maximumProductDose) {
      dosering = `${usage.maximumProductDose.ratio} ${usage.maximumProductDose.measure?.unit || ''}`.trim();
    }

    const locaties = (usage.targetLocations || []).map((l: any) => l.description).filter(Boolean);
    const methodes = (usage.applicationMethods || []).map((m: any) => m.description).filter(Boolean);

    const opmerkingen: any[] = [];
    if (usage.remarks) opmerkingen.push(usage.remarks);
    if (usage.restrictions && Array.isArray(usage.restrictions)) opmerkingen.push(...usage.restrictions);

    let maxToepassingen = usage.amountOfApplications?.perCropSeason;
    if (maxToepassingen === undefined) maxToepassingen = usage.amountOfApplications?.perUse;

    const gv: any = {
      gewas: gewassen.join(', ') || 'Algemeen',
      doelorganisme: doelorganismen.length > 0 ? doelorganismen.join(', ') : undefined,
      locatie: locaties.length > 0 ? locaties.join(', ') : undefined,
      toepassingsmethode: methodes.length > 0 ? methodes.join(', ') : undefined,
      dosering,
      maxToepassingen,
      veiligheidstermijn: usage.phiDays !== undefined ? `${usage.phiDays} dagen` : undefined,
      interval: usage.minimumIntervalBetweenApplications ? `min. ${usage.minimumIntervalBetweenApplications} dagen` : undefined,
      opmerkingen: opmerkingen.length > 0 ? opmerkingen : undefined,
      wCodes: wCodes.length > 0 ? wCodes : undefined,
    };

    if (usage.growthStage) { gv.bbchVan = usage.growthStage.from; gv.bbchTot = usage.growthStage.to; }
    if (usage.applicationTiming) { gv.seizoenVan = usage.applicationTiming.fromMonth; gv.seizoenTot = usage.applicationTiming.toMonth; }
    if (usage.watervolumeScale) { gv.spuitvolumeMin = usage.watervolumeScale.min; gv.spuitvolumeMax = usage.watervolumeScale.max; }
    if (usage.maximumProductDosePerCropSeason) {
      gv.maxDoseringPerSeizoen = `${usage.maximumProductDosePerCropSeason.ratio} ${usage.maximumProductDosePerCropSeason.measure?.unit || ''}`.trim();
    }
    if (usage.minimumIntervalBetweenApplications !== undefined) gv.intervalDagen = usage.minimumIntervalBetweenApplications;
    if (usage.phiDays !== undefined) gv.phiDagen = usage.phiDays;

    return gv;
  });
}

// ============================================
// PHASE 1: Fetch all from MST API → local JSON
// ============================================
async function phase1() {
  console.log('📡 PHASE 1: Fetching from MST API...\n');

  // Get product list from Supabase
  const allProducts: any[] = [];
  let offset = 0;
  while (true) {
    try {
      const data = supabaseGet(`ctgb_products?select=id,toelatingsnummer,naam&order=naam&offset=${offset}&limit=500`);
      if (!data || data.length === 0) break;
      allProducts.push(...data);
      if (data.length < 500) break;
      offset += 500;
    } catch (err: any) {
      console.error(`  DB fetch error at offset ${offset}: ${err.message}`);
      break;
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = allProducts.filter(p => { if (seen.has(p.toelatingsnummer)) return false; seen.add(p.toelatingsnummer); return true; });
  console.log(`  Found ${unique.length} unique products\n`);

  const toProcess = unique.slice(0, limit);
  const enriched: Record<string, any> = {};

  // Load existing cache if present (to resume)
  if (existsSync(DATA_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      Object.assign(enriched, cached);
      console.log(`  Loaded ${Object.keys(cached).length} cached entries\n`);
    } catch {}
  }

  let fetched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const { toelatingsnummer, naam } = toProcess[i];

    // Skip if already cached
    if (enriched[toelatingsnummer]) { skipped++; continue; }

    process.stdout.write(`\r  [${i + 1}/${toProcess.length}] ${naam.padEnd(40).substring(0, 40)}`);

    try {
      // Find MST API ID
      const searchResult = await fetchMST(`${MST_API_BASE}/authorisations?filter%5BregistrationNumber%5D=${encodeURIComponent(toelatingsnummer.trim())}&filter%5Blocale%5D=nl`);
      const items = searchResult.data || [];
      if (items.length === 0) { failed++; continue; }

      // Fetch details
      const detail = await fetchMST(`${MST_API_BASE}/authorisations/${items[0].id}?filter%5Blocale%5D=nl`);
      const data = detail.data || detail;

      // Build enriched GV
      const gvs = buildEnrichedGV(data);
      enriched[toelatingsnummer] = { naam, gvs, fetchedAt: new Date().toISOString() };
      fetched++;

      // Save progress every 50 products
      if (fetched % 50 === 0) {
        writeFileSync(DATA_FILE, JSON.stringify(enriched, null, 0));
        console.log(`  (saved ${Object.keys(enriched).length} to cache)`);
      }
    } catch (err: any) {
      failed++;
    }

    await sleep(250); // Rate limit
  }

  // Final save
  writeFileSync(DATA_FILE, JSON.stringify(enriched, null, 0));
  console.log(`\n\n  Phase 1 complete: ${fetched} fetched, ${skipped} cached, ${failed} failed`);
  console.log(`  Total cached: ${Object.keys(enriched).length}`);
}

// ============================================
// PHASE 2: Read local JSON → batch update Supabase
// ============================================
async function phase2() {
  console.log('💾 PHASE 2: Writing to Supabase...\n');

  if (!existsSync(DATA_FILE)) {
    console.error('  No cache file found. Run phase 1 first.');
    return;
  }

  const enriched: Record<string, { naam: string; gvs: any[] }> = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  const entries = Object.entries(enriched);
  console.log(`  ${entries.length} products to update\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const [toelatingsnummer, { naam, gvs }] = entries[i];

    if (!gvs || gvs.length === 0) continue;

    process.stdout.write(`\r  [${i + 1}/${entries.length}] ${naam.padEnd(40).substring(0, 40)}`);

    const success = supabasePatch('ctgb_products', 'toelatingsnummer', toelatingsnummer, {
      gebruiksvoorschriften: gvs,
      last_synced_at: new Date().toISOString(),
    });

    if (success) { updated++; } else { failed++; }

    // Small delay between writes
    if (i % 10 === 0) await sleep(100);
  }

  console.log(`\n\n  Phase 2 complete: ${updated} updated, ${failed} failed`);
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('🔄 CTGB Batch Enrichment');
  console.log(`   Phase: ${phase === 0 ? 'both' : phase}`);
  console.log(`   Limit: ${limit === Infinity ? 'all' : limit}`);
  console.log(`   Cache: ${DATA_FILE}\n`);

  if (phase === 0 || phase === 1) await phase1();
  if (phase === 0 || phase === 2) await phase2();

  console.log('\n✅ Done');
}

main().catch(console.error);
