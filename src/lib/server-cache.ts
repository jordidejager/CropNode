import { unstable_cache } from 'next/cache';
import { supabase, withRetry } from './supabase';
import type { CtgbProduct } from './types';

// ============================================
// Helper functions for case conversion
// ============================================

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function recursiveToCamelCase(item: unknown): any {
  if (Array.isArray(item)) {
    return item.map((el) => recursiveToCamelCase(el));
  } else if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(item as Record<string, any>)) {
      result[toCamelCase(key)] = recursiveToCamelCase(value);
    }
    return result;
  }
  return item;
}

// ============================================
// Cached CTGB Products (1 hour cache)
// ============================================

/**
 * Fetch all CTGB products with server-side caching.
 * Cache is revalidated every hour since product data rarely changes.
 */
export const getCachedCtgbProducts = unstable_cache(
  async (): Promise<CtgbProduct[]> => {
    console.log('[server-cache] Fetching CTGB products from database...');

    const { data, error } = await supabase
      .from('ctgb_products')
      .select('*')
      .order('naam')
      .limit(1000);

    if (error) {
      console.error('[server-cache] Error fetching CTGB products:', error.message);
      return [];
    }

    if (!data) {
      console.log('[server-cache] No CTGB products found');
      return [];
    }

    console.log(`[server-cache] Cached ${data.length} CTGB products`);
    return data.map(item => recursiveToCamelCase(item) as CtgbProduct);
  },
  ['ctgb-products-all'],
  {
    revalidate: 3600, // 1 hour
    tags: ['ctgb-products'],
  }
);

/**
 * Search CTGB products with caching.
 * Each unique query is cached for 5 minutes.
 */
export const getCachedCtgbSearch = unstable_cache(
  async (query: string): Promise<CtgbProduct[]> => {
    console.log(`[server-cache] Searching CTGB products for: "${query}"`);

    const normalizedQuery = query.toLowerCase().trim();
    const searchTerm = `%${normalizedQuery}%`;

    return withRetry(async () => {
      // First try exact/partial match on naam (most common search)
      const { data: nameData, error: nameError } = await supabase
        .from('ctgb_products')
        .select('*')
        .ilike('naam', searchTerm)
        .order('naam')
        .limit(50);

      if (nameError) {
        console.error('[server-cache] Name search error:', nameError.message);
        throw new Error(nameError.message);
      }

      if (nameData && nameData.length > 0) {
        console.log(`[server-cache] Found ${nameData.length} products by name for "${query}"`);
        return nameData.map(item => recursiveToCamelCase(item) as CtgbProduct);
      }

      // Fallback: search in toelatingsnummer or use array contains for werkzame_stoffen
      const { data, error } = await supabase
        .from('ctgb_products')
        .select('*')
        .or(`toelatingsnummer.ilike.${searchTerm},werkzame_stoffen.cs.{${normalizedQuery}}`)
        .order('naam')
        .limit(50);

      if (error) {
        console.error('[server-cache] Fallback search error:', error.message);
        throw new Error(error.message);
      }

      console.log(`[server-cache] Found ${data?.length || 0} products (fallback) for "${query}"`);
      return (data || []).map(item => recursiveToCamelCase(item) as CtgbProduct);
    }, { operationName: 'getCachedCtgbSearch', maxRetries: 5, initialDelayMs: 500, maxDelayMs: 5000 });
  },
  ['ctgb-search'],
  {
    revalidate: 300, // 5 minutes
    tags: ['ctgb-products'],
  }
);

// ============================================
// Cached Sprayable Parcels (10 minutes cache)
// ============================================

export interface SprayableParcelCached {
  id: string;
  name: string;
  area: number;
  crop: string;
  variety?: string;
  parcelId: string;
  parcelName: string;
  location?: string;
  geometry?: any;
  source: string;
  rvoId?: string;
}

/**
 * Fetch all sprayable parcels with server-side caching.
 * Cache is revalidated every 10 minutes.
 */
export const getCachedSprayableParcels = unstable_cache(
  async (): Promise<SprayableParcelCached[]> => {
    console.log('[server-cache] Fetching sprayable parcels from database...');

    const { data, error } = await supabase
      .from('v_sprayable_parcels')
      .select('*')
      .order('name');

    if (error) {
      console.error('[server-cache] Error fetching sprayable parcels:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.log('[server-cache] No sprayable parcels found');
      return [];
    }

    console.log(`[server-cache] Cached ${data.length} sprayable parcels`);

    return data.map(item => {
      let geometry = item.geometry;
      if (geometry && typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch {
          // Keep as-is if parsing fails
        }
      }

      return {
        id: item.id,
        name: item.name,
        area: item.area,
        crop: item.crop || 'Onbekend',
        variety: item.variety,
        parcelId: item.parcel_id,
        parcelName: item.parcel_name,
        location: item.location,
        geometry,
        source: item.source,
        rvoId: item.rvo_id,
      };
    });
  },
  ['sprayable-parcels-all'],
  {
    revalidate: 600, // 10 minutes
    tags: ['parcels'],
  }
);

// ============================================
// Cache Invalidation Helpers
// ============================================

import { revalidateTag } from 'next/cache';

/**
 * Invalidate all CTGB product caches.
 * Call this after syncing products or manual updates.
 */
export function invalidateCtgbCache() {
  revalidateTag('ctgb-products');
}

/**
 * Invalidate all parcel caches.
 * Call this after adding, editing, or deleting parcels.
 */
export function invalidateParcelCache() {
  revalidateTag('parcels');
}
