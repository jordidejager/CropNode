/**
 * Smart Input V2 Context API
 *
 * Loads all user context needed for smart input in a single call.
 * Called once on page load, then reused for all subsequent requests.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
    getSprayableParcels,
    getAllCtgbProducts,
    getParcelHistoryEntries,
    getParcelGroups,
    type SprayableParcel,
} from '@/lib/supabase-store';
import type { CtgbProduct, ParcelHistoryEntry } from '@/lib/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ParcelGroupSlim {
    id: string;
    name: string;
    subParcelIds: string[];
}

export interface SmartInputUserContext {
    parcels: SprayableParcel[];
    products: CtgbProductSlim[];
    recentHistory: ParcelHistorySlim[];
    productAliases: ProductAlias[];
    parcelGroups: ParcelGroupSlim[];
    loadedAt: string;
}

// Slim versions to reduce payload size
export interface CtgbProductSlim {
    id: string;
    naam: string;
    toelatingsnummer: string;
    categorie: string | null;
    werkzameStoffen: string[];
    // Only include essential gebruiksvoorschriften fields
    gebruiksvoorschriften: Array<{
        gewas: string;
        doelorganisme?: string;
        dosering?: string;
        maxToepassingen?: number;
    }>;
}

export interface ParcelHistorySlim {
    parcelId: string;
    parcelName: string;
    product: string;
    dosage: number;
    unit: string;
    date: string;
}

export interface ProductAlias {
    alias: string;
    officialName: string;
    productId?: string;
}

// ============================================================================
// AUTH HELPER
// ============================================================================

async function getServerUserId(): Promise<string | null> {
    try {
        const supabase = await createServerClient();

        // Primary: getUser() validates token with Supabase server
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user?.id) return user.id;

        if (error) {
            console.warn('[Context API] getUser() failed:', error.message, '— trying getSession() fallback');
        }

        // Fallback: getSession() reads JWT from cookies without external fetch
        // Useful when Node.js v25 fetch intermittently fails (ECONNRESET)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
            console.log('[Context API] Recovered via getSession() fallback');
            return session.user.id;
        }

        console.warn('[Context API] No user found (session expired or not logged in)');
        return null;
    } catch (error) {
        console.error('[Context API] Auth exception:', error);
        return null;
    }
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

/**
 * Get user's learned product aliases
 */
async function getUserProductAliases(userId: string): Promise<ProductAlias[]> {
    try {
        const supabase = await createServerClient();
        const { data, error } = await supabase
            .from('product_aliases')
            .select('alias, official_name, product_id')
            .order('usage_count', { ascending: false })
            .limit(100);

        if (error || !data) return [];

        return data.map(row => ({
            alias: row.alias,
            officialName: row.official_name,
            productId: row.product_id,
        }));
    } catch {
        return [];
    }
}

/**
 * Convert full CTGB product to slim version for client
 */
function toSlimProduct(product: CtgbProduct): CtgbProductSlim {
    return {
        id: product.id,
        naam: product.naam,
        toelatingsnummer: product.toelatingsnummer,
        categorie: product.categorie || null,
        werkzameStoffen: product.werkzameStoffen || [],
        gebruiksvoorschriften: (product.gebruiksvoorschriften || []).map((v: { gewas?: string; doelorganisme?: string; dosering?: string; maxToepassingen?: number }) => ({
            gewas: v.gewas || '',
            doelorganisme: v.doelorganisme,
            dosering: v.dosering,
            maxToepassingen: v.maxToepassingen,
        })),
    };
}

/**
 * Convert parcel history to slim version
 */
function toSlimHistory(entry: ParcelHistoryEntry): ParcelHistorySlim {
    return {
        parcelId: entry.parcelId,
        parcelName: entry.parcelName || '',
        product: entry.product,
        dosage: entry.dosage,
        unit: entry.unit,
        date: entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
    };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET() {
    const startTime = Date.now();
    const context = 'Smart Input V2 Context';

    try {
        // Step 1: Authenticate
        const userId = await getServerUserId();
        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log(`[${context}] Loading context for user ${userId.substring(0, 8)}...`);

        // Step 2: Fetch all data in parallel
        const [parcels, allProducts, history, aliases, parcelGroupsRaw] = await Promise.all([
            getSprayableParcels(),
            getAllCtgbProducts(),
            getParcelHistoryEntries(),
            getUserProductAliases(userId),
            getParcelGroups().catch(() => []),
        ]);

        console.log(`[${context}] Fetched: ${parcels.length} parcels, ${allProducts.length} products, ${history.length} history entries, ${parcelGroupsRaw.length} parcel groups`);

        // Step 3: Convert to slim versions
        const slimProducts = allProducts.map(toSlimProduct);

        // Only include history from last 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const recentHistory = history
            .filter(h => new Date(h.date) >= ninetyDaysAgo)
            .map(toSlimHistory);

        // Step 4: Build parcel groups slim
        const parcelGroups: ParcelGroupSlim[] = parcelGroupsRaw.map(g => ({
            id: g.id,
            name: g.name,
            subParcelIds: g.subParcelIds || [],
        }));

        // Step 5: Build response
        const userContext: SmartInputUserContext = {
            parcels,
            products: slimProducts,
            recentHistory,
            productAliases: aliases,
            parcelGroups,
            loadedAt: new Date().toISOString(),
        };

        const loadTimeMs = Date.now() - startTime;
        console.log(`[${context}] Context loaded in ${loadTimeMs}ms`);

        return NextResponse.json(userContext, {
            headers: {
                'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
            },
        });
    } catch (error) {
        console.error(`[${context}] Error:`, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load context' },
            { status: 500 }
        );
    }
}
