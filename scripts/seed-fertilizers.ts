#!/usr/bin/env npx tsx
/**
 * Fertilizers Seed Script
 *
 * Dit script leest fertilizers-dump.json en vult de Firestore 'fertilizers' collectie.
 * Het script is idempotent - het kan meerdere keren worden uitgevoerd zonder dubbele data.
 *
 * Gebruik:
 *   npx tsx scripts/seed-fertilizers.ts
 *
 * Opties:
 *   --dry-run     Lees en transformeer data maar schrijf niet naar Firestore
 *   --limit=N     Beperk tot N producten (voor testen)
 *
 * Voorbeelden:
 *   npx tsx scripts/seed-fertilizers.ts --dry-run --limit=10
 *   npx tsx scripts/seed-fertilizers.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

const FERTILIZERS_COLLECTION = 'fertilizers';
const FIRESTORE_BATCH_SIZE = 500;
const JSON_FILE_PATH = path.join(process.cwd(), 'fertilizers-dump.json');

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

interface FertilizerProduct {
  name: string;
  manufacturer: string;
  category: 'Leaf' | 'Fertigation' | 'Soil';
  unit: 'L' | 'kg';
  composition: {
    N?: number;
    P?: number;
    K?: number;
    MgO?: number;
    SO3?: number;
    CaO?: number;
    S?: number;
    Fe?: number;
    Mn?: number;
    Zn?: number;
    Cu?: number;
    B?: number;
    Mo?: number;
  };
  searchKeywords: string[];
}

interface RawFertilizer {
  productId: string;
  id: string;
  name: string;
  description: string;
  supplier: {
    id: string;
    name: string;
    [key: string]: any;
  };
  producer?: {
    name: string;
    [key: string]: any;
  };
  state: string;
}

interface JsonDump {
  page: number;
  pageSize: number;
  total: number;
  data: RawFertilizer[];
}

// ============================================
// CLI ARGUMENTS
// ============================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ============================================
// COMPOSITION PARSING
// ============================================

/**
 * Parse NPK and other nutrient values from product name
 * Handles patterns like:
 * - "10+15+15" or "18-6-24" (N-P-K)
 * - "24N" or "27N" (single element)
 * - "+18SO3" or "+3MgO" (additional elements)
 * - "2MgO" or "2.2MgO" (with decimals)
 * - "14CaO+5MgO" (multiple extra elements)
 */
function parseComposition(name: string, description: string): FertilizerProduct['composition'] {
  const composition: FertilizerProduct['composition'] = {};
  const text = `${name} ${description}`.toUpperCase();

  // Pattern 1: NPK format like "10+15+15" or "18-6-24" or "12-12-17"
  // Match patterns where we have 3 numbers separated by + or -
  const npkPattern = /(\d+(?:[.,]\d+)?)\s*[\+\-]\s*(\d+(?:[.,]\d+)?)\s*[\+\-]\s*(\d+(?:[.,]\d+)?)/;
  const npkMatch = text.match(npkPattern);
  if (npkMatch) {
    composition.N = parseFloat(npkMatch[1].replace(',', '.'));
    composition.P = parseFloat(npkMatch[2].replace(',', '.'));
    composition.K = parseFloat(npkMatch[3].replace(',', '.'));
  }

  // Pattern 2: Single N value like "24N" or "27 N"
  // Only use if N wasn't already found in NPK pattern
  if (composition.N === undefined) {
    const singleNPattern = /(\d+(?:[.,]\d+)?)\s*N(?![A-Z])/;
    const singleNMatch = text.match(singleNPattern);
    if (singleNMatch) {
      composition.N = parseFloat(singleNMatch[1].replace(',', '.'));
    }
  }

  // Pattern 3: MgO values like "+3MgO", "2MgO", "2.2MgO", "+2MGO"
  const mgoPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*MGO/i;
  const mgoMatch = text.match(mgoPattern);
  if (mgoMatch) {
    composition.MgO = parseFloat(mgoMatch[1].replace(',', '.'));
  }

  // Pattern 4: SO3 values like "+18SO3", "35SO3"
  const so3Pattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*SO3/i;
  const so3Match = text.match(so3Pattern);
  if (so3Match) {
    composition.SO3 = parseFloat(so3Match[1].replace(',', '.'));
  }

  // Pattern 5: CaO values like "+14CaO", "17CaO"
  const caoPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*CAO/i;
  const caoMatch = text.match(caoPattern);
  if (caoMatch) {
    composition.CaO = parseFloat(caoMatch[1].replace(',', '.'));
  }

  // Pattern 6: S (sulfur) values like "12,5S" in descriptions
  // Be careful not to match SO3
  const sPattern = /[\+\s\(](\d+(?:[.,]\d+)?)\s*S(?![O])\b/i;
  const sMatch = text.match(sPattern);
  if (sMatch) {
    composition.S = parseFloat(sMatch[1].replace(',', '.'));
  }

  // Pattern 7: Fe (iron) values
  const fePattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*FE\b/i;
  const feMatch = text.match(fePattern);
  if (feMatch) {
    composition.Fe = parseFloat(feMatch[1].replace(',', '.'));
  }

  // Pattern 8: Mn (manganese) values
  const mnPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*MN\b/i;
  const mnMatch = text.match(mnPattern);
  if (mnMatch) {
    composition.Mn = parseFloat(mnMatch[1].replace(',', '.'));
  }

  // Pattern 9: Zn (zinc) values
  const znPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*ZN\b/i;
  const znMatch = text.match(znPattern);
  if (znMatch) {
    composition.Zn = parseFloat(znMatch[1].replace(',', '.'));
  }

  // Pattern 10: Cu (copper) values
  const cuPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*CU\b/i;
  const cuMatch = text.match(cuPattern);
  if (cuMatch) {
    composition.Cu = parseFloat(cuMatch[1].replace(',', '.'));
  }

  // Pattern 11: B (boron) values
  const bPattern = /[\+\s]?(\d+(?:[.,]\d+)?)\s*B(?![A-Z])/i;
  const bMatch = text.match(bPattern);
  if (bMatch) {
    composition.B = parseFloat(bMatch[1].replace(',', '.'));
  }

  return composition;
}

// ============================================
// CATEGORY & UNIT DETECTION
// ============================================

/**
 * Detect category and unit based on product name and description
 *
 * Rules:
 * - Leaf (L): vloeibaar, oplossing, liquid, spuit, foli
 * - Soil (kg): korrel, vast, strooi, granulaat, base, mix
 * - Fertigation (kg): default
 */
function detectCategoryAndUnit(
  name: string,
  description: string
): { category: FertilizerProduct['category']; unit: FertilizerProduct['unit'] } {
  const text = `${name} ${description}`.toLowerCase();

  // Leaf fertilizers (liquid, foliar application)
  const leafKeywords = ['vloeibaar', 'oplossing', 'liquid', 'spuit', 'foli', 'fluid', 'solution'];
  if (leafKeywords.some(keyword => text.includes(keyword))) {
    return { category: 'Leaf', unit: 'L' };
  }

  // Soil fertilizers (granular, solid)
  const soilKeywords = ['korrel', 'vast', 'strooi', 'granul', 'base', 'mix', 'granules', 'omhuld'];
  if (soilKeywords.some(keyword => text.includes(keyword))) {
    return { category: 'Soil', unit: 'kg' };
  }

  // Default: Fertigation
  return { category: 'Fertigation', unit: 'kg' };
}

// ============================================
// SEARCH KEYWORDS GENERATION
// ============================================

/**
 * Generate search keywords from product name
 * Creates lowercase word parts for Firestore array-contains queries
 */
function generateSearchKeywords(name: string): string[] {
  const keywords: string[] = [];
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[®™©]/g, '') // Remove trademark symbols
    .replace(/\s+/g, ' '); // Normalize whitespace

  // Add full name
  keywords.push(normalized);

  // Split by common delimiters and add each word
  const words = normalized.split(/[\s\+\-\|\(\)\/]+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-z0-9]/g, '');
    if (cleaned.length >= 2) {
      keywords.push(cleaned);
      // Add prefixes (min 2 chars, max 12)
      for (let i = 2; i <= Math.min(cleaned.length, 12); i++) {
        keywords.push(cleaned.substring(0, i));
      }
    }
  }

  // Remove duplicates
  return [...new Set(keywords)];
}

// ============================================
// DATA TRANSFORMATION
// ============================================

/**
 * Transform raw JSON item to FertilizerProduct
 */
function transformFertilizer(raw: RawFertilizer): FertilizerProduct {
  const { category, unit } = detectCategoryAndUnit(raw.name, raw.description || '');
  const composition = parseComposition(raw.name, raw.description || '');
  const searchKeywords = generateSearchKeywords(raw.name);

  return {
    name: raw.name.trim(),
    manufacturer: raw.supplier?.name || 'Onbekend',
    category,
    unit,
    composition,
    searchKeywords,
  };
}

// ============================================
// FIRESTORE OPERATIONS
// ============================================

/**
 * Clean object for Firestore (remove undefined values)
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
        const cleanedValue = cleanForFirestore(value);
        // Also skip empty objects in composition
        if (
          key === 'composition' &&
          typeof cleanedValue === 'object' &&
          Object.keys(cleanedValue as object).length === 0
        ) {
          continue;
        }
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned as T;
  }

  return obj;
}

/**
 * Save products to Firestore in batches
 */
async function saveToFirestore(
  products: { productId: string; data: FertilizerProduct }[]
): Promise<void> {
  console.log('\n--- Stap 2: Opslaan in Firestore ---\n');

  if (isDryRun) {
    console.log('  --dry-run: Geen data opgeslagen.');
    console.log(`  Zou ${products.length} producten opslaan.`);

    // Show sample transformations
    console.log('\n  Voorbeeld transformaties (eerste 5):');
    for (const { productId, data } of products.slice(0, 5)) {
      console.log(`\n  ID: ${productId}`);
      console.log(`    Name: ${data.name}`);
      console.log(`    Manufacturer: ${data.manufacturer}`);
      console.log(`    Category: ${data.category}, Unit: ${data.unit}`);
      console.log(`    Composition:`, JSON.stringify(data.composition));
    }
    return;
  }

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const collectionRef = collection(db, FERTILIZERS_COLLECTION);
  let savedCount = 0;
  const totalBatches = Math.ceil(products.length / FIRESTORE_BATCH_SIZE);

  // Process in batches of 500
  for (let i = 0; i < products.length; i += FIRESTORE_BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = products.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batchNumber = Math.floor(i / FIRESTORE_BATCH_SIZE) + 1;

    for (const { productId, data } of chunk) {
      // Use productId as document ID for idempotency
      const docRef = doc(collectionRef, productId);
      const cleanedData = cleanForFirestore(data);
      batch.set(docRef, cleanedData);
    }

    await batch.commit();
    savedCount += chunk.length;

    console.log(`  Batch ${batchNumber}/${totalBatches} succesvol (${savedCount}/${products.length} producten)`);
  }

  console.log('');
}

// ============================================
// STATISTICS
// ============================================

function printStatistics(products: { productId: string; data: FertilizerProduct }[]): void {
  console.log('\n--- Statistieken ---\n');

  // Category distribution
  const categories = { Leaf: 0, Fertigation: 0, Soil: 0 };
  for (const { data } of products) {
    categories[data.category]++;
  }
  console.log('  Categorie verdeling:');
  console.log(`    Leaf:        ${categories.Leaf}`);
  console.log(`    Fertigation: ${categories.Fertigation}`);
  console.log(`    Soil:        ${categories.Soil}`);

  // Composition stats
  let withNPK = 0;
  let withN = 0;
  let withMgO = 0;
  let withSO3 = 0;
  let noComposition = 0;

  for (const { data } of products) {
    const comp = data.composition;
    const hasAny = Object.keys(comp).length > 0;

    if (!hasAny) {
      noComposition++;
    } else {
      if (comp.N !== undefined && comp.P !== undefined && comp.K !== undefined) {
        withNPK++;
      }
      if (comp.N !== undefined) withN++;
      if (comp.MgO !== undefined) withMgO++;
      if (comp.SO3 !== undefined) withSO3++;
    }
  }

  console.log('\n  Samenstelling analyse:');
  console.log(`    Met NPK (N+P+K):  ${withNPK}`);
  console.log(`    Met N:            ${withN}`);
  console.log(`    Met MgO:          ${withMgO}`);
  console.log(`    Met SO3:          ${withSO3}`);
  console.log(`    Geen samenstelling: ${noComposition}`);

  // Top manufacturers
  const manufacturers: Record<string, number> = {};
  for (const { data } of products) {
    manufacturers[data.manufacturer] = (manufacturers[data.manufacturer] || 0) + 1;
  }
  const topManufacturers = Object.entries(manufacturers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log('\n  Top 5 fabrikanten:');
  for (const [name, count] of topManufacturers) {
    console.log(`    ${name}: ${count}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║         Fertilizers Database Seeding               ║');
  console.log('╚════════════════════════════════════════════════════╝');

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - Geen wijzigingen worden opgeslagen\n');
  }

  if (limit < Infinity) {
    console.log(`📊 Limit: ${limit} producten\n`);
  }

  const startTime = Date.now();

  try {
    // Step 1: Read and parse JSON file
    console.log('--- Stap 1: Lezen van fertilizers-dump.json ---\n');

    if (!fs.existsSync(JSON_FILE_PATH)) {
      throw new Error(`Bestand niet gevonden: ${JSON_FILE_PATH}`);
    }

    const rawData = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
    const jsonData: JsonDump = JSON.parse(rawData);

    console.log(`  Totaal in bestand: ${jsonData.total} producten`);

    // Get items (apply limit if specified)
    const rawItems = jsonData.data.slice(0, limit);
    console.log(`  Te verwerken: ${rawItems.length} producten\n`);

    if (rawItems.length === 0) {
      console.log('Geen producten gevonden. Einde.');
      return;
    }

    // Transform all items
    console.log('  Transformeren...');
    const products = rawItems.map(raw => ({
      productId: raw.productId,
      data: transformFertilizer(raw),
    }));
    console.log(`  ✓ ${products.length} producten getransformeerd\n`);

    // Print statistics
    printStatistics(products);

    // Step 2: Save to Firestore
    await saveToFirestore(products);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║                   SAMENVATTING                      ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  Producten verwerkt:         ${String(products.length).padStart(20)} ║`);
    console.log(`║  Duur:                       ${String(duration + 's').padStart(20)} ║`);
    console.log(`║  Collectie:                  ${FERTILIZERS_COLLECTION.padStart(20)} ║`);
    console.log('╚════════════════════════════════════════════════════╝');

    if (!isDryRun) {
      console.log('\n✅ Seeding voltooid!');
      console.log('\nJe kunt nu zoeken in Firestore met:');
      console.log("  where('searchKeywords', 'array-contains', 'yara')");
      console.log("  where('category', '==', 'Leaf')");
    }

  } catch (error) {
    console.error('\n❌ Fout tijdens seeding:', error);
    process.exit(1);
  }
}

main();
