/**
 * Session Cache Service
 *
 * In-memory cache voor herhaalde lookups binnen een sessie.
 * Voorkomt onnodige database queries voor data die niet verandert
 * binnen een korte periode (5 minuten).
 *
 * Punt 2: Sessie-caching voor herhaalde lookups
 */

export interface CacheEntry<T> {
    data: T;
    expires: number; // Unix timestamp in ms
}

export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    lastCleanup: number;
}

// Default TTL: 5 minuten (perceeldata, productdata verandert niet binnen een sessie)
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Maximum cache size before forced cleanup
const MAX_CACHE_SIZE = 100;

// Cache storage
const cache = new Map<string, CacheEntry<unknown>>();

// Statistics
const stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    lastCleanup: Date.now()
};

/**
 * Genereer een cache key gebaseerd op user ID en lookup type
 */
export function getCacheKey(userId: string | null, type: string, ...args: (string | number | boolean | null | undefined)[]): string {
    const userPart = userId || 'anonymous';
    const argsPart = args.filter(a => a !== null && a !== undefined).join(':');
    return `${userPart}:${type}:${argsPart}`;
}

/**
 * Haal data uit de cache
 * @returns cached data of undefined als niet gevonden of expired
 */
export function getFromCache<T>(key: string): T | undefined {
    const entry = cache.get(key);

    if (!entry) {
        stats.misses++;
        return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expires) {
        cache.delete(key);
        stats.misses++;
        stats.size = cache.size;
        return undefined;
    }

    stats.hits++;
    return entry.data as T;
}

/**
 * Sla data op in de cache
 * @param ttlMs - Time to live in milliseconds (default: 5 minuten)
 */
export function setInCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    // Cleanup als cache te groot wordt
    if (cache.size >= MAX_CACHE_SIZE) {
        cleanupExpiredEntries();
    }

    cache.set(key, {
        data,
        expires: Date.now() + ttlMs
    });

    stats.size = cache.size;
}

/**
 * Verwijder een specifieke entry uit de cache
 */
export function invalidateCache(key: string): void {
    cache.delete(key);
    stats.size = cache.size;
}

/**
 * Verwijder alle entries die beginnen met een bepaalde prefix
 * Nuttig voor het invalideren van alle user-specifieke data
 */
export function invalidateCacheByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];

    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            keysToDelete.push(key);
        }
    }

    for (const key of keysToDelete) {
        cache.delete(key);
    }

    stats.size = cache.size;
}

/**
 * Verwijder alle entries voor een specifieke user
 */
export function invalidateUserCache(userId: string): void {
    invalidateCacheByPrefix(`${userId}:`);
}

/**
 * Verwijder alle verlopen entries
 */
export function cleanupExpiredEntries(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of cache.entries()) {
        if (now > entry.expires) {
            cache.delete(key);
            cleaned++;
        }
    }

    stats.size = cache.size;
    stats.lastCleanup = now;

    return cleaned;
}

/**
 * Wis de volledige cache
 */
export function clearCache(): void {
    cache.clear();
    stats.size = 0;
    stats.hits = 0;
    stats.misses = 0;
}

/**
 * Haal cache statistieken op
 */
export function getCacheStats(): CacheStats {
    return { ...stats };
}

/**
 * Helper: Cached async functie wrapper
 *
 * Wraps een async functie met caching. Als de data in de cache zit,
 * wordt de originele functie niet aangeroepen.
 *
 * @example
 * const cachedGetParcels = withCache(
 *   (userId) => getCacheKey(userId, 'parcels'),
 *   getActiveParcels
 * );
 * const parcels = await cachedGetParcels(userId);
 */
export function withCache<TArgs extends unknown[], TResult>(
    keyGenerator: (...args: TArgs) => string,
    fn: (...args: TArgs) => Promise<TResult>,
    ttlMs: number = DEFAULT_TTL_MS
): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
        const key = keyGenerator(...args);

        // Check cache
        const cached = getFromCache<TResult>(key);
        if (cached !== undefined) {
            return cached;
        }

        // Execute original function
        const result = await fn(...args);

        // Store in cache
        setInCache(key, result, ttlMs);

        return result;
    };
}

/**
 * Cache types voor type-safe key generation
 */
export const CacheTypes = {
    PARCELS: 'parcels',
    PARCEL_HISTORY: 'parcel_history',
    USER_PREFERENCES: 'user_preferences',
    CTGB_PRODUCTS: 'ctgb_products',
    CTGB_PRODUCTS_BY_NAMES: 'ctgb_products_by_names',
    FREQUENT_PRODUCTS: 'frequent_products',
    VALIDATION_DATA: 'validation_data',
    RAG_SEARCH: 'rag_search'
} as const;

export type CacheType = typeof CacheTypes[keyof typeof CacheTypes];

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log cache hit/miss voor debugging
 */
export function logCacheAccess(key: string, hit: boolean): void {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[CACHE] ${hit ? 'HIT' : 'MISS'} - ${key}`);
    }
}
