/**
 * Slimme Invoer 2.0 API Route
 *
 * Hybride architectuur:
 * - Bericht 1 (geen draft): Snelle pipeline (classify + parse)
 * - Bericht 2+ (draft exists): AI Agent met tools
 */

import { NextResponse } from 'next/server';
import { z as zod } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { classifyAndParseSpray } from '@/ai/flows/classify-and-parse-spray';
import { registrationAgent, registrationAgentStream, type AgentOutput } from '@/ai/flows/registration-agent';
import { validateParsedSprayData } from '@/lib/validation-service';
import { resolveProductAliases } from '@/lib/product-aliases';
import {
    getSprayableParcels,
    getAllCtgbProducts,
    getParcelHistoryEntries,
    getLastUsedDosages,
    type SprayableParcel,
} from '@/lib/supabase-store';
import type {
    SmartInputV2Request,
    SmartInputV2Response,
    StreamMessageV2,
    ConversationMessage,
    SmartInputUserContext,
    CtgbProductSlim,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry, CtgbProduct } from '@/lib/types';
import { validateDraft, formatValidationResult, type DraftValidationResult, type DraftValidationIssue } from '@/lib/draft-validator';

// ============================================================================
// AUTH HELPER
// ============================================================================

async function getServerUserId(): Promise<string | null> {
    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch (error) {
        console.error('[getServerUserId] Auth error:', error);
        return null;
    }
}

// Fallback: get user ID from client-side Supabase (for API routes)
async function getUserIdFallback(): Promise<string> {
    // In development/testing, return a placeholder
    // In production, the middleware ensures the user is authenticated
    const userId = await getServerUserId();
    return userId || 'anonymous';
}

// ============================================================================
// PRODUCT UNIT DETECTION
// ============================================================================

/**
 * Determines the correct unit (L/ha or kg/ha) for a product based on CTGB data.
 * Solid products (powders, granules) use kg/ha, liquids use L/ha.
 */
function getDefaultUnitForProduct(
    productName: string,
    allProducts: Array<{ naam: string; gebruiksvoorschriften?: Array<{ dosering?: string }> }>
): string {
    // Find the product in CTGB data
    const product = allProducts.find(p =>
        p.naam.toLowerCase() === productName.toLowerCase() ||
        p.naam.toLowerCase().includes(productName.toLowerCase())
    );

    // Check product name for hints FIRST (most reliable for formulation type)
    const nameLower = productName.toLowerCase();
    if (nameLower.includes('spuitkorrel') ||
        nameLower.includes('granulaat') ||
        nameLower.includes('poeder') ||
        nameLower.includes(' wp') ||  // Wettable Powder (space before to avoid false matches)
        nameLower.includes(' wg') ||  // Water dispersible Granule
        nameLower.includes(' wdg') || // Water Dispersible Granule
        nameLower.includes(' sg') ||  // Soluble Granule
        nameLower.includes(' sp')) {  // Soluble Powder
        console.log(`[getDefaultUnitForProduct] "${productName}" → kg/ha (name contains solid indicator)`);
        return 'kg/ha';
    }

    if (nameLower.includes(' sc') ||  // Suspension Concentrate
        nameLower.includes(' ec') ||  // Emulsifiable Concentrate
        nameLower.includes(' sl') ||  // Soluble Liquid
        nameLower.includes(' ew') ||  // Emulsion, water
        nameLower.includes(' se')) {  // Suspo-emulsion
        console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (name contains liquid indicator)`);
        return 'L/ha';
    }

    if (!product?.gebruiksvoorschriften?.length) {
        console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (no CTGB data found)`);
        return 'L/ha'; // Default fallback
    }

    // Check the dosering unit from the gebruiksvoorschriften
    for (const voorschrift of product.gebruiksvoorschriften) {
        const dosering = voorschrift.dosering?.toLowerCase() || '';

        // Check for kg indicators (solid products)
        if (dosering.includes('kg') || dosering.includes(' g ') || dosering.match(/\d+\s*g\b/)) {
            console.log(`[getDefaultUnitForProduct] "${productName}" → kg/ha (dosering: ${voorschrift.dosering})`);
            return 'kg/ha';
        }

        // Check for L indicators (liquid products)
        if (dosering.includes(' l') || dosering.includes('ml') || dosering.includes('liter')) {
            console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (dosering: ${voorschrift.dosering})`);
            return 'L/ha';
        }
    }

    console.log(`[getDefaultUnitForProduct] "${productName}" → L/ha (default fallback)`);
    return 'L/ha'; // Default for unknown
}

// ============================================================================
// PARCEL NAME-TO-ID RESOLUTION
// ============================================================================

/**
 * Resolves parcel names/varieties/crops to actual parcel IDs.
 * Handles multiple scenarios:
 * 1. Direct ID match (AI returned valid UUID)
 * 2. Exact name match
 * 3. Variety match (e.g., "conference" → all Conference parcels)
 * 4. Crop match (e.g., "appel" or "appels" → all Appel parcels)
 * 5. Partial/fuzzy name match
 */
function resolveParcelNamesToIds(
    rawPlots: string[],
    allParcels: SprayableParcel[]
): string[] {
    const resolvedIds = new Set<string>();

    console.log(`[resolveParcelNamesToIds] Input rawPlots: ${JSON.stringify(rawPlots)}`);

    for (const raw of rawPlots) {
        const normalized = raw.toLowerCase().trim();
        let matchType = 'none';

        // 1. Check if it's already a valid parcel ID
        const directMatch = allParcels.find(p => p.id === raw);
        if (directMatch) {
            resolvedIds.add(directMatch.id);
            matchType = 'direct_id';
            console.log(`[resolveParcelNamesToIds] "${raw}" → direct ID match: ${directMatch.name} (${directMatch.crop})`);
            continue;
        }

        // 2. Check for exact name match
        const exactNameMatch = allParcels.find(
            p => p.name.toLowerCase() === normalized
        );
        if (exactNameMatch) {
            resolvedIds.add(exactNameMatch.id);
            matchType = 'exact_name';
            console.log(`[resolveParcelNamesToIds] "${raw}" → exact name: ${exactNameMatch.name} (${exactNameMatch.crop})`);
            continue;
        }

        // 3. Check for variety match (e.g., "conference", "elstar")
        // Only match if variety has content (avoid empty string matching everything)
        const varietyMatches = allParcels.filter(p => {
            const variety = p.variety?.toLowerCase();
            if (!variety || variety.length < 2) return false; // Skip empty or very short varieties
            return variety === normalized ||
                   variety.includes(normalized) ||
                   (normalized.length > 3 && normalized.includes(variety)); // Only check if normalized is meaningful
        });
        if (varietyMatches.length > 0) {
            varietyMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'variety';
            console.log(`[resolveParcelNamesToIds] "${raw}" → variety match: ${varietyMatches.length} parcels (${varietyMatches.map(p => `${p.name}:${p.crop}`).join(', ')})`);
            continue;
        }

        // 4. Check for crop match (e.g., "appel", "appels", "peer", "peren")
        const cropNormalized = normalized
            .replace(/s$/, '')  // Remove trailing 's' (appels → appel)
            .replace(/en$/, ''); // Remove trailing 'en' (peren → per → peer)

        // Handle "peer" specifically since "peren" → "per" doesn't match "peer"
        const cropSearch = cropNormalized === 'per' ? 'peer' : cropNormalized;

        const cropMatches = allParcels.filter(
            p => p.crop?.toLowerCase() === cropSearch ||
                 p.crop?.toLowerCase().startsWith(cropSearch)
        );
        if (cropMatches.length > 0) {
            cropMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'crop';
            console.log(`[resolveParcelNamesToIds] "${raw}" → crop match (search="${cropSearch}"): ${cropMatches.length} parcels`);
            continue;
        }

        // 5. Check for partial name match (fuzzy)
        // Be more strict: parcel name must contain the search term, or search term starts with parcel name
        const partialMatches = allParcels.filter(p => {
            const parcelName = p.name.toLowerCase();
            const firstWord = parcelName.split(' ')[0];
            // Parcel name contains the normalized search (e.g., searching "jacht" finds "Jachthoek...")
            if (parcelName.includes(normalized) && normalized.length >= 3) return true;
            // Search starts with parcel's first word (e.g., searching "jachthoek 3" finds "Jachthoek 3Rijen")
            if (firstWord.length >= 3 && normalized.startsWith(firstWord)) return true;
            return false;
        });
        if (partialMatches.length > 0) {
            partialMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'partial';
            console.log(`[resolveParcelNamesToIds] "${raw}" → partial match: ${partialMatches.length} parcels (${partialMatches.map(p => `${p.name}:${p.crop}`).join(', ')})`);
            continue;
        }

        // 6. Check if it contains crop/variety keywords (handle plurals)
        if (normalized.includes('appel') || normalized.includes('apple')) {
            const appleMatches = allParcels.filter(p => p.crop?.toLowerCase() === 'appel');
            appleMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'keyword_appel';
            console.log(`[resolveParcelNamesToIds] "${raw}" → keyword appel: ${appleMatches.length} parcels`);
        } else if (normalized.includes('peer') || normalized.includes('pear') || normalized.includes('peren')) {
            const pearMatches = allParcels.filter(p => p.crop?.toLowerCase() === 'peer');
            pearMatches.forEach(p => resolvedIds.add(p.id));
            matchType = 'keyword_peer';
            console.log(`[resolveParcelNamesToIds] "${raw}" → keyword peer: ${pearMatches.length} parcels`);
        }

        if (matchType === 'none') {
            console.log(`[resolveParcelNamesToIds] "${raw}" → NO MATCH FOUND`);
        }
    }

    // Log final result with crop breakdown
    const resolved = Array.from(resolvedIds);
    const cropBreakdown = new Map<string, number>();
    for (const id of resolved) {
        const parcel = allParcels.find(p => p.id === id);
        const crop = parcel?.crop || 'unknown';
        cropBreakdown.set(crop, (cropBreakdown.get(crop) || 0) + 1);
    }
    console.log(`[resolveParcelNamesToIds] Final: ${resolved.length} parcels, breakdown: ${JSON.stringify(Object.fromEntries(cropBreakdown))}`);

    return resolved;
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const ConversationMessageSchema = zod.object({
    id: zod.string(),
    role: zod.enum(['user', 'assistant']),
    content: zod.string(),
    timestamp: zod.string(),
});

const ProductEntrySchema = zod.object({
    product: zod.string(),
    dosage: zod.number(),
    unit: zod.string(),
    targetReason: zod.string().optional(),
});

const SprayRegistrationUnitSchema = zod.object({
    id: zod.string(),
    plots: zod.array(zod.string()),
    products: zod.array(ProductEntrySchema),
    label: zod.string().optional(),
    status: zod.enum(['pending', 'confirmed']),
    date: zod.string().optional(),
});

const SprayRegistrationGroupSchema = zod.object({
    groupId: zod.string(),
    date: zod.string(),
    rawInput: zod.string(),
    units: zod.array(SprayRegistrationUnitSchema),
});

// User context schema (client-loaded, sent with each request)
const UserContextSchema = zod.object({
    parcels: zod.array(zod.object({
        id: zod.string(),
        name: zod.string(),
        crop: zod.string(),
        variety: zod.string().nullable(),
        area: zod.number().nullable(),
    })),
    products: zod.array(zod.object({
        id: zod.string(),
        naam: zod.string(),
        toelatingsnummer: zod.string(),
        categorie: zod.string().nullable(),
        werkzameStoffen: zod.array(zod.string()),
        gebruiksvoorschriften: zod.array(zod.object({
            gewas: zod.string(),
            doelorganisme: zod.string().optional(),
            dosering: zod.string().optional(),
            maxToepassingen: zod.number().optional(),
        })),
    })),
    recentHistory: zod.array(zod.object({
        parcelId: zod.string(),
        parcelName: zod.string(),
        product: zod.string(),
        dosage: zod.number(),
        unit: zod.string(),
        date: zod.string(),
    })),
    productAliases: zod.array(zod.object({
        alias: zod.string(),
        officialName: zod.string(),
        productId: zod.string().optional(),
    })),
    loadedAt: zod.string(),
}).optional();

const RequestSchema = zod.object({
    message: zod.string().min(1, 'Message is required'),
    conversationHistory: zod.array(ConversationMessageSchema),
    currentDraft: SprayRegistrationGroupSchema.nullable(),
    userContext: UserContextSchema,
});

// ============================================================================
// MAIN API HANDLER
// ============================================================================

export async function POST(req: Request) {
    const encoder = new TextEncoder();
    const context = 'Smart Input V2 API';
    const startTime = Date.now();

    try {
        // Step 1: Parse and validate request
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            console.error(`[${context}] Invalid JSON in request body`);
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const parseResult = RequestSchema.safeParse(body);
        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(i => i.message);
            return NextResponse.json({ error: `Validation failed: ${issues.join(', ')}` }, { status: 400 });
        }

        const { message, conversationHistory, currentDraft, userContext } = parseResult.data;
        const hasClientContext = !!userContext?.parcels?.length;
        console.log(`[${context}] Processing: "${message.substring(0, 50)}..." draft: ${currentDraft ? 'yes' : 'no'}, clientContext: ${hasClientContext}`);

        // Step 2: Get user ID (middleware handles auth for protected routes)
        const userId = await getUserIdFallback();

        // Step 3: Create streaming response
        const stream = new ReadableStream({
            async start(controller) {
                const send = (msg: StreamMessageV2) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
                    } catch (err) {
                        console.error(`[${context}] Failed to send message:`, err);
                    }
                };

                try {
                    // Route to appropriate handler
                    if (!currentDraft) {
                        // PATH 1: First message - use pipeline
                        await handleFirstMessage(message, userId, send, context, userContext);
                    } else {
                        // PATH 2: Draft exists - use agent
                        // Convert parsed draft (string dates) to SprayRegistrationGroup (Date objects)
                        const draftWithDates: SprayRegistrationGroup = {
                            groupId: currentDraft.groupId,
                            date: new Date(currentDraft.date),
                            rawInput: currentDraft.rawInput,
                            units: currentDraft.units.map(u => ({
                                ...u,
                                date: u.date ? new Date(u.date) : undefined,
                            })),
                        };
                        await handleAgentMessage(
                            message,
                            conversationHistory,
                            draftWithDates,
                            userId,
                            send,
                            context,
                            userContext
                        );
                    }
                } catch (error) {
                    console.error(`[${context}] Handler error:`, error);
                    send({
                        type: 'error',
                        message: error instanceof Error ? error.message : 'Onbekende fout',
                    });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error(`[${context}] Top-level error:`, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

// ============================================================================
// PATH 1: First Message Handler (Pipeline)
// ============================================================================

async function handleFirstMessage(
    message: string,
    userId: string,
    send: (msg: StreamMessageV2) => void,
    context: string,
    userContext?: SmartInputUserContext
): Promise<void> {
    const startTime = Date.now();

    // Step 1: Use client-provided context OR fetch from database (fallback)
    let allParcels: SprayableParcel[];
    let allProducts: CtgbProduct[];
    let parcelHistory: Array<{ parcelId: string; parcelName: string; product: string; dosage: number; unit: string; date: Date }>;

    if (userContext?.parcels?.length && userContext?.products?.length) {
        // Use client-provided context - NO database calls!
        console.log(`[${context}] Using client-provided context`);
        send({ type: 'processing', phase: 'Invoer analyseren...' });

        allParcels = userContext.parcels.map(p => ({
            id: p.id,
            name: p.name,
            parcelId: p.id,
            parcelName: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })) as SprayableParcel[];

        // Convert slim products to full products (with required fields for validation)
        allProducts = userContext.products.map(p => ({
            id: p.id,
            naam: p.naam,
            toelatingsnummer: p.toelatingsnummer,
            categorie: p.categorie,
            werkzameStoffen: p.werkzameStoffen,
            gebruiksvoorschriften: p.gebruiksvoorschriften.map(g => ({
                gewas: g.gewas,
                doelorganisme: g.doelorganisme,
                dosering: g.dosering,
                maxToepassingen: g.maxToepassingen,
            })),
        })) as CtgbProduct[];

        parcelHistory = userContext.recentHistory.map(h => ({
            parcelId: h.parcelId,
            parcelName: h.parcelName,
            product: h.product,
            dosage: h.dosage,
            unit: h.unit,
            date: new Date(h.date),
        }));

        console.log(`[${context}] Client context: ${allParcels.length} parcels, ${allProducts.length} products, ${parcelHistory.length} history`);
    } else {
        // Fallback: Fetch from database
        console.log(`[${context}] No client context, fetching from database...`);
        send({ type: 'processing', phase: 'Percelen ophalen...' });

        const [fetchedParcels, fetchedProducts, fetchedHistory] = await Promise.all([
            getSprayableParcels(),
            getAllCtgbProducts(),
            getParcelHistoryEntries(),
        ]);

        allParcels = fetchedParcels;
        allProducts = fetchedProducts;
        parcelHistory = fetchedHistory.map(h => ({
            parcelId: h.parcelId,
            parcelName: h.parcelName || '',
            product: h.product,
            dosage: h.dosage,
            unit: h.unit,
            date: h.date instanceof Date ? h.date : new Date(h.date),
        }));

        console.log(`[${context}] Database context: ${allParcels.length} parcels, ${allProducts.length} products`);
    }

    send({ type: 'processing', phase: 'Invoer analyseren...' });

    // Step 2: Run combined intent + parse flow
    const parcelContext = JSON.stringify(
        allParcels.map(p => ({
            id: p.id,
            name: p.name,
            crop: p.crop,
            variety: p.variety,
        }))
    );

    const combinedResult = await classifyAndParseSpray({
        userInput: message,
        hasDraft: false,
        plots: parcelContext,
    });

    console.log(`[${context}] Combined result: intent=${combinedResult.intent}, confidence=${combinedResult.confidence}`);
    console.log(`[${context}] AI parsed plots: ${JSON.stringify(combinedResult.sprayData?.plots)}`);
    console.log(`[${context}] AI parsed products: ${JSON.stringify(combinedResult.sprayData?.products)}`);

    // Step 3: Check if this is a spray registration intent
    if (combinedResult.intent !== 'REGISTER_SPRAY' || !combinedResult.sprayData) {
        // Not a registration - return as query
        send({
            type: 'complete',
            response: {
                action: 'answer_query',
                humanSummary: 'Dit lijkt geen bespuiting registratie te zijn.',
                queryAnswer: 'Probeer iets als "gisteren alle peren met merpan 2L"',
                processingTimeMs: Date.now() - startTime,
            },
        });
        return;
    }

    send({ type: 'processing', phase: 'Producten resolven...' });

    // Step 4: Process spray data (handles both simple and grouped registrations)
    const sprayData = combinedResult.sprayData;
    const groupId = crypto.randomUUID();
    const today = new Date();

    // Parse date from sprayData or default to today
    let registrationDate = today;
    if (sprayData.date) {
        try {
            registrationDate = new Date(sprayData.date);
        } catch {
            registrationDate = today;
        }
    }

    // Step 5: Build registration units
    const units: Array<{
        id: string;
        plots: string[];
        products: ProductEntry[];
        label?: string;
        status: 'pending' | 'confirmed';
    }> = [];

    // Check if this is a grouped registration (multiple units with variations)
    if (sprayData.isGrouped && sprayData.registrations && sprayData.registrations.length > 0) {
        console.log(`[${context}] Processing grouped registration with ${sprayData.registrations.length} units`);

        // Collect all product names for alias resolution
        const allProductNames = sprayData.registrations.flatMap((reg: { products: Array<{ product: string }> }) =>
            reg.products.map((p: { product: string }) => p.product)
        );
        const resolvedProducts = await resolveProductAliases(allProductNames);

        for (const reg of sprayData.registrations) {
            // Resolve plots for this unit
            const rawPlots = reg.plots || [];
            const resolvedPlots = resolveParcelNamesToIds(rawPlots, allParcels);

            // Resolve products for this unit
            const resolvedUnitProducts: ProductEntry[] = reg.products.map((prod: { product: string; dosage?: number; unit?: string }) => {
                const resolved = resolvedProducts.get(prod.product);
                const resolvedName = resolved?.resolvedName || prod.product;
                // Use smart unit detection based on product type (solid vs liquid)
                const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                return {
                    product: resolvedName,
                    dosage: prod.dosage || 0,
                    unit: prod.unit || defaultUnit,
                };
            });

            console.log(`[${context}] Unit "${reg.label || 'unnamed'}": ${rawPlots.length} raw → ${resolvedPlots.length} plots`);

            units.push({
                id: crypto.randomUUID(),
                plots: resolvedPlots,
                products: resolvedUnitProducts,
                label: reg.label,
                status: 'pending',
            });
        }
    } else {
        // Simple registration (single unit)
        console.log(`[${context}] Processing simple registration`);

        // Resolve product aliases
        const productNames = sprayData.products?.map((p: { product: string }) => p.product) || [];
        const resolvedProducts = await resolveProductAliases(productNames);

        // Build products array with resolved names
        const products: ProductEntry[] = [];
        if (sprayData.products) {
            for (const prod of sprayData.products) {
                const resolved = resolvedProducts.get(prod.product);
                const resolvedName = resolved?.resolvedName || prod.product;
                // Use smart unit detection based on product type (solid vs liquid)
                const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
                products.push({
                    product: resolvedName,
                    dosage: prod.dosage || 0,
                    unit: prod.unit || defaultUnit,
                });
            }
        }

        // Resolve plots
        const rawPlots: string[] = sprayData.plots || [];
        const plots: string[] = resolveParcelNamesToIds(rawPlots, allParcels);

        console.log(`[${context}] Plot resolution: ${rawPlots.length} raw → ${plots.length} resolved`);

        units.push({
            id: crypto.randomUUID(),
            plots,
            products,
            status: 'pending',
        });
    }

    // Create the registration group
    const registrationGroup: SprayRegistrationGroup = {
        groupId,
        date: registrationDate,
        rawInput: message,
        units,
    };

    // For validation and summary, use all plots and products from all units
    const allUnitPlots = units.flatMap(u => u.plots);
    const allUnitProducts = units.flatMap(u => u.products);
    const plots = allUnitPlots;
    const products = allUnitProducts;

    send({ type: 'processing', phase: 'Valideren...' });

    // Step 6: Get last used dosages for products with dosage=0
    const productsNeedingDosage = products.filter(p => p.dosage === 0).map(p => p.product);
    const lastUsedDosages = productsNeedingDosage.length > 0
        ? await getLastUsedDosages(productsNeedingDosage)
        : new Map();

    console.log(`[${context}] Last used dosages found for ${lastUsedDosages.size}/${productsNeedingDosage.length} products`);

    // Step 7: Validate
    const validationResult = await validateParsedSprayData(
        { plots, products, date: registrationDate.toISOString() },
        allParcels.map(p => ({
            id: p.id,
            name: p.name,
            area: p.area || 0,
            crop: p.crop,
            variety: p.variety,
        })) as any,
        allProducts,
        parcelHistory as any
    );

    // Build validation flags from CTGB validation result
    const validationFlags: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];
    if (validationResult.validationMessage) {
        validationFlags.push({
            type: validationResult.errorCount > 0 ? 'error' : 'warning',
            message: validationResult.validationMessage,
        });
    }

    // Step 7b: Run draft validation (business rules)
    const draftValidationContext: SmartInputUserContext = userContext || {
        parcels: allParcels.map(p => ({
            id: p.id,
            name: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })),
        products: allProducts.map(p => ({
            id: p.id,
            naam: p.naam,
            toelatingsnummer: p.toelatingsnummer,
            categorie: p.categorie || null,
            werkzameStoffen: p.werkzameStoffen || [],
            gebruiksvoorschriften: (p.gebruiksvoorschriften || []).map((g: { gewas?: string; doelorganisme?: string; dosering?: string; maxToepassingen?: number }) => ({
                gewas: g.gewas || '',
                doelorganisme: g.doelorganisme,
                dosering: g.dosering,
                maxToepassingen: g.maxToepassingen,
            })),
        })),
        recentHistory: [],
        productAliases: [],
        loadedAt: new Date().toISOString(),
    };

    const draftValidation = validateDraft(registrationGroup, draftValidationContext);
    console.log(`[${context}] ${formatValidationResult(draftValidation)}`);

    // Merge draft validation issues into validationFlags
    for (const issue of draftValidation.issues) {
        // Don't duplicate info about zero dosage (already handled by CTGB validation)
        if (issue.code === 'ZERO_DOSAGE') continue;

        validationFlags.push({
            type: issue.severity,
            message: issue.message,
            field: issue.field,
        });
    }

    // Step 8: Generate human summary
    const parcelNames = plots
        .map(id => allParcels.find(p => p.id === id)?.name || id)
        .slice(0, 3);
    const parcelSummary = parcelNames.length > 3
        ? `${parcelNames.join(', ')} en ${plots.length - 3} andere`
        : parcelNames.join(', ');

    const productSummary = products
        .map(p => p.dosage > 0 ? `${p.product} ${p.dosage} ${p.unit}` : p.product)
        .join(', ');

    let humanSummary = '';
    const needsDosage = products.some(p => p.dosage === 0);

    if (plots.length === 0) {
        humanSummary = 'Welke percelen?';
    } else if (products.length === 0) {
        humanSummary = `${parcelSummary}. Welk middel?`;
    } else if (needsDosage) {
        humanSummary = `${parcelSummary} met ${productSummary}. Welke dosering?`;
    } else {
        humanSummary = `${parcelSummary} met ${productSummary}.`;
    }

    // Step 9: Build response
    const response: SmartInputV2Response = {
        action: needsDosage ? 'clarification_needed' : 'new_draft',
        humanSummary,
        registration: registrationGroup,
        validationFlags: validationFlags.length > 0 ? validationFlags : undefined,
        processingTimeMs: Date.now() - startTime,
    };

    if (needsDosage) {
        const productNeedingDosage = products.find(p => p.dosage === 0);
        const productName = productNeedingDosage?.product || '';
        const lastUsed = lastUsedDosages.get(productName);

        // Build clarification with options if we have last used dosage
        const clarificationOptions: string[] = [];
        if (lastUsed) {
            const dateStr = lastUsed.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
            clarificationOptions.push(`${lastUsed.dosage} ${lastUsed.unit} (vorige keer: ${dateStr})`);
        }

        response.clarification = {
            question: lastUsed
                ? `Welke dosering voor ${productName}? Vorige keer: ${lastUsed.dosage} ${lastUsed.unit}`
                : `Welke dosering voor ${productName}?`,
            options: clarificationOptions.length > 0 ? clarificationOptions : undefined,
            field: 'dosage',
        };
    }

    send({ type: 'complete', response });
}

// ============================================================================
// PATH 2: Agent Message Handler
// ============================================================================

async function handleAgentMessage(
    message: string,
    conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>,
    currentDraft: SprayRegistrationGroup,
    userId: string,
    send: (msg: StreamMessageV2) => void,
    context: string,
    userContext?: SmartInputUserContext
): Promise<void> {
    const startTime = Date.now();

    send({ type: 'processing', phase: 'Agent denkt na...' });

    // Use client-provided context OR fetch from database (fallback)
    let allParcels: SprayableParcel[];

    if (userContext?.parcels?.length) {
        // Use client-provided context - NO database calls!
        console.log(`[${context}] Agent using client-provided context`);
        allParcels = userContext.parcels.map(p => ({
            id: p.id,
            name: p.name,
            parcelId: p.id,
            parcelName: p.name,
            crop: p.crop,
            variety: p.variety,
            area: p.area,
        })) as SprayableParcel[];
    } else {
        // Fallback: Fetch from database
        console.log(`[${context}] Agent fetching parcels from database...`);
        allParcels = await getSprayableParcels();
    }

    const parcelContext = allParcels.map(p => ({
        id: p.id,
        name: p.name,
        crop: p.crop || 'Onbekend',
        variety: p.variety || 'Onbekend',
    }));

    // Convert draft date to string if needed
    const draftForAgent = {
        ...currentDraft,
        date: currentDraft.date instanceof Date
            ? currentDraft.date.toISOString().split('T')[0]
            : String(currentDraft.date).split('T')[0],
        units: currentDraft.units.map(u => ({
            ...u,
            date: u.date
                ? (u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date).split('T')[0])
                : undefined,
        })),
    };

    // Use streaming agent
    const agentStream = registrationAgentStream({
        userMessage: message,
        currentDraft: draftForAgent,
        conversationHistory: conversationHistory.map(m => ({
            role: m.role,
            content: m.content,
        })),
        userId,
        parcelContext,
    });

    let finalOutput: AgentOutput | null = null;

    for await (const event of agentStream) {
        switch (event.type) {
            case 'thinking':
                send({ type: 'processing', phase: 'Agent analyseert...' });
                break;

            case 'tool_call':
                send({ type: 'tool_call', tool: event.tool, input: event.input });
                break;

            case 'tool_result':
                send({ type: 'tool_result', tool: event.tool, success: true });
                break;

            case 'complete':
                finalOutput = event.output;
                break;

            case 'error':
                send({ type: 'error', message: event.message });
                return;
        }
    }

    if (!finalOutput) {
        send({ type: 'error', message: 'Agent produceerde geen output' });
        return;
    }

    // Convert agent output to API response
    const response: SmartInputV2Response = {
        action: finalOutput.action === 'update_draft' ? 'update_draft'
            : finalOutput.action === 'clarification_needed' ? 'clarification_needed'
            : finalOutput.action === 'confirm_and_save' ? 'confirm_and_save'
            : finalOutput.action === 'cancel' ? 'cancel'
            : 'answer_query',
        humanSummary: finalOutput.humanSummary,
        processingTimeMs: Date.now() - startTime,
        toolsCalled: finalOutput.toolsCalled,
    };

    // Add registration if available (with parcel name-to-ID resolution)
    if (finalOutput.updatedDraft) {
        response.registration = {
            groupId: finalOutput.updatedDraft.groupId,
            date: new Date(finalOutput.updatedDraft.date),
            rawInput: finalOutput.updatedDraft.rawInput,
            units: finalOutput.updatedDraft.units.map(u => ({
                id: u.id,
                // Resolve any parcel names to IDs (agent might return names)
                plots: resolveParcelNamesToIds(u.plots, allParcels),
                products: u.products,
                label: u.label,
                status: u.status,
                date: u.date ? new Date(u.date) : undefined,
            })),
        };
    }

    // Add clarification if needed
    if (finalOutput.clarification) {
        response.clarification = finalOutput.clarification;
    }

    // Add query answer if this was a question
    if (finalOutput.queryAnswer) {
        response.queryAnswer = finalOutput.queryAnswer;
    }

    send({ type: 'complete', response });
}
