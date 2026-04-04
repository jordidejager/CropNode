/**
 * enrich-ctgb-data.ts — Re-fetch CTGB products to fill missing fields
 *
 * This script re-fetches all CTGB products from the MST API and updates
 * the gebruiksvoorschriften with additional fields:
 * - growthStage (BBCH from/to)
 * - applicationTiming (fromMonth/toMonth)
 * - watervolumeScale (min/max)
 * - maximumProductDosePerCropSeason
 * - Fix amountOfApplications (try perCropSeason, then perUse)
 * - Structured restrictions from API
 *
 * Usage:
 *   npx tsx scripts/enrich-ctgb-data.ts              # All products
 *   npx tsx scripts/enrich-ctgb-data.ts --limit=10   # First 10
 *   npx tsx scripts/enrich-ctgb-data.ts --dry-run    # Preview only
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MST_API_BASE = 'https://public.mst.ctgb.nl/public-api/1.0';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMST(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`  Rate limited, waiting ${attempt * 5}s...`);
          await sleep(attempt * 5000);
          continue;
        }
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
      if (item.crop && item.selected) {
        if (!crops.includes(item.crop)) crops.push(item.crop);
      }
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
        for (const disease of item.diseases) {
          if (!organisms.includes(disease)) organisms.push(disease);
        }
      }
      if (item.items) traverse(item.items);
    }
  }
  if (Array.isArray(targetOrganisms)) traverse(targetOrganisms);
  return organisms;
}

async function enrichProduct(dbProduct: any): Promise<{ updated: boolean; gvCount: number; enrichedFields: string[] }> {
  const { id: mstApiId, toelatingsnummer, naam } = dbProduct;

  // Step 1: Find the MST API ID via registration number search
  const searchUrl = `${MST_API_BASE}/authorisations?filter[registrationNumber]=${toelatingsnummer}&filter[locale]=nl`;
  let apiId: string;

  try {
    const searchResult = await fetchMST(searchUrl);
    const items = searchResult.data || [];
    if (items.length === 0) {
      console.warn(`  ⚠️ ${naam}: niet gevonden in API voor toelatingssnr ${toelatingsnummer}`);
      return { updated: false, gvCount: 0, enrichedFields: [] };
    }
    apiId = items[0].id;
  } catch (err: any) {
    console.error(`  ❌ ${naam}: zoek fout: ${err.message}`);
    return { updated: false, gvCount: 0, enrichedFields: [] };
  }

  // Step 2: Fetch full details
  const detailUrl = `${MST_API_BASE}/authorisations/${apiId}?filter[locale]=nl`;
  let data: any;

  try {
    const response = await fetchMST(detailUrl);
    data = response.data || response;
  } catch (err: any) {
    console.error(`  ❌ ${naam}: detail fout: ${err.message}`);
    return { updated: false, gvCount: 0, enrichedFields: [] };
  }

  // Step 3: Build enriched gebruiksvoorschriften
  const uses = data.uses || [];
  const enrichedFields: string[] = [];

  // Extract W-codes
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

  const gebruiksvoorschriften: any[] = [];

  for (const usage of uses) {
    const gewassen = extractCropNames(usage.targetCrops || []);
    if (gewassen.length === 0 && usage.nameOfUse?.usesSummary) {
      gewassen.push(usage.nameOfUse.usesSummary);
    }

    const doelorganismen = extractOrganismNames(usage.targetOrganisms || []);

    let dosering: string | undefined;
    if (usage.maximumProductDose) {
      dosering = `${usage.maximumProductDose.ratio} ${usage.maximumProductDose.measure?.unit || ''}`.trim();
    }

    const locaties: string[] = [];
    if (usage.targetLocations) {
      for (const loc of usage.targetLocations) {
        if (loc.description) locaties.push(loc.description);
      }
    }

    const methodes: string[] = [];
    if (usage.applicationMethods) {
      for (const method of usage.applicationMethods) {
        if (method.description) methodes.push(method.description);
      }
    }

    // Opmerkingen: combine remarks + structured restrictions
    const opmerkingen: any[] = [];
    if (usage.remarks) opmerkingen.push(usage.remarks);
    if (usage.restrictions && Array.isArray(usage.restrictions)) {
      opmerkingen.push(...usage.restrictions);
    }

    // MaxToepassingen: try perCropSeason first, then perUse
    let maxToepassingen: number | undefined = usage.amountOfApplications?.perCropSeason;
    if (maxToepassingen === undefined && usage.amountOfApplications?.perUse !== undefined) {
      maxToepassingen = usage.amountOfApplications.perUse;
    }

    const gv: any = {
      gewas: gewassen.join(', ') || 'Algemeen',
      doelorganisme: doelorganismen.length > 0 ? doelorganismen.join(', ') : undefined,
      locatie: locaties.length > 0 ? locaties.join(', ') : undefined,
      toepassingsmethode: methodes.length > 0 ? methodes.join(', ') : undefined,
      dosering,
      maxToepassingen,
      veiligheidstermijn: usage.phiDays !== undefined ? `${usage.phiDays} dagen` : undefined,
      interval: usage.minimumIntervalBetweenApplications
        ? `min. ${usage.minimumIntervalBetweenApplications} dagen`
        : undefined,
      opmerkingen: opmerkingen.length > 0 ? opmerkingen : undefined,
      wCodes: wCodes.length > 0 ? wCodes : undefined,
    };

    // NEW enriched fields
    if (usage.growthStage) {
      gv.bbchVan = usage.growthStage.from;
      gv.bbchTot = usage.growthStage.to;
      if (!enrichedFields.includes('bbch')) enrichedFields.push('bbch');
    }

    if (usage.applicationTiming) {
      gv.seizoenVan = usage.applicationTiming.fromMonth;
      gv.seizoenTot = usage.applicationTiming.toMonth;
      if (!enrichedFields.includes('seizoen')) enrichedFields.push('seizoen');
    }

    if (usage.watervolumeScale) {
      gv.spuitvolumeMin = usage.watervolumeScale.min;
      gv.spuitvolumeMax = usage.watervolumeScale.max;
      if (!enrichedFields.includes('spuitvolume')) enrichedFields.push('spuitvolume');
    }

    if (usage.maximumProductDosePerCropSeason) {
      gv.maxDoseringPerSeizoen = `${usage.maximumProductDosePerCropSeason.ratio} ${usage.maximumProductDosePerCropSeason.measure?.unit || ''}`.trim();
      if (!enrichedFields.includes('maxDoseringPerSeizoen')) enrichedFields.push('maxDoseringPerSeizoen');
    }

    if (usage.minimumIntervalBetweenApplications !== undefined) {
      gv.intervalDagen = usage.minimumIntervalBetweenApplications;
      if (!enrichedFields.includes('intervalDagen')) enrichedFields.push('intervalDagen');
    }

    if (usage.phiDays !== undefined) {
      gv.phiDagen = usage.phiDays;
      if (!enrichedFields.includes('phiDagen')) enrichedFields.push('phiDagen');
    }

    gebruiksvoorschriften.push(gv);
  }

  // Step 4: Update database
  if (!isDryRun && gebruiksvoorschriften.length > 0) {
    const { error } = await supabase
      .from('ctgb_products')
      .update({
        gebruiksvoorschriften,
        last_synced_at: new Date().toISOString(),
      })
      .eq('toelatingsnummer', toelatingsnummer);

    if (error) {
      console.error(`  ❌ ${naam}: DB update fout: ${error.message}`);
      return { updated: false, gvCount: gebruiksvoorschriften.length, enrichedFields };
    }
  }

  return { updated: true, gvCount: gebruiksvoorschriften.length, enrichedFields };
}

async function main() {
  console.log('🔄 CTGB Data Enrichment');
  console.log(`   Dry run: ${isDryRun}`);
  console.log(`   Limit: ${limit === Infinity ? 'all' : limit}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  // Get all products from DB
  const allProducts: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ctgb_products')
      .select('id, toelatingsnummer, naam')
      .order('naam')
      .range(from, from + 499);
    if (error || !data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 500) break;
    from += 500;
  }

  console.log(`📦 Found ${allProducts.length} products in database\n`);

  const toProcess = allProducts.slice(0, limit);
  let updated = 0;
  let failed = 0;
  let totalGV = 0;
  const allEnrichedFields = new Set<string>();

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    process.stdout.write(`\r  [${i + 1}/${toProcess.length}] ${product.naam.padEnd(40)}`);

    try {
      const result = await enrichProduct(product);
      if (result.updated) {
        updated++;
        totalGV += result.gvCount;
        result.enrichedFields.forEach(f => allEnrichedFields.add(f));
      } else {
        failed++;
      }
    } catch (err: any) {
      console.error(`\n  ❌ ${product.naam}: ${err.message}`);
      failed++;
    }

    // Rate limiting: 200ms between requests (2 requests per product)
    await sleep(200);
  }

  console.log(`\n\n📊 Enrichment Summary:`);
  console.log(`   Processed: ${toProcess.length}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total GV entries: ${totalGV}`);
  console.log(`   Enriched fields: ${[...allEnrichedFields].join(', ') || 'none'}`);

  if (isDryRun) {
    console.log('\n   ⚠️ DRY RUN — no changes written to database');
  }
}

main().catch(console.error);
