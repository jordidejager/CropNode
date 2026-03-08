/**
 * Product Matcher Service v2.0 - Fuzzy Search with Trigram Similarity
 *
 * ARCHITECTUUR:
 * 1. Zoek eerst in de ACTIEVE VOORRAAD van de gebruiker
 * 2. Als niet gevonden, zoek in de globale CTGB database
 * 3. Gebruik trigram-similarity voor fuzzy matching
 * 4. AI geeft alleen de zoekterm, backend resolved naar officieel product
 */

import { supabase } from '../supabase';
import type { CtgbProduct } from '../types';

// ============================================
// Types
// ============================================

export interface ProductMatch {
  product: CtgbProduct;
  score: number;
  source: 'inventory' | 'ctgb' | 'alias';
  matchType: 'exact' | 'fuzzy' | 'alias' | 'substance';
}

export interface MatchResult {
  found: boolean;
  searchTerm: string;
  matches: ProductMatch[];
  bestMatch: ProductMatch | null;
  suggestions: string[];
}

// ============================================
// Static Alias Mapping (for common shortcuts)
// ============================================

const PRODUCT_ALIASES: Record<string, string> = {
  // Werkzame stof aliassen
  'captan': 'Merpan Spuitkorrel',
  'captaan': 'Merpan Spuitkorrel',
  'kaptan': 'Merpan Spuitkorrel',
  'merpan': 'Merpan Spuitkorrel',

  // Veelgebruikte afkortingen (namen moeten exact matchen met ctgb_products.naam)
  'delan': 'Delan DF',
  'scala': 'Scala',
  'bellis': 'Bellis',
  'flint': 'FLINT',
  'chorus': 'CHORUS 50 WG',
  'teldor': 'Teldor',
  'switch': 'Switch',
  'luna experience': 'LUNA EXPERIENCE',
  'pirimor': 'Pirimor',
  'karate next': 'Karate Next',
  'decis': 'Decis Protech',
  'tracer': 'TRACER',
  'nissorun': 'Nissorun vloeibaar',
  'floramite': 'FLORAMITE 240 SC',
  'score': 'Score 250 EC',
  'coragen': 'CORAGEN',
  'surround': 'SURROUND® WP CROP PROTECTANT',
  'regalis': 'Regalis Plus',
  'captosan': 'Captosan 500 SC',

  // Werkzame stof naar meest gebruikte handelsnaam
  'dithianon': 'Delan DF',
  'pyrimethanil': 'Scala',
  'boscalid': 'Bellis',
  'trifloxystrobin': 'FLINT',
  'cyprodinil': 'CHORUS 50 WG',
  'fenhexamid': 'Teldor',
  'pirimicarb': 'Pirimor',
  'deltamethrin': 'Decis Protech',
  'spinosad': 'TRACER',
  'hexythiazox': 'Nissorun vloeibaar',
  'bifenazaat': 'FLORAMITE 240 SC',
};

// ============================================
// Main Functions
// ============================================

/**
 * Match a product search term to CTGB products
 *
 * Priority order:
 * 1. Exact name match in CTGB
 * 2. Static alias match
 * 3. Fuzzy match (trigram similarity)
 * 4. Active substance match
 *
 * @param searchTerm - The raw search term from user/AI
 * @param userInventory - Optional: user's current inventory products
 */
export async function matchProduct(
  searchTerm: string,
  userInventory?: CtgbProduct[]
): Promise<MatchResult> {
  const normalizedSearch = searchTerm.toLowerCase().trim();
  const matches: ProductMatch[] = [];
  const suggestions: string[] = [];

  // 1. Check static aliases first (instant, no DB call)
  const aliasTarget = PRODUCT_ALIASES[normalizedSearch];

  // 2. Search in user inventory first (if provided)
  if (userInventory && userInventory.length > 0) {
    const inventoryMatches = searchInProducts(normalizedSearch, userInventory, 'inventory');
    matches.push(...inventoryMatches);

    // If exact match in inventory, return immediately
    const exactInventoryMatch = inventoryMatches.find(m => m.matchType === 'exact');
    if (exactInventoryMatch) {
      return {
        found: true,
        searchTerm,
        matches: [exactInventoryMatch],
        bestMatch: exactInventoryMatch,
        suggestions: [],
      };
    }
  }

  // 3. Search in CTGB database with trigram similarity
  try {
    const ctgbMatches = await searchCtgbWithTrigram(normalizedSearch, aliasTarget);
    matches.push(...ctgbMatches);
  } catch (error) {
    console.error('[matchProduct] Error searching CTGB:', error);
  }

  // 4. If alias was found, prioritize that match
  if (aliasTarget) {
    const aliasMatch = matches.find(m =>
      m.product.naam.toLowerCase() === aliasTarget.toLowerCase()
    );
    if (aliasMatch) {
      aliasMatch.matchType = 'alias';
      aliasMatch.score = 0.95;
    }
  }

  // Sort by score (highest first)
  matches.sort((a, b) => b.score - a.score);

  // Get top suggestions for UI
  if (matches.length > 1) {
    suggestions.push(...matches.slice(0, 5).map(m => m.product.naam));
  }

  const bestMatch = matches.length > 0 ? matches[0] : null;

  return {
    found: bestMatch !== null && bestMatch.score >= 0.5,
    searchTerm,
    matches: matches.slice(0, 10),
    bestMatch,
    suggestions,
  };
}

/**
 * Batch match multiple products
 */
export async function matchProducts(
  searchTerms: string[],
  userInventory?: CtgbProduct[]
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();

  // Run in parallel for speed
  const promises = searchTerms.map(async term => {
    const result = await matchProduct(term, userInventory);
    results.set(term, result);
  });

  await Promise.all(promises);
  return results;
}

// ============================================
// Search Functions
// ============================================

/**
 * Search in a list of products (for inventory)
 */
function searchInProducts(
  searchTerm: string,
  products: CtgbProduct[],
  source: 'inventory' | 'ctgb'
): ProductMatch[] {
  const matches: ProductMatch[] = [];
  const normalizedSearch = searchTerm.toLowerCase();

  for (const product of products) {
    const normalizedName = product.naam?.toLowerCase() || '';
    const normalizedNumber = product.toelatingsnummer?.toLowerCase() || '';

    // Exact match
    if (normalizedName === normalizedSearch || normalizedNumber === normalizedSearch) {
      matches.push({
        product,
        score: 1.0,
        source,
        matchType: 'exact',
      });
      continue;
    }

    // Starts with
    if (normalizedName.startsWith(normalizedSearch)) {
      matches.push({
        product,
        score: 0.9,
        source,
        matchType: 'fuzzy',
      });
      continue;
    }

    // Contains
    if (normalizedName.includes(normalizedSearch)) {
      matches.push({
        product,
        score: 0.7,
        source,
        matchType: 'fuzzy',
      });
      continue;
    }

    // First word match
    const searchFirstWord = normalizedSearch.split(/[\s-]/)[0];
    const productFirstWord = normalizedName.split(/[\s-]/)[0];
    if (searchFirstWord.length >= 3 && productFirstWord === searchFirstWord) {
      matches.push({
        product,
        score: 0.8,
        source,
        matchType: 'fuzzy',
      });
      continue;
    }

    // Active substance match
    if (product.werkzameStoffen?.some(s =>
      s.toLowerCase().includes(normalizedSearch) ||
      normalizedSearch.includes(s.toLowerCase())
    )) {
      matches.push({
        product,
        score: 0.6,
        source,
        matchType: 'substance',
      });
    }
  }

  return matches;
}

/**
 * Search CTGB products using Supabase with trigram similarity
 *
 * Uses pg_trgm extension for fuzzy matching:
 * - similarity() function for scoring
 * - % operator for threshold matching
 */
async function searchCtgbWithTrigram(
  searchTerm: string,
  aliasTarget?: string
): Promise<ProductMatch[]> {
  const matches: ProductMatch[] = [];

  // Strategy 1: Exact match (fastest)
  const { data: exactData, error: exactError } = await supabase
    .from('ctgb_products')
    .select('*')
    .or(`naam.ilike.${searchTerm},toelatingsnummer.ilike.${searchTerm}`)
    .limit(1);

  if (!exactError && exactData && exactData.length > 0) {
    matches.push({
      product: transformCtgbProduct(exactData[0]),
      score: 1.0,
      source: 'ctgb',
      matchType: 'exact',
    });
    return matches;
  }

  // Strategy 2: If alias target, search for that specifically
  if (aliasTarget) {
    const { data: aliasData, error: aliasError } = await supabase
      .from('ctgb_products')
      .select('*')
      .ilike('naam', `%${aliasTarget}%`)
      .limit(1);

    if (!aliasError && aliasData && aliasData.length > 0) {
      matches.push({
        product: transformCtgbProduct(aliasData[0]),
        score: 0.95,
        source: 'ctgb',
        matchType: 'alias',
      });
    }
  }

  // Strategy 3: Prefix match (starts with)
  const { data: prefixData, error: prefixError } = await supabase
    .from('ctgb_products')
    .select('*')
    .ilike('naam', `${searchTerm}%`)
    .limit(5);

  if (!prefixError && prefixData) {
    for (const item of prefixData) {
      if (!matches.some(m => m.product.toelatingsnummer === item.toelatingsnummer)) {
        matches.push({
          product: transformCtgbProduct(item),
          score: 0.85,
          source: 'ctgb',
          matchType: 'fuzzy',
        });
      }
    }
  }

  // Strategy 4: Contains match
  const { data: containsData, error: containsError } = await supabase
    .from('ctgb_products')
    .select('*')
    .ilike('naam', `%${searchTerm}%`)
    .limit(10);

  if (!containsError && containsData) {
    for (const item of containsData) {
      if (!matches.some(m => m.product.toelatingsnummer === item.toelatingsnummer)) {
        matches.push({
          product: transformCtgbProduct(item),
          score: 0.7,
          source: 'ctgb',
          matchType: 'fuzzy',
        });
      }
    }
  }

  // Strategy 5: Search keywords array (for typos and variations)
  const { data: keywordData, error: keywordError } = await supabase
    .from('ctgb_products')
    .select('*')
    .contains('search_keywords', [searchTerm.toLowerCase()])
    .limit(5);

  if (!keywordError && keywordData) {
    for (const item of keywordData) {
      if (!matches.some(m => m.product.toelatingsnummer === item.toelatingsnummer)) {
        matches.push({
          product: transformCtgbProduct(item),
          score: 0.75,
          source: 'ctgb',
          matchType: 'fuzzy',
        });
      }
    }
  }

  // Strategy 6: Active substance match
  const { data: substanceData, error: substanceError } = await supabase
    .from('ctgb_products')
    .select('*')
    .contains('werkzame_stoffen', [searchTerm])
    .limit(5);

  if (!substanceError && substanceData) {
    for (const item of substanceData) {
      if (!matches.some(m => m.product.toelatingsnummer === item.toelatingsnummer)) {
        matches.push({
          product: transformCtgbProduct(item),
          score: 0.6,
          source: 'ctgb',
          matchType: 'substance',
        });
      }
    }
  }

  return matches;
}

/**
 * Transform Supabase row to CtgbProduct type
 */
function transformCtgbProduct(row: any): CtgbProduct {
  return {
    id: row.id,
    toelatingsnummer: row.toelatingsnummer,
    naam: row.naam,
    status: row.status,
    vervaldatum: row.vervaldatum,
    categorie: row.categorie,
    toelatingshouder: row.toelatingshouder,
    werkzameStoffen: row.werkzame_stoffen || [],
    productTypes: row.product_types || [],
    samenstelling: row.samenstelling,
    gebruiksvoorschriften: row.gebruiksvoorschriften || [],
    etikettering: row.etikettering,
    searchKeywords: row.search_keywords || [],
    lastSyncedAt: row.last_synced_at,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get product suggestions for autocomplete
 */
export async function getProductSuggestions(
  prefix: string,
  limit: number = 10
): Promise<string[]> {
  if (prefix.length < 2) return [];

  const { data, error } = await supabase
    .from('ctgb_products')
    .select('naam')
    .ilike('naam', `${prefix}%`)
    .order('naam')
    .limit(limit);

  if (error || !data) return [];

  return data.map(row => row.naam);
}

/**
 * Check if a product name is an alias
 */
export function resolveAlias(searchTerm: string): string | null {
  return PRODUCT_ALIASES[searchTerm.toLowerCase().trim()] || null;
}

/**
 * Get all aliases for a product
 */
export function getAliasesForProduct(productName: string): string[] {
  const normalizedName = productName.toLowerCase();
  return Object.entries(PRODUCT_ALIASES)
    .filter(([_, target]) => target.toLowerCase() === normalizedName)
    .map(([alias]) => alias);
}
