/**
 * Registration Pipeline (Shared)
 *
 * Core deterministic-first spray registration logic extracted from the V3 route.
 * Used by both:
 *   - src/app/api/smart-input-v3/route.ts  (web streaming API)
 *   - src/lib/spray-pipeline.ts             (WhatsApp pipeline)
 *
 * Does NOT contain any streaming/send callbacks.
 * Returns AnalysisResult objects that callers can wrap as needed.
 */

import { deterministicParse, resolveParcelsByText, type ParsedProduct } from '@/lib/deterministic-parser';
import { classifyAndParseSpray } from '@/ai/flows/classify-and-parse-spray';
import { resolveProductAliasesParallel, getProductSuggestions } from '@/lib/product-aliases';
import { validateParsedSprayData } from '@/lib/validation-service';
import {
    getAllCtgbProducts,
    getLastUsedDosages,
    getAllFertilizers,
    type SprayableParcel,
} from '@/lib/supabase-store';
import type { ParcelHistoryEntry } from '@/lib/types';
import type {
    SprayRegistrationGroup,
    SprayRegistrationUnit,
    ProductEntry,
    CtgbProduct,
    FertilizerProduct,
} from '@/lib/types';
import { validateDraft } from '@/lib/draft-validator';
import {
    detectRegistrationType,
    resolveProductSources,
    resolveFertilizerProduct,
} from '@/lib/fertilizer-lookup';
import { sanitizeForPrompt } from '@/lib/ai-sanitizer';

// ============================================================================
// TYPES
// ============================================================================

export type AnalysisResult = {
    action: 'new_draft' | 'clarification_needed' | 'answer_query';
    humanSummary: string;
    registration?: SprayRegistrationGroup;
    validationFlags?: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }>;
    clarification?: { question: string; options?: string[]; field: string };
    processingTimeMs: number;
};

export interface CachedContext {
    parcels: SprayableParcel[];
    products: CtgbProduct[];
    fertilizers: FertilizerProduct[];
    parcelGroups: Array<{ id: string; name: string; subParcelIds: string[] }>;
    parcelHistory: ParcelHistoryEntry[];
    loadedAt: number;
}

/** Invalidate the context cache for a user — call after saving a registration. */
export function invalidateContextCache(userId: string): void {
    contextCache.delete(userId);
}

// ============================================================================
// SERVER-SIDE CONTEXT CACHE
// ============================================================================

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Loads (or returns cached) user context needed for registration pipeline.
 * Uses supabaseAdmin with explicit userId filtering so this works server-side
 * without browser auth (required for WhatsApp and API route handlers).
 */
export async function getOrLoadContext(userId: string): Promise<CachedContext> {
    const cached = contextCache.get(userId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
        return cached;
    }

    // IMPORTANT: Use admin client with explicit userId filtering!
    // The store functions (getSprayableParcels etc.) use getCurrentUserId()
    // which depends on browser auth - this FAILS on the server.
    // We use supabaseAdmin + explicit .eq('user_id', userId) for data isolation.
    const { getSupabaseAdmin } = await import('@/lib/supabase-client');
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Admin client unavailable - check SUPABASE_SERVICE_ROLE_KEY');

    const [parcelsResult, products, fertilizers, parcelGroupsResult, parcelHistoryResult] = await Promise.all([
        // Parcels: admin + explicit userId filter
        admin
            .from('v_sprayable_parcels')
            .select('*')
            .eq('user_id', userId)
            .order('name')
            .then(({ data, error }) => {
                if (error) {
                    console.error('[Pipeline Context] Parcels error:', error.message);
                    return [];
                }
                return (data || []).map((item: any): SprayableParcel => {
                    // Fix redundant names: "Steketee Tessa (Tessa)" → "Steketee (Tessa)"
                    // when sp.name == sp.variety in the SQL view
                    let name = item.name;
                    if (name && item.variety && item.parcel_name) {
                        const redundant = `${item.parcel_name} ${item.variety} (${item.variety})`;
                        if (name.toLowerCase() === redundant.toLowerCase()) {
                            name = `${item.parcel_name} (${item.variety})`;
                        }
                    }
                    return {
                        id: item.id,
                        name,
                        area: item.area,
                        crop: item.crop || 'Onbekend',
                        variety: item.variety,
                        parcelId: item.parcel_id || item.id,
                        parcelName: item.parcel_name || name,
                        location: item.location,
                        geometry: item.geometry,
                        source: item.source,
                        rvoId: item.rvo_id,
                        synonyms: item.synonyms || [],
                    };
                });
            }),
        // Products: shared data, no user filter needed
        getAllCtgbProducts(),
        // Fertilizers: shared data, no user filter needed
        getAllFertilizers(),
        // Parcel groups: admin + explicit userId filter
        admin
            .from('parcel_groups')
            .select('id, name, parcel_group_members(sub_parcel_id)')
            .eq('user_id', userId)
            .then(({ data, error }) => {
                if (error) {
                    console.error('[Pipeline Context] Parcel groups error:', error.message);
                    return [];
                }
                return (data || []).map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    subParcelIds: (g.parcel_group_members || []).map((m: any) => m.sub_parcel_id),
                }));
            }),
        // Parcel history: last 90 days for interval validation
        admin
            .from('parcel_history')
            .select('id, parcel_id, parcel_name, crop, variety, product, dosage, unit, date, registration_type')
            .eq('user_id', userId)
            .gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
            .order('date', { ascending: false })
            .then(({ data, error }) => {
                if (error) {
                    console.error('[Pipeline Context] Parcel history error:', error.message);
                    return [] as ParcelHistoryEntry[];
                }
                return (data || []).map((item: any): ParcelHistoryEntry => ({
                    id: item.id,
                    logId: item.log_id || item.id,
                    spuitschriftId: item.spuitschrift_id || item.id,
                    parcelId: item.parcel_id,
                    parcelName: item.parcel_name,
                    crop: item.crop,
                    variety: item.variety,
                    product: item.product,
                    dosage: item.dosage,
                    unit: item.unit,
                    date: new Date(item.date),
                    registrationType: item.registration_type || 'spraying',
                }));
            }),
    ]);

    console.log(`[Pipeline Context] Loaded for user ${userId.substring(0, 8)}...: parcels=${parcelsResult.length}, products=${products.length}, fertilizers=${fertilizers.length}, groups=${parcelGroupsResult.length}, history=${parcelHistoryResult.length}`);

    const ctx: CachedContext = {
        parcels: parcelsResult,
        products,
        fertilizers,
        parcelGroups: parcelGroupsResult,
        parcelHistory: parcelHistoryResult,
        loadedAt: Date.now(),
    };

    contextCache.set(userId, ctx);
    return ctx;
}

// ============================================================================
// PRODUCT UNIT HELPERS
// ============================================================================

export function getDefaultUnitForProduct(
    productName: string,
    allProducts: CtgbProduct[]
): string {
    const nameLower = productName.toLowerCase();

    // Check product name for solid indicators
    if (/\b(spuitkorrel|granulaat|poeder|wp|wg|wdg|sg|sp)\b/i.test(nameLower)) return 'kg';
    if (/\b(sc|ec|sl|ew|se)\b/i.test(nameLower)) return 'L';

    const product = allProducts.find(p =>
        p.naam.toLowerCase() === nameLower || p.naam.toLowerCase().includes(nameLower)
    );

    if (product?.gebruiksvoorschriften) {
        for (const v of product.gebruiksvoorschriften) {
            const d = (v.dosering || '').toLowerCase();
            if (d.includes('kg') || /\d+\s*g\b/.test(d)) return 'kg';
            if (d.includes(' l') || d.includes('ml') || d.includes('liter')) return 'L';
        }
    }

    return 'L';
}

export function normalizeDosageUnit(dosage: number, unit: string): { dosage: number; unit: string } {
    const u = unit.toLowerCase().replace('/ha', '').trim();
    if (u === 'g' || u === 'gram' || u === 'gr') return { dosage: dosage / 1000, unit: 'kg' };
    if (u === 'ml') return { dosage: dosage / 1000, unit: 'L' };
    if (u === 'kg') return { dosage, unit: 'kg' };
    if (u === 'l' || u === 'liter') return { dosage, unit: 'L' };
    return { dosage, unit: unit || 'L' };
}

// ============================================================================
// PRODUCT RESOLUTION HELPER
// ============================================================================

export function resolveProducts(
    rawProducts: ParsedProduct[],
    resolvedAliases: Map<string, any>,
    allProducts: CtgbProduct[]
): ProductEntry[] {
    return rawProducts.map(p => {
        const alias = resolvedAliases.get(p.product);
        const resolvedName = alias?.resolvedName || p.product;
        const defaultUnit = getDefaultUnitForProduct(resolvedName, allProducts);
        const normalized = normalizeDosageUnit(p.dosage, p.unit || defaultUnit);
        return {
            product: resolvedName,
            dosage: normalized.dosage,
            unit: normalized.unit,
        };
    });
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Core registration pipeline (deterministic-first).
 * Fetches context via getOrLoadContext (admin client, works server-side / WhatsApp).
 * Returns an AnalysisResult without any streaming side-effects.
 */
export async function runRegistrationPipeline(
    message: string,
    userId: string
): Promise<AnalysisResult> {
    const startTime = Date.now();
    let currentStep = 'init';

    try {
        currentStep = 'detectRegistrationType';
        const registrationType = detectRegistrationType(message);
        console.log(`[Pipeline] Step 0: registrationType=${registrationType}`);

        // Step 1: Load context (from cache or DB)
        currentStep = 'loadContext';
        const ctx = await getOrLoadContext(userId);
        console.log(`[Pipeline] Step 1: context loaded - parcels=${ctx.parcels.length}, products=${ctx.products.length}, fertilizers=${ctx.fertilizers.length}`);

        // Step 2: Try deterministic parse FIRST
        currentStep = 'deterministicParse';
        const deterResult = deterministicParse(message, ctx.parcels, ctx.parcelGroups);
        console.log(`[Pipeline] Step 2: Deterministic parse: confidence=${deterResult.confidence.toFixed(2)}, path=${deterResult.parsePath || 'none'}, parcels=${deterResult.parcelIds?.length ?? 0}, products=${deterResult.products?.length ?? 0}, isGrouped=${deterResult.isGrouped || false}, registrations=${deterResult.registrations?.length ?? 0}`);

        let parcelIds: string[] = [];
        let rawProducts: ParsedProduct[] = [];
        let isGrouped = false;
        let registrations = deterResult.registrations;
        let usedAI = false;

        if (deterResult.success && deterResult.confidence >= 0.85) {
            // FAST PATH: Deterministic parse succeeded
            parcelIds = deterResult.parcelIds || [];
            rawProducts = deterResult.products || [];
            isGrouped = deterResult.isGrouped || false;
            console.log(`[Pipeline] ⚡ FAST PATH: Skipping AI (confidence: ${deterResult.confidence})`);
        } else {
            // SLOW PATH: Fall back to AI
            usedAI = true;
            console.log(`[Pipeline] 🤖 AI FALLBACK: Confidence too low (${deterResult.confidence})`);

            try {
                const parcelContext = JSON.stringify(
                    ctx.parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))
                );

                const combinedResult = await classifyAndParseSpray({
                    userInput: sanitizeForPrompt(message),
                    hasDraft: false,
                    plots: parcelContext,
                });

                if (combinedResult.intent !== 'REGISTER_SPRAY' || !combinedResult.sprayData) {
                    return {
                        action: 'answer_query',
                        humanSummary: 'Dit lijkt geen bespuiting registratie te zijn.',
                        processingTimeMs: Date.now() - startTime,
                    };
                }

                // Convert AI output to our format
                const sprayData = combinedResult.sprayData;
                isGrouped = sprayData.isGrouped;

                if (sprayData.registrations?.length) {
                    registrations = sprayData.registrations.map((reg: { plots?: string[]; products?: Array<{ product: string; dosage?: number; unit?: string }>; label?: string }) => ({
                        parcelIds: resolveParcelsByText(
                            (reg.plots || []).join(' '),
                            ctx.parcels,
                            ctx.parcelGroups
                        ).ids,
                        products: (reg.products || []).map((p: { product: string; dosage?: number; unit?: string }) => ({
                            product: p.product,
                            dosage: p.dosage || 0,
                            unit: p.unit || 'L',
                        })),
                        label: reg.label,
                    }));
                } else {
                    parcelIds = resolveParcelsByText(
                        (sprayData.plots || []).join(' '),
                        ctx.parcels,
                        ctx.parcelGroups
                    ).ids;
                    rawProducts = (sprayData.products || []).map((p: { product: string; dosage?: number; unit?: string }) => ({
                        product: p.product,
                        dosage: p.dosage || 0,
                        unit: p.unit || 'L',
                    }));
                }

                // Use AI date or fallback to deterministic
                if (sprayData.date) {
                    try {
                        deterResult.date = new Date(sprayData.date);
                    } catch { /* keep existing */ }
                }
            } catch (aiError) {
                console.error('[Pipeline] AI fallback failed, using partial deterministic result:', aiError);
                // Use whatever the deterministic parser found (even if low confidence)
                parcelIds = deterResult.parcelIds || [];
                rawProducts = deterResult.products || [];
            }
        }

        // Step 3: Resolve products through alias pipeline
        currentStep = 'resolveProducts';
        console.log(`[Pipeline] Step 3: parcelIds=${parcelIds.length}, rawProducts=${rawProducts.length}, isGrouped=${isGrouped}, registrations=${registrations?.length ?? 0}`);

        const allRawProducts = isGrouped && registrations
            ? registrations.flatMap(r => r.products)
            : rawProducts;

        const productNames = allRawProducts.map(p => p.product);
        console.log(`[Pipeline] Step 3: resolving aliases for: ${productNames.join(', ')}`);
        const resolvedAliases = await resolveProductAliasesParallel(productNames, ctx.products, null, []);
        console.log(`[Pipeline] Step 3: aliases resolved`);

        // Step 4: Build registration units
        currentStep = 'buildUnits';
        const groupId = crypto.randomUUID();
        const registrationDate = deterResult.date || new Date();
        console.log(`[Pipeline] Step 4: building units, date=${registrationDate}`);

        const units: SprayRegistrationUnit[] = [];

        if (isGrouped && registrations) {
            for (const reg of registrations) {
                units.push({
                    id: crypto.randomUUID(),
                    plots: reg.parcelIds,
                    products: resolveProducts(reg.products, resolvedAliases, ctx.products),
                    label: reg.label,
                    status: 'pending',
                });
            }
        } else {
            units.push({
                id: crypto.randomUUID(),
                plots: parcelIds,
                products: resolveProducts(rawProducts, resolvedAliases, ctx.products),
                status: 'pending',
            });
        }

        // Step 5: Dual-database source resolution (CTGB vs fertilizers)
        currentStep = 'resolveProductSources';
        const ctgbNames = new Set(ctx.products.map(p => p.naam.toLowerCase()));
        for (const unit of units) {
            unit.products = resolveProductSources(
                unit.products,
                registrationType,
                ctgbNames,
                ctx.fertilizers,
            ).map(p => ({
                product: p.product,
                dosage: p.dosage,
                unit: p.unit,
                source: p.source,
            }));
        }

        // Step 6: Validation (parallel)
        currentStep = 'validation';
        console.log(`[Pipeline] Step 6: units=${units.length}, products=${units.flatMap(u => u.products).map(p => `${p.product}(${p.source})`).join(',')}`);

        const registrationGroup: SprayRegistrationGroup = {
            groupId,
            date: registrationDate,
            rawInput: message,
            units,
            registrationType,
        };

        const allPlots = units.flatMap(u => u.plots);
        const allProducts = units.flatMap(u => u.products);
        const ctgbProducts = allProducts.filter(p => !p.source || p.source === 'ctgb');
        const productsNeedingDosage = allProducts.filter(p => p.dosage === 0).map(p => p.product);

        // Safety: ensure date is valid
        const dateStr = isNaN(registrationDate.getTime())
            ? new Date().toISOString()
            : registrationDate.toISOString();

        console.log(`[Pipeline] Step 6: ctgbProducts=${ctgbProducts.length}, allPlots=${allPlots.length}, date=${dateStr}`);

        let validationResult = { isValid: true, validationMessage: '' as string | null, errorCount: 0, warningCount: 0 };
        let draftValidation = { issues: [] as Array<{ code: string; severity: 'error' | 'warning' | 'info'; message: string; field?: string }> };
        let lastUsedDosages = new Map<string, { dosage: number; unit: string }>();

        try {
            const results = await Promise.all([
                ctgbProducts.length > 0
                    ? validateParsedSprayData(
                        { plots: allPlots, products: ctgbProducts, date: dateStr },
                        ctx.parcels.map(p => ({ id: p.id, name: p.name, area: p.area || 0, crop: p.crop, variety: p.variety })) as any,
                        ctx.products,
                        ctx.parcelHistory as any
                    )
                    : Promise.resolve({ isValid: true, validationMessage: '' as string | null, errorCount: 0, warningCount: 0 }),
                Promise.resolve(validateDraft(registrationGroup, {
                    parcels: ctx.parcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety, area: p.area })),
                    products: ctx.products.map(p => ({
                        id: p.id, naam: p.naam, toelatingsnummer: p.toelatingsnummer,
                        categorie: p.categorie || null, werkzameStoffen: p.werkzameStoffen || [],
                        gebruiksvoorschriften: (p.gebruiksvoorschriften || []).map((g: any) => ({
                            gewas: g.gewas || '', doelorganisme: g.doelorganisme, dosering: g.dosering, maxToepassingen: g.maxToepassingen,
                        })),
                    })),
                    recentHistory: ctx.parcelHistory as any,
                    productAliases: [],
                    loadedAt: new Date().toISOString(),
                })),
                productsNeedingDosage.length > 0 ? getLastUsedDosages(productsNeedingDosage) : Promise.resolve(new Map()),
            ]);
            validationResult = results[0];
            draftValidation = results[1];
            lastUsedDosages = results[2];
            console.log(`[Pipeline] Step 6: validation complete`);
        } catch (validationError) {
            console.error('[Pipeline] Validation failed (non-fatal):', validationError);
            // Continue without validation - don't crash the whole request
        }

        // Step 7: Build validation flags
        currentStep = 'buildFlags';
        const validationFlags: Array<{ type: 'error' | 'warning' | 'info'; message: string; field?: string }> = [];

        if (validationResult.validationMessage) {
            validationFlags.push({
                type: validationResult.errorCount > 0 ? 'error' : 'warning',
                message: validationResult.validationMessage,
            });
        }

        for (const issue of draftValidation.issues) {
            if (issue.code === 'ZERO_DOSAGE') continue;
            validationFlags.push({ type: issue.severity, message: issue.message, field: issue.field });
        }

        // Step 8: Check unknown products
        currentStep = 'checkUnknownProducts';
        for (const prod of allProducts) {
            if (prod.source === 'fertilizer') { prod.resolved = true; continue; }

            const ctgbMatch = ctx.products.find(cp =>
                cp.naam.toLowerCase() === prod.product.toLowerCase() ||
                cp.naam.toLowerCase().includes(prod.product.toLowerCase())
            );
            if (ctgbMatch) { prod.resolved = true; continue; }

            const fertCheck = resolveFertilizerProduct(prod.product, registrationType, false, ctx.fertilizers);
            if (fertCheck) {
                prod.product = fertCheck.resolvedName;
                prod.source = 'fertilizer';
                prod.resolved = true;
                continue;
            }

            prod.resolved = false;
            prod.suggestions = getProductSuggestions(prod.product, ctx.products);
            validationFlags.push({
                type: 'warning',
                message: `"${prod.product}" niet gevonden in CTGB database.${prod.suggestions?.length ? ` Bedoel je: ${prod.suggestions.map((s: any) => s.naam).join(', ')}?` : ''}`,
                field: 'products',
            });
        }

        // Step 9: Generate human summary
        currentStep = 'generateSummary';
        const needsDosage = allProducts.some(p => p.dosage === 0);
        const parcelNames = allPlots.slice(0, 3).map(id => ctx.parcels.find(p => p.id === id)?.name || id);
        const parcelSummary = allPlots.length > 3
            ? `${parcelNames.join(', ')} en ${allPlots.length - 3} andere`
            : parcelNames.join(', ');
        const productSummary = allProducts.map(p => p.dosage > 0 ? `${p.product} ${p.dosage} ${p.unit}` : p.product).join(', ');
        const verb = registrationType === 'spreading' ? 'Gestrooid op' : 'Gespoten op';

        let humanSummary: string;
        if (allPlots.length === 0) humanSummary = 'Welke percelen?';
        else if (allProducts.length === 0) humanSummary = `${parcelSummary}. Welk middel?`;
        else if (needsDosage) humanSummary = `${verb} ${parcelSummary} met ${productSummary}. Welke dosering?`;
        else humanSummary = `${verb} ${parcelSummary} met ${productSummary}.`;

        // Step 10: Build response
        currentStep = 'buildResponse';
        let action: AnalysisResult['action'] = 'new_draft';
        if (needsDosage || allPlots.length === 0) action = 'clarification_needed';

        const result: AnalysisResult = {
            action,
            humanSummary,
            registration: registrationGroup,
            validationFlags: validationFlags.length > 0 ? validationFlags : undefined,
            processingTimeMs: Date.now() - startTime,
        };

        if (needsDosage) {
            const productNeedingDosage = allProducts.find(p => p.dosage === 0);
            const productName = productNeedingDosage?.product || '';
            const lastUsed = lastUsedDosages.get(productName);

            result.clarification = {
                question: lastUsed
                    ? `Welke dosering voor ${productName}? Vorige keer: ${lastUsed.dosage} ${lastUsed.unit}`
                    : `Welke dosering voor ${productName}?`,
                options: lastUsed ? [`${lastUsed.dosage} ${lastUsed.unit} (vorige keer)`] : undefined,
                field: 'dosage',
            };
        }

        console.log(`[Pipeline] ✅ Complete in ${Date.now() - startTime}ms (${usedAI ? 'AI' : '⚡ INSTANT'})`);
        return result;

    } catch (stepError) {
        const errMsg = stepError instanceof Error ? stepError.message : String(stepError);
        const errStack = stepError instanceof Error ? stepError.stack : '';
        console.error(`[Pipeline] ❌ Crash at step "${currentStep}":`, errMsg, '\nStack:', errStack);
        throw new Error(`Stap "${currentStep}" mislukt: ${errMsg}`);
    }
}
