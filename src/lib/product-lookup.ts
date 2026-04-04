/**
 * product-lookup.ts — Unified Product Resolution
 *
 * Single entry point for finding products across CTGB (gewasbescherming)
 * and meststoffen databases via the unified `products` table.
 *
 * Replaces the fragmented approach of separate product-aliases.ts,
 * fertilizer-lookup.ts, and product-matcher.ts lookups.
 */

import type {
  UnifiedProduct,
  ProductAlias,
  CtgbProduct,
  FertilizerProduct,
  ProductSource,
  RegistrationType,
} from './types';
import { getSupabaseAdmin } from './supabase-client';

// ============================================
// Types
// ============================================

export interface ProductMatch {
  product: UnifiedProduct;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'keyword' | 'substance';
  confidence: number; // 0-100
}

export interface ProductWithDetails {
  product: UnifiedProduct;
  ctgbDetails?: CtgbProduct;
  fertilizerDetails?: FertilizerProduct;
}

// ============================================
// In-memory cache
// ============================================

let _productsCache: UnifiedProduct[] | null = null;
let _productsCacheTime = 0;
let _aliasesCache: ProductAlias[] | null = null;
let _aliasesCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (products change rarely)

function isCacheValid(cacheTime: number): boolean {
  return Date.now() - cacheTime < CACHE_TTL;
}

// ============================================
// Data loading
// ============================================

export async function getAllUnifiedProducts(): Promise<UnifiedProduct[]> {
  if (_productsCache && isCacheValid(_productsCacheTime)) {
    return _productsCache;
  }

  const supabase = getSupabaseAdmin();
  const all: UnifiedProduct[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('name')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Error fetching products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    all.push(
      ...data.map((row: any) => ({
        id: row.id,
        name: row.name,
        productType: row.product_type,
        source: row.source,
        sourceId: row.source_id,
        status: row.status,
        searchKeywords: row.search_keywords || [],
      }))
    );

    if (data.length < batchSize) break;
    from += batchSize;
  }

  _productsCache = all;
  _productsCacheTime = Date.now();
  return all;
}

export async function getAllProductAliases(): Promise<ProductAlias[]> {
  if (_aliasesCache && isCacheValid(_aliasesCacheTime)) {
    return _aliasesCache;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('product_aliases_unified')
    .select('*')
    .order('alias');

  if (error) {
    console.error('Error fetching aliases:', error.message);
    return [];
  }

  _aliasesCache = (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    alias: row.alias,
    aliasType: row.alias_type,
    source: row.source,
    confidence: Number(row.confidence),
    usageCount: row.usage_count,
  }));
  _aliasesCacheTime = Date.now();
  return _aliasesCache;
}

/** Invalidate caches (call after sync) */
export function invalidateProductCache(): void {
  _productsCache = null;
  _productsCacheTime = 0;
  _aliasesCache = null;
  _aliasesCacheTime = 0;
}

// ============================================
// Product Resolution (main entry point)
// ============================================

/**
 * Resolve a product name to a UnifiedProduct.
 * Searches: exact name → aliases → keyword match → fuzzy match.
 * Respects registration type: 'spreading' restricts to fertilizers only.
 */
export async function resolveProduct(
  inputName: string,
  registrationType: RegistrationType = 'spraying'
): Promise<ProductMatch | null> {
  const products = await getAllUnifiedProducts();
  const aliases = await getAllProductAliases();
  const normalized = inputName.trim().toLowerCase();

  // Filter by registration type
  const eligible = registrationType === 'spreading'
    ? products.filter((p) => p.source === 'fertilizer')
    : products;

  // 1. Exact name match
  const exactMatch = eligible.find((p) => p.name.toLowerCase() === normalized);
  if (exactMatch) {
    return { product: exactMatch, matchType: 'exact', confidence: 100 };
  }

  // 2. Alias match
  const aliasMatch = aliases.find((a) => a.alias.toLowerCase() === normalized);
  if (aliasMatch) {
    const product = eligible.find((p) => p.id === aliasMatch.productId);
    if (product) {
      return {
        product,
        matchType: 'alias',
        confidence: aliasMatch.confidence * 100,
      };
    }
  }

  // 3. Keyword match
  const keywordMatch = eligible.find((p) =>
    p.searchKeywords.some((kw) => kw.toLowerCase() === normalized)
  );
  if (keywordMatch) {
    return { product: keywordMatch, matchType: 'keyword', confidence: 85 };
  }

  // 4. Starts-with match (e.g. "Dela" → "Delan Pro")
  const startsWithMatches = eligible.filter((p) =>
    p.name.toLowerCase().startsWith(normalized)
  );
  if (startsWithMatches.length === 1) {
    return {
      product: startsWithMatches[0],
      matchType: 'fuzzy',
      confidence: 80,
    };
  }

  // 5. Contains match
  const containsMatches = eligible.filter(
    (p) =>
      p.name.toLowerCase().includes(normalized) ||
      normalized.includes(p.name.toLowerCase())
  );
  if (containsMatches.length === 1) {
    return {
      product: containsMatches[0],
      matchType: 'fuzzy',
      confidence: 70,
    };
  }

  // 6. Normalized name match (ignore hyphens, spaces, dots)
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[-\s.]/g, '');
  const normInput = normalize(inputName);
  const normMatch = eligible.find(
    (p) => normalize(p.name) === normInput
  );
  if (normMatch) {
    return { product: normMatch, matchType: 'fuzzy', confidence: 88 };
  }

  // 7. Levenshtein-like: find best trigram similarity
  // (For server-side DB query, fall back to Supabase trigram)
  if (typeof window === 'undefined') {
    const supabase = getSupabaseAdmin();
    const sourceFilter =
      registrationType === 'spreading' ? 'fertilizer' : null;
    const results = await (supabase.rpc as any)('fn_search_products', {
      search_query: inputName,
      filter_source: sourceFilter,
      max_results: 1,
    });
    if (results.data && (results.data as any[]).length > 0) {
      const hit = (results.data as any[])[0];
      const product = eligible.find((p) => p.id === hit.product_id);
      if (product && hit.match_score > 0.3) {
        return {
          product,
          matchType: hit.match_type as ProductMatch['matchType'],
          confidence: Math.round(hit.match_score * 100),
        };
      }
    }
  }

  return null;
}

// ============================================
// Batch resolution
// ============================================

/**
 * Resolve multiple product names at once.
 * Returns a map of input name → ProductMatch.
 */
export async function resolveProducts(
  names: string[],
  registrationType: RegistrationType = 'spraying'
): Promise<Map<string, ProductMatch | null>> {
  const results = new Map<string, ProductMatch | null>();
  // Resolve sequentially to share cached data
  for (const name of names) {
    results.set(name, await resolveProduct(name, registrationType));
  }
  return results;
}

// ============================================
// Product details
// ============================================

/**
 * Get a product with full details (CTGB or fertilizer).
 * Uses the source_id to join with the detail table.
 */
export async function getProductWithDetails(
  productId: string
): Promise<ProductWithDetails | null> {
  const products = await getAllUnifiedProducts();
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const supabase = getSupabaseAdmin();

  if (product.source === 'ctgb') {
    const { data } = await supabase
      .from('ctgb_products')
      .select('*')
      .eq('toelatingsnummer', product.sourceId)
      .single();
    if (data) {
      const row = data as any;
      // camelCase conversion
      const ctgb: CtgbProduct = {
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
      return { product, ctgbDetails: ctgb };
    }
  } else if (product.source === 'fertilizer') {
    const { data } = await supabase
      .from('fertilizers')
      .select('*')
      .eq('id', product.sourceId)
      .single();
    if (data) {
      const row = data as any;
      const fert: FertilizerProduct = {
        id: row.id,
        name: row.name,
        manufacturer: row.manufacturer,
        category: row.category,
        unit: row.unit,
        composition: row.composition || {},
        searchKeywords: row.search_keywords || [],
        description: row.description,
        formulation: row.formulation,
        density: row.density,
        dosageFruit: row.dosage_fruit,
        applicationTiming: row.application_timing,
        compositionForms: row.composition_forms,
      };
      return { product, fertilizerDetails: fert };
    }
  }

  return { product };
}

// ============================================
// Source detection (from fertilizer-lookup.ts)
// ============================================

const SPREADING_KEYWORDS = [
  'gestrooid', 'strooien', 'gestroit', 'stroit', 'uitgereden',
  'uitrijden', 'bemest', 'bemesting', 'toegediend', 'meststof',
  'kunstmest', 'korrels', 'granulaat',
];

/**
 * Detect if input describes a spreading (bemesting) or spraying (bespuiting) activity.
 */
export function detectRegistrationType(input: string): RegistrationType {
  const lower = input.toLowerCase();
  if (SPREADING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'spreading';
  }
  return 'spraying';
}

// ============================================
// Product type helpers
// ============================================

export function isCtgbProduct(product: UnifiedProduct): boolean {
  return product.source === 'ctgb';
}

export function isFertilizerProduct(product: UnifiedProduct): boolean {
  return product.source === 'fertilizer';
}

export function getProductSource(product: UnifiedProduct): ProductSource {
  return product.source === 'ctgb' ? 'ctgb' : 'fertilizer';
}
