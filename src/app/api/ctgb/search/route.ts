import { NextResponse } from 'next/server';
import { getCachedCtgbSearch } from '@/lib/server-cache';
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
        besluiten: [],
    };
}

/**
 * GET /api/ctgb/search?query=...
 *
 * Search for plant protection products in the Supabase database.
 * Uses server-side caching for improved performance.
 */
export async function GET(request: Request): Promise<NextResponse<CtgbSearchResponse>> {
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

        // Search using cached function
        const products = await getCachedCtgbSearch(trimmedQuery);
        const transformedResults = products.map(transformToLegacySearchResult);

        return NextResponse.json({
            success: true,
            query: trimmedQuery,
            total: products.length,
            results: transformedResults,
        });

    } catch (error) {
        console.error('[CTGB API] Unexpected error:', error);
        return NextResponse.json({
            success: false,
            query: '',
            total: 0,
            results: [],
            error: `Onverwachte fout: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
        }, { status: 500 });
    }
}
