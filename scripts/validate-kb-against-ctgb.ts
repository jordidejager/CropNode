#!/usr/bin/env npx tsx
/**
 * Validate Knowledge Base Products Against CTGB Database
 *
 * Cross-references kb_products with ctgb_products to check:
 * - Product authorization status (toegelaten/vervallen/niet_gevonden)
 * - Dosage compliance (does KB dosage exceed CTGB max?)
 * - Crop authorization (is the product allowed for appel/peer?)
 * - Max applications per season
 *
 * Also validates kb_strategy_steps products and flags steps with only expired products.
 *
 * Usage:
 *   npx tsx scripts/validate-kb-against-ctgb.ts              # Report only
 *   npx tsx scripts/validate-kb-against-ctgb.ts --update      # Update DB + report
 *   npx tsx scripts/validate-kb-against-ctgb.ts --migrate     # Run migration first, then update
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: {
    fetch: async (url: any, init: any) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await fetch(url, init);
        } catch (e: any) {
          if (attempt < 4 && (e.code === 'ECONNRESET' || e.message?.includes('fetch failed'))) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
      throw new Error('Max retries exceeded');
    },
  },
});
const shouldUpdate = process.argv.includes('--update') || process.argv.includes('--migrate');
const shouldMigrate = process.argv.includes('--migrate');

// ============================================
// Types
// ============================================

interface KbProduct {
  id: string;
  topic_id: string;
  product_name: string;
  active_substance: string | null;
  product_type: string | null;
  applies_to: string[];
  dosage: string | null;
  timing: string | null;
  remarks: string | null;
}

interface CtgbProduct {
  toelatingsnummer: string;
  naam: string;
  status: string;
  vervaldatum: string | null;
  categorie: string | null;
  werkzame_stoffen: string[] | null;
  gebruiksvoorschriften: GebruiksVoorschrift[] | null;
}

interface GebruiksVoorschrift {
  gewas: string;
  doelorganisme?: string;
  dosering?: string;
  maxToepassingen?: number;
  veiligheidstermijn?: string;
  interval?: string;
  opmerkingen?: string[];
}

interface ProductAlias {
  alias: string;
  official_name: string;
  confidence: number;
}

interface KbTopic {
  id: string;
  slug: string;
  title: string;
}

interface KbStrategyStep {
  id: string;
  topic_id: string;
  phase: string;
  products: string[] | null;
  action: string;
}

interface ValidationResult {
  kbProductId: string;
  productName: string;
  topicTitle: string;
  topicSlug: string;
  appliesTo: string[];
  ctgbStatus: 'toegelaten' | 'vervallen' | 'niet_gevonden';
  ctgbProductId: string | null;
  ctgbMaxDosage: string | null;
  ctgbMaxApplications: number | null;
  dosageExceedsCtgb: boolean;
  ctgbCropValid: boolean;
  matchedCtgbName: string | null;
  issues: string[];
}

// ============================================
// Migration
// ============================================

async function checkMigration(): Promise<{ kbProductsReady: boolean; strategyStepsReady: boolean }> {
  console.log('🔧 Checking database columns...\n');

  // Check kb_products columns
  const { error: kbErr } = await supabase.from('kb_products').select('ctgb_status').limit(1);
  const kbProductsReady = !kbErr || !kbErr.message.includes('ctgb_status');

  // Check kb_strategy_steps columns
  const { error: stepErr } = await supabase.from('kb_strategy_steps').select('ctgb_validated').limit(1);
  const strategyStepsReady = !stepErr || !stepErr.message.includes('ctgb_validated');

  if (kbProductsReady) console.log('  ✅ kb_products CTGB kolommen aanwezig');
  else console.log('  ❌ kb_products CTGB kolommen ontbreken');

  if (strategyStepsReady) console.log('  ✅ kb_strategy_steps CTGB kolommen aanwezig');
  else console.log('  ⚠️  kb_strategy_steps CTGB kolommen ontbreken (stap review wordt overgeslagen)');

  if (!kbProductsReady) {
    console.error('\n❌ kb_products mist CTGB kolommen. Voer deze SQL uit in Supabase SQL Editor:\n');
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_status VARCHAR DEFAULT 'niet_gevalideerd';`);
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_product_id VARCHAR;`);
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_max_dosage VARCHAR;`);
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_max_applications INTEGER;`);
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS dosage_exceeds_ctgb BOOLEAN DEFAULT FALSE;`);
    console.log(`ALTER TABLE kb_products ADD COLUMN IF NOT EXISTS ctgb_crop_valid BOOLEAN DEFAULT TRUE;`);
    process.exit(1);
  }

  if (!strategyStepsReady) {
    console.log('\n⚠️  Voer deze SQL uit in Supabase SQL Editor om strategy step review in te schakelen:\n');
    console.log(`ALTER TABLE kb_strategy_steps ADD COLUMN IF NOT EXISTS ctgb_validated BOOLEAN DEFAULT FALSE;`);
    console.log(`ALTER TABLE kb_strategy_steps ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;\n`);
  }

  console.log('');
  return { kbProductsReady, strategyStepsReady };
}

// ============================================
// Product Name Matching
// ============================================

function normalizeProductName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[®™©]/g, '');
}

function matchCtgbProduct(
  kbProductName: string,
  ctgbProducts: Map<string, CtgbProduct>,
  aliases: Map<string, string>,
): CtgbProduct | null {
  const normalized = normalizeProductName(kbProductName);

  // 1. Direct exact match (case-insensitive)
  for (const [, ctgb] of ctgbProducts) {
    if (normalizeProductName(ctgb.naam) === normalized) {
      return ctgb;
    }
  }

  // 2. Try via alias table
  const aliasMatch = aliases.get(normalized);
  if (aliasMatch) {
    for (const [, ctgb] of ctgbProducts) {
      if (normalizeProductName(ctgb.naam) === normalizeProductName(aliasMatch)) {
        return ctgb;
      }
    }
  }

  // 3. Partial match: CTGB name starts with KB name or vice versa
  for (const [, ctgb] of ctgbProducts) {
    const ctgbNorm = normalizeProductName(ctgb.naam);
    if (ctgbNorm.startsWith(normalized) || normalized.startsWith(ctgbNorm)) {
      return ctgb;
    }
  }

  // 4. First word match (e.g. "Merpan" matches "Merpan spuitkorrel")
  const firstWord = normalized.split(/[\s-]/)[0];
  if (firstWord.length >= 3) {
    for (const [, ctgb] of ctgbProducts) {
      const ctgbFirst = normalizeProductName(ctgb.naam).split(/[\s-]/)[0];
      if (ctgbFirst === firstWord) {
        return ctgb;
      }
    }
  }

  // 5. Contains match (more aggressive)
  if (normalized.length >= 4) {
    for (const [, ctgb] of ctgbProducts) {
      const ctgbNorm = normalizeProductName(ctgb.naam);
      if (ctgbNorm.includes(normalized) || normalized.includes(ctgbNorm)) {
        return ctgb;
      }
    }
  }

  return null;
}

// ============================================
// Dosage Parsing & Comparison
// ============================================

interface ParsedDosage {
  value: number;
  unit: string;
  per100L: boolean;
  raw: string;
}

function parseDosage(dosageStr: string): ParsedDosage | null {
  if (!dosageStr || typeof dosageStr !== 'string') return null;

  const cleaned = dosageStr.trim().toLowerCase();

  // Skip unparseable strings
  if (cleaned.includes('bij een') || cleaned.includes('indien nodig') ||
      cleaned.includes('afhankelijk') || cleaned.length < 2 || !/\d/.test(cleaned)) {
    return null;
  }

  const per100L = cleaned.includes('/100') || cleaned.includes('per 100');

  // Try to extract numeric value and unit
  // Patterns: "1.7 l/ha", "0.5 kg/ha", "150 ml/100l", "1,5 l/ha"
  const match = cleaned.match(/([\d.,]+)\s*(l|ml|kg|g|cc)\s*(\/\s*(?:ha|100\s*l|hecto))?/);
  if (!match) return null;

  const value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2];

  if (isNaN(value)) return null;

  // Normalize to l/ha or kg/ha
  let normalizedValue = value;
  let normalizedUnit = unit;

  if (unit === 'ml') {
    normalizedValue = value / 1000;
    normalizedUnit = 'l';
  } else if (unit === 'g') {
    normalizedValue = value / 1000;
    normalizedUnit = 'kg';
  }

  return {
    value: normalizedValue,
    unit: normalizedUnit,
    per100L,
    raw: dosageStr,
  };
}

function dosageExceeds(kbDosage: string | null, ctgbDosage: string | null): { exceeds: boolean; details?: string } {
  if (!kbDosage || !ctgbDosage) return { exceeds: false };

  const kb = parseDosage(kbDosage);
  const ctgb = parseDosage(ctgbDosage);

  if (!kb || !ctgb) return { exceeds: false };

  // Only compare if same unit system
  if (kb.unit !== ctgb.unit) return { exceeds: false };
  if (kb.per100L !== ctgb.per100L) return { exceeds: false };

  if (kb.value > ctgb.value * 1.05) { // 5% tolerance
    return {
      exceeds: true,
      details: `KB: ${kb.raw} > CTGB max: ${ctgb.raw}`,
    };
  }

  return { exceeds: false };
}

// ============================================
// Crop Matching
// ============================================

const CROP_KEYWORDS: Record<string, string[]> = {
  appel: ['appel', 'apple', 'appelen', 'malus', 'pitfruit', 'pip fruit', 'pome fruit', 'kernobst'],
  peer: ['peer', 'pear', 'peren', 'pyrus', 'pitfruit', 'pip fruit', 'pome fruit', 'kernobst'],
};

function isCropAllowed(gewas: string, cropType: string): boolean {
  const gewasLower = gewas.toLowerCase();
  const keywords = CROP_KEYWORDS[cropType] || [];

  // Direct match
  for (const kw of keywords) {
    if (gewasLower.includes(kw)) return true;
  }

  // "Pitfruit" covers both appel and peer
  if (gewasLower.includes('pitfruit') || gewasLower.includes('pit fruit')) return true;
  if (gewasLower.includes('pip fruit') || gewasLower.includes('pome fruit')) return true;
  if (gewasLower.includes('kernobst')) return true;

  // Very generic entries that usually cover all fruit
  if (gewasLower.includes('fruitteelt') || gewasLower === 'fruit') return true;

  return false;
}

function checkCropAuthorization(
  ctgbProduct: CtgbProduct,
  appliesTo: string[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const voorschriften = ctgbProduct.gebruiksvoorschriften || [];

  if (voorschriften.length === 0) {
    // No usage instructions means we can't validate crop
    return { valid: true, issues: [] };
  }

  for (const crop of appliesTo) {
    const allowed = voorschriften.some(v => isCropAllowed(v.gewas, crop));
    if (!allowed) {
      const allowedCrops = [...new Set(voorschriften.map(v => v.gewas))].join(', ');
      issues.push(`${ctgbProduct.naam} niet toegelaten voor ${crop}. CTGB gewassen: ${allowedCrops}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ============================================
// Main Validation
// ============================================

async function main() {
  console.log('=== CTGB Validatie Script ===\n');
  console.log(`Mode: ${shouldUpdate ? '🔴 UPDATE DATABASE' : '🟢 RAPPORT ONLY'}`);
  console.log('');

  // Step 0: Check columns exist
  const { strategyStepsReady } = await checkMigration();

  // Step 1: Load all data
  console.log('📥 Data laden...');

  const [
    { data: kbProducts, error: kbErr },
    { data: ctgbProducts, error: ctgbErr },
    { data: aliases, error: aliasErr },
    { data: topics, error: topicErr },
    { data: strategySteps, error: stepErr },
  ] = await Promise.all([
    supabase.from('kb_products').select('*'),
    supabase.from('ctgb_products').select('toelatingsnummer, naam, status, vervaldatum, categorie, werkzame_stoffen, gebruiksvoorschriften'),
    supabase.from('product_aliases').select('alias, official_name, confidence'),
    supabase.from('kb_topics').select('id, slug, title'),
    supabase.from('kb_strategy_steps').select('id, topic_id, phase, products, action'),
  ]);

  if (kbErr || ctgbErr || aliasErr || topicErr || stepErr) {
    console.error('Error loading data:', { kbErr, ctgbErr, aliasErr, topicErr, stepErr });
    process.exit(1);
  }

  console.log(`  kb_products: ${kbProducts?.length || 0}`);
  console.log(`  ctgb_products: ${ctgbProducts?.length || 0}`);
  console.log(`  product_aliases: ${aliases?.length || 0}`);
  console.log(`  kb_topics: ${topics?.length || 0}`);
  console.log(`  kb_strategy_steps: ${strategySteps?.length || 0}`);
  console.log('');

  // Build lookup maps
  const ctgbMap = new Map<string, CtgbProduct>();
  for (const p of (ctgbProducts || [])) {
    ctgbMap.set(p.toelatingsnummer, p);
  }

  const aliasMap = new Map<string, string>();
  for (const a of (aliases || [])) {
    aliasMap.set(a.alias.toLowerCase(), a.official_name);
  }

  const topicMap = new Map<string, KbTopic>();
  for (const t of (topics || [])) {
    topicMap.set(t.id, t);
  }

  // Step 2: Validate each kb_product
  console.log('🔍 Validatie starten...\n');

  const results: ValidationResult[] = [];
  const stats = {
    total: 0,
    matched: 0,
    notFound: 0,
    expired: 0,
    dosageExceeds: 0,
    wrongCrop: 0,
  };

  for (const kbProd of (kbProducts || [])) {
    stats.total++;
    const topic = topicMap.get(kbProd.topic_id);
    const topicTitle = topic?.title || 'Onbekend';
    const topicSlug = topic?.slug || '';

    const result: ValidationResult = {
      kbProductId: kbProd.id,
      productName: kbProd.product_name,
      topicTitle,
      topicSlug,
      appliesTo: kbProd.applies_to || [],
      ctgbStatus: 'niet_gevonden',
      ctgbProductId: null,
      ctgbMaxDosage: null,
      ctgbMaxApplications: null,
      dosageExceedsCtgb: false,
      ctgbCropValid: true,
      matchedCtgbName: null,
      issues: [],
    };

    // Match against CTGB
    const matched = matchCtgbProduct(kbProd.product_name, ctgbMap, aliasMap);

    if (!matched) {
      result.ctgbStatus = 'niet_gevonden';
      result.issues.push(`Geen CTGB match voor "${kbProd.product_name}"`);
      stats.notFound++;
    } else {
      result.matchedCtgbName = matched.naam;
      result.ctgbProductId = matched.toelatingsnummer;
      stats.matched++;

      // Check authorization status
      if (matched.status === 'Valid') {
        // Check expiration date
        if (matched.vervaldatum) {
          const expDate = new Date(matched.vervaldatum);
          if (expDate < new Date()) {
            result.ctgbStatus = 'vervallen';
            result.issues.push(`Toelating verlopen per ${matched.vervaldatum}`);
            stats.expired++;
          } else {
            result.ctgbStatus = 'toegelaten';
          }
        } else {
          result.ctgbStatus = 'toegelaten';
        }
      } else {
        result.ctgbStatus = 'vervallen';
        result.issues.push(`CTGB status: ${matched.status} (vervaldatum: ${matched.vervaldatum || 'onbekend'})`);
        stats.expired++;
      }

      // Check dosage for relevant crop
      const voorschriften = matched.gebruiksvoorschriften || [];
      const relevantVoorschriften = voorschriften.filter(v => {
        return (kbProd.applies_to || []).some(crop => isCropAllowed(v.gewas, crop));
      });

      if (relevantVoorschriften.length > 0) {
        // Get max dosage from relevant prescriptions
        const maxDos = relevantVoorschriften
          .map(v => v.dosering)
          .filter(Boolean)
          .join('; ');
        result.ctgbMaxDosage = maxDos || null;

        // Get max applications
        const maxApps = relevantVoorschriften
          .map(v => v.maxToepassingen)
          .filter((n): n is number => n !== undefined && n !== null)
          .sort((a, b) => b - a);
        result.ctgbMaxApplications = maxApps.length > 0 ? maxApps[0] : null;

        // Compare dosages
        if (kbProd.dosage) {
          for (const v of relevantVoorschriften) {
            if (v.dosering) {
              const { exceeds, details } = dosageExceeds(kbProd.dosage, v.dosering);
              if (exceeds) {
                result.dosageExceedsCtgb = true;
                result.issues.push(`Dosering overschrijdt CTGB: ${details}`);
                stats.dosageExceeds++;
                break;
              }
            }
          }
        }
      }

      // Check crop authorization
      const cropCheck = checkCropAuthorization(matched, kbProd.applies_to || []);
      if (!cropCheck.valid) {
        result.ctgbCropValid = false;
        result.issues.push(...cropCheck.issues);
        stats.wrongCrop++;
      }
    }

    results.push(result);
  }

  // Step 3: Validate strategy steps
  console.log('🔍 Strategy steps valideren...\n');

  interface StepReview {
    stepId: string;
    topicTitle: string;
    phase: string;
    action: string;
    products: string[];
    allExpired: boolean;
    expiredProducts: string[];
    notFoundProducts: string[];
  }

  const stepReviews: StepReview[] = [];

  for (const step of (strategySteps || [])) {
    if (!step.products || step.products.length === 0) continue;

    const topic = topicMap.get(step.topic_id);
    const topicTitle = topic?.title || 'Onbekend';

    const expiredProducts: string[] = [];
    const notFoundProducts: string[] = [];

    for (const prodName of step.products) {
      const matched = matchCtgbProduct(prodName, ctgbMap, aliasMap);
      if (!matched) {
        notFoundProducts.push(prodName);
      } else if (matched.status !== 'Valid') {
        expiredProducts.push(prodName);
      } else if (matched.vervaldatum && new Date(matched.vervaldatum) < new Date()) {
        expiredProducts.push(prodName);
      }
    }

    const allExpired = (expiredProducts.length + notFoundProducts.length) === step.products.length
      && expiredProducts.length > 0; // At least some explicitly expired (not just not found)

    if (expiredProducts.length > 0 || notFoundProducts.length > 0) {
      stepReviews.push({
        stepId: step.id,
        topicTitle,
        phase: step.phase,
        action: step.action,
        products: step.products,
        allExpired,
        expiredProducts,
        notFoundProducts,
      });
    }
  }

  // Step 4: Update database
  if (shouldUpdate) {
    console.log('💾 Database updaten...\n');

    // Update kb_products
    let updateCount = 0;
    for (const r of results) {
      const { error: updateErr } = await supabase
        .from('kb_products')
        .update({
          ctgb_status: r.ctgbStatus,
          ctgb_product_id: r.ctgbProductId,
          ctgb_max_dosage: r.ctgbMaxDosage,
          ctgb_max_applications: r.ctgbMaxApplications,
          dosage_exceeds_ctgb: r.dosageExceedsCtgb,
          ctgb_crop_valid: r.ctgbCropValid,
        })
        .eq('id', r.kbProductId);

      if (updateErr) {
        console.error(`  ❌ Update failed for ${r.productName}: ${updateErr.message}`);
      } else {
        updateCount++;
      }
    }
    console.log(`  ✅ ${updateCount}/${results.length} kb_products bijgewerkt`);

    // Update kb_strategy_steps (only if columns exist)
    if (strategyStepsReady) {
      let stepUpdateCount = 0;
      for (const sr of stepReviews) {
        const { error: stepUpdateErr } = await supabase
          .from('kb_strategy_steps')
          .update({
            ctgb_validated: true,
            needs_review: sr.allExpired,
          })
          .eq('id', sr.stepId);

        if (!stepUpdateErr) stepUpdateCount++;
      }

      // Mark all other steps as validated without needs_review
      const reviewedIds = new Set(stepReviews.map(sr => sr.stepId));
      const otherSteps = (strategySteps || []).filter(s => !reviewedIds.has(s.id));
      for (const step of otherSteps) {
        await supabase
          .from('kb_strategy_steps')
          .update({ ctgb_validated: true, needs_review: false })
          .eq('id', step.id);
      }

      console.log(`  ✅ ${stepUpdateCount} strategy steps gemarkeerd voor review`);
    } else {
      console.log(`  ⏭️  Strategy steps update overgeslagen (kolommen ontbreken)`);
    }
    console.log('');
  }

  // Step 5: Print report
  printReport(results, stats, stepReviews);
}

// ============================================
// Report Printer
// ============================================

function printReport(
  results: ValidationResult[],
  stats: { total: number; matched: number; notFound: number; expired: number; dosageExceeds: number; wrongCrop: number },
  stepReviews: { stepId: string; topicTitle: string; phase: string; action: string; products: string[]; allExpired: boolean; expiredProducts: string[]; notFoundProducts: string[] }[],
) {
  console.log('\n' + '='.repeat(60));
  console.log('        CTGB VALIDATIE RAPPORT');
  console.log('='.repeat(60));
  console.log(`Datum: ${new Date().toISOString().slice(0, 10)}\n`);

  console.log(`Totaal middelen in KB:     ${stats.total}`);
  console.log(`Gematcht met CTGB:         ${stats.matched}  (${pct(stats.matched, stats.total)})`);
  console.log(`Niet gevonden:             ${stats.notFound}  (${pct(stats.notFound, stats.total)})`);
  console.log(`Verlopen toelating:        ${stats.expired}  (${pct(stats.expired, stats.total)})`);
  console.log(`Dosering overschrijdt:     ${stats.dosageExceeds}`);
  console.log(`Verkeerd gewas:            ${stats.wrongCrop}`);

  // Not found
  const notFoundResults = results.filter(r => r.ctgbStatus === 'niet_gevonden');
  if (notFoundResults.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`NIET GEVONDEN IN CTGB (${notFoundResults.length}):`);
    console.log(`${'─'.repeat(60)}`);
    // Group by product name (unique)
    const uniqueNotFound = new Map<string, string[]>();
    for (const r of notFoundResults) {
      if (!uniqueNotFound.has(r.productName)) uniqueNotFound.set(r.productName, []);
      uniqueNotFound.get(r.productName)!.push(r.topicTitle);
    }
    for (const [name, topics] of uniqueNotFound) {
      console.log(`  • ${name}`);
      console.log(`    Gebruikt bij: ${topics.join(', ')}`);
    }
  }

  // Expired
  const expiredResults = results.filter(r => r.ctgbStatus === 'vervallen');
  if (expiredResults.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`VERLOPEN TOELATING (${expiredResults.length}):`);
    console.log(`${'─'.repeat(60)}`);
    for (const r of expiredResults) {
      console.log(`  • ${r.productName} bij ${r.topicTitle}`);
      if (r.matchedCtgbName && r.matchedCtgbName !== r.productName) {
        console.log(`    CTGB naam: ${r.matchedCtgbName}`);
      }
      for (const issue of r.issues) {
        console.log(`    ${issue}`);
      }
    }
  }

  // Dosage exceeds
  const dosageResults = results.filter(r => r.dosageExceedsCtgb);
  if (dosageResults.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`DOSERING OVERSCHRIJDT CTGB (${dosageResults.length}):`);
    console.log(`${'─'.repeat(60)}`);
    for (const r of dosageResults) {
      console.log(`  • ${r.productName} bij ${r.topicTitle}`);
      for (const issue of r.issues.filter(i => i.includes('Dosering'))) {
        console.log(`    ${issue}`);
      }
    }
  }

  // Wrong crop
  const cropResults = results.filter(r => !r.ctgbCropValid);
  if (cropResults.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`VERKEERD GEWAS (${cropResults.length}):`);
    console.log(`${'─'.repeat(60)}`);
    for (const r of cropResults) {
      console.log(`  • ${r.productName} bij ${r.topicTitle} (${r.appliesTo.join(', ')})`);
      for (const issue of r.issues.filter(i => i.includes('niet toegelaten'))) {
        console.log(`    ${issue}`);
      }
    }
  }

  // Strategy step reviews
  const needsReview = stepReviews.filter(sr => sr.allExpired);
  if (needsReview.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`STRATEGY STEPS - NEEDS REVIEW (${needsReview.length}):`);
    console.log(`${'─'.repeat(60)}`);
    for (const sr of needsReview) {
      console.log(`  • ${sr.topicTitle} → ${sr.phase}: "${sr.action}"`);
      console.log(`    Vervallen middelen: ${sr.expiredProducts.join(', ')}`);
    }
  }

  // Summary of all valid products with CTGB max applications
  const validWithMaxApps = results.filter(r => r.ctgbStatus === 'toegelaten' && r.ctgbMaxApplications);
  if (validWithMaxApps.length > 0) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TOEGELATEN MIDDELEN MET MAX TOEPASSINGEN (${validWithMaxApps.length}):`);
    console.log(`${'─'.repeat(60)}`);
    // Group by product name
    const seen = new Set<string>();
    for (const r of validWithMaxApps) {
      const key = `${r.matchedCtgbName || r.productName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ✅ ${r.matchedCtgbName || r.productName}: max ${r.ctgbMaxApplications}x/seizoen${r.ctgbMaxDosage ? ` (max dosering: ${r.ctgbMaxDosage})` : ''}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('EINDE RAPPORT');
  console.log('='.repeat(60));
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

main().catch(console.error);
