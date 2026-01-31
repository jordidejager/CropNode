#!/usr/bin/env npx tsx
/**
 * CTGB MST Database Sync Script (Supabase)
 *
 * Dit script synchroniseert ALLE toegelaten gewasbeschermingsmiddelen
 * van de CTGB MST API naar je Supabase database.
 *
 * Gebruik:
 *   npx tsx scripts/sync-ctgb-supabase.ts
 *
 * Opties:
 *   --dry-run     Haal data op maar schrijf niet naar Supabase
 *   --limit=N     Beperk tot N producten (voor testen)
 *   --skip-details  Sla detail fetch over (alleen basis info)
 *
 * Voorbeelden:
 *   npx tsx scripts/sync-ctgb-supabase.ts --dry-run --limit=10
 *   npx tsx scripts/sync-ctgb-supabase.ts --limit=50
 *   npx tsx scripts/sync-ctgb-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// ============================================
// CONFIGURATION
// ============================================

const MST_API_BASE = 'https://public.mst.ctgb.nl/public-api/1.0';
const PAGE_SIZE = 50;
const SUPABASE_BATCH_SIZE = 100; // Supabase recommends smaller batches
const CONCURRENT_DETAIL_FETCHES = 5;
const DELAY_BETWEEN_PAGES_MS = 500;
const DELAY_BETWEEN_DETAILS_MS = 100;

// Supabase config from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// TYPES
// ============================================

// Product type / "Aard van het middel" - from CTGB outcomeTypes
type CtgbProductType =
  | 'Fungicide'
  | 'Insecticide'
  | 'Herbicide'
  | 'Groeiregulator'
  | 'Kiemremmingsmiddel'
  | 'Acaricide'
  | 'Molluscicide'
  | 'Rodenticide'
  | 'Overig';

// Mapping from CTGB outcomeTypes description to our product type
const OUTCOME_TYPE_MAPPING: Record<string, CtgbProductType> = {
  'Schimmelbestrijdingsmiddel': 'Fungicide',
  'Insectenbestrijdingsmiddel': 'Insecticide',
  'Onkruidbestrijdingsmiddel': 'Herbicide',
  'Groeiregulator': 'Groeiregulator',
  'Kiemremmingsmiddel': 'Kiemremmingsmiddel',
  'Mijtenbestrijdingsmiddel': 'Acaricide',
  'Slakkenbestrijdingsmiddel': 'Molluscicide',
  'Knaagdierbestrijdingsmiddel': 'Rodenticide',
  'Fungicide': 'Fungicide',
  'Insecticide': 'Insecticide',
  'Herbicide': 'Herbicide',
  'Acaricide': 'Acaricide',
};

interface CtgbProduct {
  id: string;
  toelatingsnummer: string;
  naam: string;
  status: string;
  vervaldatum: string;
  categorie: string;
  toelatingshouder?: string;
  productTypes: CtgbProductType[];
  werkzameStoffen: string[];
  samenstelling?: {
    formuleringstype?: string;
    stoffen: {
      naam: string;
      concentratie?: string;
      casNummer?: string;
    }[];
  };
  gebruiksvoorschriften: {
    gewas: string;
    doelorganisme?: string;
    locatie?: string;
    toepassingsmethode?: string;
    dosering?: string;
    maxToepassingen?: number;
    veiligheidstermijn?: string;
    interval?: string;
    opmerkingen?: string[];
    wCodes?: string[];
  }[];
  etikettering?: {
    ghsSymbolen?: string[];
    hZinnen?: { code: string; tekst: string }[];
    pZinnen?: { code: string; tekst: string }[];
    signaalwoord?: string;
  };
  searchKeywords: string[];
  lastSyncedAt: string;
}

// Supabase row format (snake_case)
interface SupabaseCtgbRow {
  id: string;
  toelatingsnummer: string;
  naam: string;
  status: string;
  vervaldatum: string;
  categorie: string;
  toelatingshouder: string | null;
  product_types: CtgbProductType[];
  werkzame_stoffen: string[];
  samenstelling: any | null;
  gebruiksvoorschriften: any[];
  etikettering: any | null;
  search_keywords: string[];
  last_synced_at: string;
}

interface SearchResult {
  id: string;
  name: string;
  registrationNumber: string;
  expirationDate: string;
}

interface SearchResponse {
  meta: { total: number; offset: number; limit: number };
  data: SearchResult[];
}

// ============================================
// CLI ARGUMENTS
// ============================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipDetails = args.includes('--skip-details');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ============================================
// HELPER FUNCTIONS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract product types from CTGB outcomeTypes
 * Falls back to text analysis if outcomeTypes is empty
 */
function extractProductTypes(data: any): CtgbProductType[] {
  const types: CtgbProductType[] = [];

  // Primary: Extract from outcomeTypes field
  if (data.outcomeTypes && Array.isArray(data.outcomeTypes)) {
    for (const ot of data.outcomeTypes) {
      const description = ot.description || '';
      const mapped = OUTCOME_TYPE_MAPPING[description];
      if (mapped && !types.includes(mapped)) {
        types.push(mapped);
      }
    }
  }

  // Fallback: If no types found, try to infer from uses/targetOrganisms
  if (types.length === 0 && data.uses && Array.isArray(data.uses)) {
    const allText: string[] = [];

    for (const use of data.uses) {
      if (use.targetOrganisms && Array.isArray(use.targetOrganisms)) {
        const extractOrganismText = (items: any[]): void => {
          for (const item of items) {
            if (item.groupScientific) allText.push(item.groupScientific.toLowerCase());
            if (item.organismScientific) allText.push(item.organismScientific.toLowerCase());
            if (item.items) extractOrganismText(item.items);
          }
        };
        extractOrganismText(use.targetOrganisms);
      }
      if (use.remarks) allText.push(use.remarks.toLowerCase());
    }

    const combinedText = allText.join(' ');

    const keywordPatterns: { pattern: RegExp; type: CtgbProductType }[] = [
      { pattern: /schimmel|fungus|meeldauw|roest|botrytis|phytophthora/i, type: 'Fungicide' },
      { pattern: /insect|luis|kever|vlieg|mot|rups|trips|bladluis/i, type: 'Insecticide' },
      { pattern: /onkruid|gras|wortel.*onkruid|akker.*onkruid/i, type: 'Herbicide' },
      { pattern: /groeiregulat|kiemrem|kieming/i, type: 'Groeiregulator' },
      { pattern: /mijt|spint/i, type: 'Acaricide' },
      { pattern: /slak|naaktslak/i, type: 'Molluscicide' },
    ];

    for (const { pattern, type } of keywordPatterns) {
      if (pattern.test(combinedText) && !types.includes(type)) {
        types.push(type);
      }
    }
  }

  if (types.length === 0) {
    types.push('Overig');
  }

  return types;
}

/**
 * Generate search keywords for text search
 */
function generateSearchKeywords(name: string): string[] {
  const keywords: string[] = [];
  const normalized = name.toLowerCase().trim();

  keywords.push(normalized);

  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length >= 2) {
      keywords.push(word);
      for (let i = 2; i <= Math.min(word.length, 15); i++) {
        keywords.push(word.substring(0, i));
      }
    }
  }

  return [...new Set(keywords)];
}

/**
 * Fetch from MST API with retry logic
 */
async function fetchMST<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`  Retry ${attempt}/${retries} for ${url}`);
      await sleep(1000 * attempt);
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Fetch all products with pagination
 */
async function fetchAllProducts(): Promise<SearchResult[]> {
  const allProducts: SearchResult[] = [];
  let offset = 0;
  let total = 0;

  console.log('\n--- Stap 1: Ophalen product lijst ---\n');

  do {
    const params = new URLSearchParams();
    params.set('filter[categoryType]', 'PPP');
    params.set('filter[productStatus]', 'Valid');
    params.set('page[offset]', String(offset));
    params.set('page[limit]', String(PAGE_SIZE));
    params.set('sort', 'productName');

    const url = `${MST_API_BASE}/authorisations?${params.toString()}`;

    try {
      const response = await fetchMST<SearchResponse>(url);
      total = response.meta.total;
      const products = response.data || [];

      allProducts.push(...products);

      const progress = Math.min(allProducts.length, total);
      process.stdout.write(`\r  Opgehaald: ${progress}/${total} producten`);

      offset += PAGE_SIZE;

      if (allProducts.length >= limit) {
        console.log(`\n  Limit bereikt (${limit}), stoppen met ophalen.`);
        break;
      }

      if (offset < total) {
        await sleep(DELAY_BETWEEN_PAGES_MS);
      }
    } catch (error) {
      console.error(`\nFout bij offset ${offset}:`, error);
      throw error;
    }
  } while (offset < total);

  console.log('\n');
  return allProducts.slice(0, limit);
}

/**
 * Extract crop names from hierarchical structure
 */
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

/**
 * Extract organism names from hierarchical structure
 */
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

/**
 * Fetch product details and transform to our format
 */
async function fetchProductDetails(product: SearchResult): Promise<CtgbProduct> {
  const params = new URLSearchParams();
  params.set('filter[locale]', 'nl');

  const url = `${MST_API_BASE}/authorisations/${product.id}?${params.toString()}`;

  try {
    const response = await fetchMST<{ data: any }>(url);
    const data = response.data || response;

    // Extract substances
    const werkzameStoffen: string[] = [];
    const compositions = data.compositions;
    if (compositions?.substances && Array.isArray(compositions.substances)) {
      for (const sub of compositions.substances) {
        const name = sub.substance?.name || sub.name;
        if (name && !werkzameStoffen.includes(name)) {
          werkzameStoffen.push(name);
        }
      }
    }

    // Extract samenstelling
    let samenstelling: CtgbProduct['samenstelling'];
    if (compositions?.substances) {
      samenstelling = {
        formuleringstype: compositions.formulationType?.description,
        stoffen: compositions.substances.map((s: any) => ({
          naam: s.substance?.name || s.name || 'Onbekend',
          concentratie: s.concentration
            ? `${s.concentration} ${s.concentrationUnit?.unit || ''}`
            : undefined,
          casNummer: s.substance?.casNumber || s.casNumber,
        })),
      };
    }

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

    // Extract usages
    const gebruiksvoorschriften: CtgbProduct['gebruiksvoorschriften'] = [];
    const uses = data.uses || [];

    if (Array.isArray(uses)) {
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

        const opmerkingen: string[] = [];
        if (usage.remarks) opmerkingen.push(usage.remarks);
        if (usage.restrictions) opmerkingen.push(...usage.restrictions);

        gebruiksvoorschriften.push({
          gewas: gewassen.join(', ') || 'Algemeen',
          doelorganisme: doelorganismen.length > 0 ? doelorganismen.join(', ') : undefined,
          locatie: locaties.length > 0 ? locaties.join(', ') : undefined,
          toepassingsmethode: methodes.length > 0 ? methodes.join(', ') : undefined,
          dosering,
          maxToepassingen: usage.amountOfApplications?.perCropSeason,
          veiligheidstermijn: usage.phiDays !== undefined ? `${usage.phiDays} dagen` : undefined,
          interval: usage.minimumIntervalBetweenApplications
            ? `min. ${usage.minimumIntervalBetweenApplications} dagen`
            : undefined,
          opmerkingen: opmerkingen.length > 0 ? opmerkingen : undefined,
          wCodes: wCodes.length > 0 ? wCodes : undefined,
        });
      }
    }

    // Extract labelling
    let etikettering: CtgbProduct['etikettering'];
    if (data.components?.[0]?.labelling) {
      const labellings = data.components[0].labelling;
      const labelling = Array.isArray(labellings) ? labellings[0] : labellings;

      if (labelling) {
        etikettering = {
          ghsSymbolen: labelling.symbolCodes?.map((s: any) => s.code),
          hZinnen: labelling.hazardStatements?.map((h: any) => ({
            code: h.code,
            tekst: h.statement,
          })),
          pZinnen: labelling.precautionaryStatements?.map((p: any) => ({
            code: p.code,
            tekst: p.statement,
          })),
          signaalwoord: labelling.signalWord?.description,
        };
      }
    }

    // Extract product types
    const productTypes = extractProductTypes(data);

    return {
      id: String(data.id || product.id),
      toelatingsnummer: data.authorisation?.registrationNumber?.nl || product.registrationNumber || '',
      naam: data.name || product.name,
      status: 'Valid',
      vervaldatum: data.authorisation?.expirationDate || product.expirationDate || '',
      categorie: data.categoryType?.description || 'Gewasbeschermingsmiddel',
      toelatingshouder: data.authorisationHolder?.companyName,
      productTypes,
      werkzameStoffen,
      samenstelling,
      gebruiksvoorschriften,
      etikettering,
      searchKeywords: generateSearchKeywords(data.name || product.name),
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`\n  Waarschuwing: Kon details niet ophalen voor ${product.name}`);
    return {
      id: String(product.id),
      toelatingsnummer: product.registrationNumber || '',
      naam: product.name,
      status: 'Valid',
      vervaldatum: product.expirationDate || '',
      categorie: 'Gewasbeschermingsmiddel',
      productTypes: ['Overig'],
      werkzameStoffen: [],
      gebruiksvoorschriften: [],
      searchKeywords: generateSearchKeywords(product.name),
      lastSyncedAt: new Date().toISOString(),
    };
  }
}

/**
 * Fetch details for multiple products with controlled concurrency
 */
async function fetchAllDetails(products: SearchResult[]): Promise<CtgbProduct[]> {
  console.log('--- Stap 2: Ophalen product details ---\n');

  if (skipDetails) {
    console.log('  --skip-details: Details overgeslagen, alleen basis info.');
    return products.map(p => ({
      id: String(p.id),
      toelatingsnummer: p.registrationNumber || '',
      naam: p.name,
      status: 'Valid',
      vervaldatum: p.expirationDate || '',
      categorie: 'Gewasbeschermingsmiddel',
      productTypes: ['Overig'] as CtgbProductType[],
      werkzameStoffen: [],
      gebruiksvoorschriften: [],
      searchKeywords: generateSearchKeywords(p.name),
      lastSyncedAt: new Date().toISOString(),
    }));
  }

  const results: CtgbProduct[] = [];
  const total = products.length;

  for (let i = 0; i < products.length; i += CONCURRENT_DETAIL_FETCHES) {
    const chunk = products.slice(i, i + CONCURRENT_DETAIL_FETCHES);

    const chunkResults = await Promise.all(
      chunk.map(product => fetchProductDetails(product))
    );

    results.push(...chunkResults);

    process.stdout.write(`\r  Details opgehaald: ${results.length}/${total}`);

    if (i + CONCURRENT_DETAIL_FETCHES < products.length) {
      await sleep(DELAY_BETWEEN_DETAILS_MS);
    }
  }

  console.log('\n');
  return results;
}

/**
 * Convert product to Supabase row format (snake_case)
 * Uses toelatingsnummer as id to match existing data
 */
function toSupabaseRow(product: CtgbProduct): SupabaseCtgbRow {
  return {
    id: product.toelatingsnummer || product.id, // Use toelatingsnummer as id to match existing records
    toelatingsnummer: product.toelatingsnummer,
    naam: product.naam,
    status: product.status,
    vervaldatum: product.vervaldatum,
    categorie: product.categorie,
    toelatingshouder: product.toelatingshouder || null,
    product_types: product.productTypes,
    werkzame_stoffen: product.werkzameStoffen,
    samenstelling: product.samenstelling || null,
    gebruiksvoorschriften: product.gebruiksvoorschriften,
    etikettering: product.etikettering || null,
    search_keywords: product.searchKeywords,
    last_synced_at: product.lastSyncedAt,
  };
}

/**
 * Retry wrapper for Supabase operations
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(`\n  Retry ${attempt}/${maxRetries} na fout: ${error.message}`);
        await sleep(delay * attempt);
      }
    }
  }
  throw lastError;
}

/**
 * Save products to Supabase in batches using upsert
 */
async function saveToSupabase(products: CtgbProduct[]): Promise<void> {
  console.log('--- Stap 3: Opslaan in Supabase ---\n');

  if (isDryRun) {
    console.log('  --dry-run: Geen data opgeslagen.');
    console.log(`  Zou ${products.length} producten opslaan.`);

    // Show sample of what would be saved
    if (products.length > 0) {
      console.log('\n  Voorbeeld product:');
      console.log(`    Naam: ${products[0].naam}`);
      console.log(`    Types: ${products[0].productTypes.join(', ')}`);
      console.log(`    Stoffen: ${products[0].werkzameStoffen.join(', ')}`);
    }
    return;
  }

  let savedCount = 0;
  let errorCount = 0;

  // Process in smaller batches (10 at a time for stability)
  const BATCH_SIZE = 10;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const rows = batch.map(toSupabaseRow);

    try {
      await withRetry(async () => {
        const { error } = await supabase
          .from('ctgb_products')
          .upsert(rows, {
            onConflict: 'id',
            ignoreDuplicates: false,
          });

        if (error) {
          throw new Error(error.message);
        }
      });

      savedCount += batch.length;
    } catch (error: any) {
      console.error(`\n  Fout bij batch ${i}-${i + batch.length}:`, error.message);
      errorCount += batch.length;
    }

    process.stdout.write(`\r  Opgeslagen: ${savedCount}/${products.length}`);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < products.length) {
      await sleep(200);
    }
  }

  console.log('\n');

  if (errorCount > 0) {
    console.warn(`  ⚠️  ${errorCount} producten konden niet worden opgeslagen.`);
  }
}

/**
 * Get current stats from Supabase
 */
async function getSupabaseStats(): Promise<{ count: number }> {
  const { count, error } = await supabase
    .from('ctgb_products')
    .select('*', { count: 'exact', head: true });

  if (error) return { count: 0 };
  return { count: count || 0 };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║    CTGB MST Database Synchronisatie (Supabase)     ║');
  console.log('╚════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - Geen wijzigingen worden opgeslagen\n');
  }

  if (limit < Infinity) {
    console.log(`📊 Limit: ${limit} producten\n`);
  }

  // Show current stats
  const currentStats = await getSupabaseStats();
  console.log(`📦 Huidige database: ${currentStats.count} producten\n`);

  const startTime = Date.now();

  try {
    // Step 1: Fetch all products
    const products = await fetchAllProducts();
    console.log(`✓ ${products.length} producten gevonden\n`);

    if (products.length === 0) {
      console.log('Geen producten gevonden. Einde.');
      return;
    }

    // Step 2: Fetch details
    const detailedProducts = await fetchAllDetails(products);

    // Step 3: Save to Supabase
    await saveToSupabase(detailedProducts);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const usagesCount = detailedProducts.reduce(
      (sum, p) => sum + (p.gebruiksvoorschriften?.length || 0),
      0
    );

    // Count product types
    const typeStats: Record<string, number> = {};
    for (const product of detailedProducts) {
      for (const type of product.productTypes) {
        typeStats[type] = (typeStats[type] || 0) + 1;
      }
    }

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║                   SAMENVATTING                      ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  Producten gesynchroniseerd: ${String(detailedProducts.length).padStart(20)} ║`);
    console.log(`║  Gebruiksvoorschriften:      ${String(usagesCount).padStart(20)} ║`);
    console.log(`║  Duur:                       ${String(duration + 's').padStart(20)} ║`);
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║  Product Types:                                    ║');
    for (const [type, count] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
      console.log(`║    ${type.padEnd(25)} ${String(count).padStart(14)} ║`);
    }
    console.log('╚════════════════════════════════════════════════════╝');

    if (!isDryRun) {
      console.log('\n✅ Synchronisatie voltooid!');
    }

  } catch (error) {
    console.error('\n❌ Fout tijdens synchronisatie:', error);
    process.exit(1);
  }
}

main();
