#!/usr/bin/env npx tsx
/**
 * CTGB MST Database Sync Script
 *
 * Dit script synchroniseert ALLE toegelaten gewasbeschermingsmiddelen
 * van de CTGB MST API naar je lokale Firestore database.
 *
 * Gebruik:
 *   npx tsx scripts/sync-ctgb.ts
 *
 * Opties:
 *   --dry-run     Haal data op maar schrijf niet naar Firestore
 *   --limit=N     Beperk tot N producten (voor testen)
 *   --skip-details  Sla detail fetch over (alleen basis info)
 *
 * Voorbeelden:
 *   npx tsx scripts/sync-ctgb.ts --dry-run --limit=10
 *   npx tsx scripts/sync-ctgb.ts --limit=50
 *   npx tsx scripts/sync-ctgb.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const MST_API_BASE = 'http://public.mst.ctgb.nl/public-api/1.0';
const CTGB_PRODUCTS_COLLECTION = 'ctgb_products';
const PAGE_SIZE = 50; // MST API default/max per page
const FIRESTORE_BATCH_SIZE = 500;
const CONCURRENT_DETAIL_FETCHES = 5; // Parallel detail fetches
const DELAY_BETWEEN_PAGES_MS = 500; // Be nice to the API
const DELAY_BETWEEN_DETAILS_MS = 100;

// Firebase config from environment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ============================================
// TYPES
// ============================================

// Product type / "Aard van het middel" - from CTGB outcomeTypes
type CtgbProductType =
  | 'Fungicide'           // Schimmelbestrijdingsmiddel
  | 'Insecticide'         // Insectenbestrijdingsmiddel
  | 'Herbicide'           // Onkruidbestrijdingsmiddel
  | 'Groeiregulator'      // Groeiregulator
  | 'Kiemremmingsmiddel'  // Kiemremmingsmiddel
  | 'Acaricide'           // Mijtenbestrijdingsmiddel
  | 'Molluscicide'        // Slakkenbestrijdingsmiddel
  | 'Rodenticide'         // Knaagdierbestrijdingsmiddel
  | 'Overig';             // Other/Unknown

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
  // Common variations
  'Fungicide': 'Fungicide',
  'Insecticide': 'Insecticide',
  'Herbicide': 'Herbicide',
  'Acaricide': 'Acaricide',
};

interface CtgbProduct {
  // Identifiers
  id: string;
  toelatingsnummer: string;
  naam: string;

  // Status
  status: string;
  vervaldatum: string;
  categorie: string;

  // Company
  toelatingshouder?: string;

  // Product types ("Aard van het middel")
  productTypes: CtgbProductType[];

  // Substances
  werkzameStoffen: string[];

  // Composition
  samenstelling?: {
    formuleringstype?: string;
    stoffen: {
      naam: string;
      concentratie?: string;
      casNummer?: string;
    }[];
  };

  // Usages (gebruiksvoorschriften)
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

  // Labelling
  etikettering?: {
    ghsSymbolen?: string[];
    hZinnen?: { code: string; tekst: string }[];
    pZinnen?: { code: string; tekst: string }[];
    signaalwoord?: string;
  };

  // Search helper
  searchKeywords: string[];

  // Metadata
  lastSyncedAt: string;
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
 * Clean an object for Firestore by removing undefined values
 * Firestore does not accept undefined - only null or omitted keys
 */
function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as T;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => cleanForFirestore(item)) as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }

  return obj;
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
      // Collect text from targetOrganisms
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

      // Collect remarks
      if (use.remarks) allText.push(use.remarks.toLowerCase());
    }

    const combinedText = allText.join(' ');

    // Keyword-based inference
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

  // If still no types, return Overig
  if (types.length === 0) {
    types.push('Overig');
  }

  return types;
}

/**
 * Generate search keywords for Firestore text search
 * Creates prefixes of the product name for partial matching
 */
function generateSearchKeywords(name: string): string[] {
  const keywords: string[] = [];
  const normalized = name.toLowerCase().trim();

  // Add full name
  keywords.push(normalized);

  // Add each word
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length >= 2) {
      keywords.push(word);
      // Add prefixes (min 2 chars, max 15)
      for (let i = 2; i <= Math.min(word.length, 15); i++) {
        keywords.push(word.substring(0, i));
      }
    }
  }

  // Remove duplicates and return
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

      // Check limit
      if (allProducts.length >= limit) {
        console.log(`\n  Limit bereikt (${limit}), stoppen met ophalen.`);
        break;
      }

      // Rate limiting
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

    // Extract product types ("Aard van het middel")
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
    // Return basic info if detail fetch fails
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

  // Process in chunks for controlled concurrency
  for (let i = 0; i < products.length; i += CONCURRENT_DETAIL_FETCHES) {
    const chunk = products.slice(i, i + CONCURRENT_DETAIL_FETCHES);

    const chunkResults = await Promise.all(
      chunk.map(product => fetchProductDetails(product))
    );

    results.push(...chunkResults);

    process.stdout.write(`\r  Details opgehaald: ${results.length}/${total}`);

    // Rate limiting between chunks
    if (i + CONCURRENT_DETAIL_FETCHES < products.length) {
      await sleep(DELAY_BETWEEN_DETAILS_MS);
    }
  }

  console.log('\n');
  return results;
}

/**
 * Save products to Firestore in batches
 */
async function saveToFirestore(products: CtgbProduct[]): Promise<void> {
  console.log('--- Stap 3: Opslaan in Firestore ---\n');

  if (isDryRun) {
    console.log('  --dry-run: Geen data opgeslagen.');
    console.log(`  Zou ${products.length} producten opslaan.`);
    return;
  }

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const collectionRef = collection(db, CTGB_PRODUCTS_COLLECTION);
  let savedCount = 0;

  // Process in batches of 500
  for (let i = 0; i < products.length; i += FIRESTORE_BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = products.slice(i, i + FIRESTORE_BATCH_SIZE);

    for (const product of chunk) {
      // Use toelatingsnummer as document ID for idempotency
      // Fall back to MST ID if no toelatingsnummer
      const docId = product.toelatingsnummer || product.id;
      const docRef = doc(collectionRef, docId);
      // Clean undefined values - Firestore doesn't accept undefined
      const cleanedProduct = cleanForFirestore(product);
      batch.set(docRef, cleanedProduct);
    }

    await batch.commit();
    savedCount += chunk.length;

    process.stdout.write(`\r  Opgeslagen: ${savedCount}/${products.length}`);
  }

  console.log('\n');
}

/**
 * Get current stats from Firestore
 */
async function getFirestoreStats(): Promise<{ count: number }> {
  try {
    const app = initializeApp(firebaseConfig, 'stats-app');
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, CTGB_PRODUCTS_COLLECTION));
    return { count: snapshot.size };
  } catch {
    return { count: 0 };
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║       CTGB MST Database Synchronisatie             ║');
  console.log('╚════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - Geen wijzigingen worden opgeslagen\n');
  }

  if (limit < Infinity) {
    console.log(`📊 Limit: ${limit} producten\n`);
  }

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

    // Step 3: Save to Firestore
    await saveToFirestore(detailedProducts);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const usagesCount = detailedProducts.reduce(
      (sum, p) => sum + (p.gebruiksvoorschriften?.length || 0),
      0
    );

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║                   SAMENVATTING                      ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  Producten gesynchroniseerd: ${String(detailedProducts.length).padStart(20)} ║`);
    console.log(`║  Gebruiksvoorschriften:      ${String(usagesCount).padStart(20)} ║`);
    console.log(`║  Duur:                       ${String(duration + 's').padStart(20)} ║`);
    console.log(`║  Collectie:                  ${CTGB_PRODUCTS_COLLECTION.padStart(20)} ║`);
    console.log('╚════════════════════════════════════════════════════╝');

    if (!isDryRun) {
      console.log('\n✅ Synchronisatie voltooid!');
      console.log('\nJe kunt nu zoeken in Firestore met:');
      console.log("  where('searchKeywords', 'array-contains', 'merpan')");
    }

  } catch (error) {
    console.error('\n❌ Fout tijdens synchronisatie:', error);
    process.exit(1);
  }
}

main();
