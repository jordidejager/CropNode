import { NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { searchCtgbProducts, getCtgbSyncStats } from '@/lib/store';
import type { CtgbSearchResponse } from '@/lib/ctgb-types';
import type { CtgbProduct } from '@/lib/types';


function transformToLegacySearchResult(product: CtgbProduct) {
    return {
        id: product.id,
        toelatingsnummer: product.toelatingsnummer,
        naam: product.naam,
        status: product.status,
        vervaldatum: product.vervaldatum,
        categorie: product.categorie,
        toelatingshouder: product.toelatingshouder,
        werkzameStoffen: product.werkzameStoffen,
        samenstelling: product.samenstelling,
        gebruiksvoorschriften: product.gebruiksvoorschriften,
        etikettering: product.etikettering,
        besluiten: [], // This field is not available in the new structure
    };
}


/**
 * GET /api/ctgb/search?query=...
 *
 * Search for plant protection products in the local Firestore database
 * This API route now acts as a proxy to the firestore search for backward compatibility or external use.
 */
export async function GET(request: Request): Promise<NextResponse<CtgbSearchResponse>> {
    const { firestore } = initializeFirebase();

    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');

        // Validation
        if (!query || query.trim().length < 2) {
        return NextResponse.json({
            success: false,
            query: query || '',
            total: 0,
            results: [],
            error: 'Zoekopdracht moet minimaal 2 tekens bevatten',
        }, { status: 400 });
        }

        const trimmedQuery = query.trim();

        // Search in Firestore
        const products = await searchCtgbProducts(firestore, trimmedQuery);
        const stats = await getCtgbSyncStats(firestore);

        const transformedResults = products.map(transformToLegacySearchResult);

        return NextResponse.json({
            success: true,
            query: trimmedQuery,
            total: products.length,
            results: transformedResults,
            // You can add sync stats to the response if needed
            // lastSynced: stats.lastSynced
        });

    } catch (error) {
        console.error('[CTGB API Firestore] Unexpected error:', error);
        return NextResponse.json({
        success: false,
        query: '',
        total: 0,
        results: [],
        error: `Onverwachte fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
        }, { status: 500 });
    }
}
