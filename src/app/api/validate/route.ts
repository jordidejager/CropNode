import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateCtgbRulesSimple } from '@/lib/ctgb-validator';
import { getActiveParcelsById, getCtgbProductsByNames, getParcelHistoryEntries, type ActiveParcel } from '@/lib/supabase-store';
import {
    handleUnknownError,
    apiError,
    ErrorCodes,
    safeGet
} from '@/lib/api-utils';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limiter';

/**
 * Validate API - Deterministic CTGB Validation
 *
 * This endpoint performs the "heavy" CTGB validation after the AI has extracted
 * the spray intent. This is called separately from the streaming endpoint
 * to enable Optimistic UI patterns.
 *
 * Input: { draft: { plots: string[], products: [...], date?: string } }
 * Output: { isValid: boolean, status: 'Akkoord' | 'Waarschuwing' | 'Afgekeurd', flags: [...] }
 *
 * Fase 2.6.1: This endpoint should NEVER crash with 500 errors
 */

// ============================================
// Input Validation Schema
// ============================================

const ProductEntrySchema = z.object({
    product: z.string().min(1, 'Product name is required'),
    dosage: z.number().nonnegative().default(0),
    unit: z.string().default('L'),
    targetReason: z.string().optional(),
}).passthrough(); // Allow extra fields

const DraftSchema = z.object({
    plots: z.array(z.string()).default([]),
    products: z.array(ProductEntrySchema).default([]),
    date: z.string().optional(),
}).passthrough();

const ValidateRequestSchema = z.object({
    draft: DraftSchema,
});

// ============================================
// Fallback Response
// ============================================

/**
 * Generate a safe fallback response when validation fails
 * This ensures the frontend always gets a usable response
 */
function createFallbackResponse(errorMessage: string, draft?: z.infer<typeof DraftSchema>) {
    return {
        isValid: false,
        status: 'Waarschuwing' as const,
        flags: [{ type: 'warning' as const, message: `Validatie kon niet worden uitgevoerd: ${errorMessage}` }],
        errorCount: 0,
        warningCount: 1,
        infoCount: 0,
        validationMessage: `Validatie kon niet worden uitgevoerd: ${errorMessage}`,
        normalizedProducts: draft?.products || [],
        matchedTargets: {},
    };
}

// ============================================
// POST Handler
// ============================================

export async function POST(req: Request) {
    const context = 'Validate API';

    try {
        // Step 0: Authenticate user
        const supabase = await createServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
        }

        // Step 0b: Rate limit (20 requests per minute per user)
        const rl = rateLimit(`validate:${user.id}`, 20, 60_000);
        if (!rl.success) {
            return NextResponse.json(
                createFallbackResponse('Te veel validatieverzoeken. Probeer het over een minuut opnieuw.'),
                { status: 429, headers: rateLimitHeaders(rl) }
            );
        }

        // Step 1: Parse JSON body safely
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            console.error(`[${context}] Invalid JSON in request body`);
            return apiError(
                'Invalid JSON in request body',
                ErrorCodes.BAD_REQUEST,
                400
            );
        }

        // Step 2: Validate input with Zod schema
        const parseResult = ValidateRequestSchema.safeParse(body);

        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            console.error(`[${context}] Validation failed:`, issues);

            // Return a fallback response that the frontend can handle
            return NextResponse.json(
                createFallbackResponse(`Input validation failed: ${issues.join(', ')}`),
                { status: 200 } // Return 200 so frontend can display the warning
            );
        }

        const { draft } = parseResult.data;
        console.log(`[${context}] Received draft:`, JSON.stringify(draft, null, 2));

        // Step 3: Check for empty data (not an error, just a warning)
        if (draft.plots.length === 0 && draft.products.length === 0) {
            console.warn(`[${context}] Empty draft received`);
            return NextResponse.json({
                isValid: true,
                status: 'Akkoord',
                flags: [],
                errorCount: 0,
                warningCount: 0,
                infoCount: 0,
                validationMessage: null,
                normalizedProducts: [],
                matchedTargets: {},
            });
        }

        // Step 4: Extract product names for optimized fetching
        const productNames = draft.products
            .map(p => p?.product)
            .filter((name): name is string => typeof name === 'string' && name.length > 0);

        console.log(`[${context}] Fetching data for ${productNames.length} products: ${productNames.join(', ')}`);

        // Step 5: Fetch data using the v_active_parcels VIEW (simple & robust)
        let activeParcels: ActiveParcel[] = [];
        let ctgbProducts: Awaited<ReturnType<typeof getCtgbProductsByNames>> = [];
        let parcelHistory: Awaited<ReturnType<typeof getParcelHistoryEntries>> = [];

        try {
            // Parallel fetch: parcels from view, products, and history
            [activeParcels, ctgbProducts, parcelHistory] = await Promise.all([
                getActiveParcelsById(draft.plots).catch(err => {
                    console.error(`[${context}] Failed to fetch parcels:`, err?.message || err);
                    return [];
                }),
                getCtgbProductsByNames(productNames).catch(err => {
                    console.error(`[${context}] Failed to fetch products:`, err?.message || err);
                    return [];
                }),
                getParcelHistoryEntries().catch(err => {
                    console.error(`[${context}] Failed to fetch history:`, err?.message || err);
                    return [];
                }),
            ]);
        } catch (fetchError) {
            console.error(`[${context}] Database fetch failed:`, fetchError);
            return NextResponse.json(
                createFallbackResponse('Could not connect to database'),
                { status: 200 }
            );
        }

        // Log results
        console.log(`[${context}] Fetched: ${activeParcels.length} parcels, ${ctgbProducts.length} products, ${parcelHistory.length} history`);

        if (activeParcels.length === 0 && draft.plots.length > 0) {
            console.error(`[${context}] ⚠️ No parcels found! Requested: ${draft.plots.slice(0, 3).join(', ')}...`);
        } else {
            // Log parcel details (simplified)
            for (const p of activeParcels) {
                console.log(`[${context}]   "${p.name}": crop="${p.crop}", variety="${p.variety || 'none'}"`);
            }
        }

        // Step 6: Run validation with simplified data
        let result;
        try {
            console.log(`[${context}] Running CTGB validation...`);
            result = await validateCtgbRulesSimple({
                draft,
                parcels: activeParcels,
                ctgbProducts,
                parcelHistory,
                applicationDate: draft.date ? new Date(draft.date) : new Date()
            });
        } catch (validationError: any) {
            console.error(`[${context}] Validation logic error:`, validationError.message);
            return NextResponse.json(
                createFallbackResponse(`Validation error: ${validationError.message}`, draft),
                { status: 200 }
            );
        }

        console.log(`[${context}] Validation complete:`, {
            status: result.status,
            errorCount: result.errorCount,
            warningCount: result.warningCount
        });

        // Step 7: Return successful result
        return NextResponse.json(result);

    } catch (error: unknown) {
        // Catch-all for any unexpected errors
        console.error(`[${context}] Unexpected error:`, error);

        // Always return a usable response, never crash
        return NextResponse.json(
            createFallbackResponse(
                error instanceof Error ? error.message : 'An unexpected error occurred'
            ),
            { status: 200 } // Return 200 so frontend can display the warning
        );
    }
}
