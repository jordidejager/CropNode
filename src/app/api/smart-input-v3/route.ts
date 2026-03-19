/**
 * Slimme Invoer V3 API Route
 *
 * Deterministic-first architecture:
 * - First message: Regex parser first, AI only as fallback
 * - Follow-up messages: Existing AI agent with tools
 *
 * Key differences from V2:
 * - Server-side context cache (no 5MB payload per request)
 * - Deterministic parser handles 60-70% of inputs without AI
 * - Much smaller codebase (~350 lines vs V2's ~1600)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requestContext } from '@/lib/request-context';
import { deterministicParse, type ParsedProduct } from '@/lib/deterministic-parser';
import { classifyAndParseSpray } from '@/ai/flows/classify-and-parse-spray';
import { registrationAgentStream, type AgentOutput } from '@/ai/flows/registration-agent';
import { validateParsedSprayData } from '@/lib/validation-service';
import { resolveProductAliasesParallel, getProductSuggestions } from '@/lib/product-aliases';
import {
  getAllCtgbProducts,
  getLastUsedDosages,
  getAllFertilizers,
  type SprayableParcel,
} from '@/lib/supabase-store';
import type {
  SmartInputV2Response,
  StreamMessageV2,
  SmartInputUserContext,
} from '@/lib/types-v2';
import type {
  SprayRegistrationGroup,
  SprayRegistrationUnit,
  ProductEntry,
  CtgbProduct,
  FertilizerProduct,
} from '@/lib/types';
import {
  validateDraft,
  formatValidationResult,
} from '@/lib/draft-validator';
import {
  detectRegistrationType,
  resolveProductSources,
  resolveFertilizerProduct,
} from '@/lib/fertilizer-lookup';
import { sanitizeForPrompt } from '@/lib/ai-sanitizer';
import { resolveParcelsByText } from '@/lib/deterministic-parser';

// ============================================================================
// AUTH
// ============================================================================

async function getServerUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user?.id) return user.id;
    if (error) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// SERVER-SIDE CONTEXT CACHE
// ============================================================================

interface CachedContext {
  parcels: SprayableParcel[];
  products: CtgbProduct[];
  fertilizers: FertilizerProduct[];
  parcelGroups: Array<{ id: string; name: string; subParcelIds: string[] }>;
  loadedAt: number;
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getOrLoadContext(userId: string): Promise<CachedContext> {
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

  const [parcelsResult, products, fertilizers, parcelGroupsResult] = await Promise.all([
    // Parcels: admin + explicit userId filter
    admin
      .from('v_sprayable_parcels')
      .select('*')
      .eq('user_id', userId)
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.error('[V3 Context] Parcels error:', error.message);
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
          console.error('[V3 Context] Parcel groups error:', error.message);
          return [];
        }
        return (data || []).map((g: any) => ({
          id: g.id,
          name: g.name,
          subParcelIds: (g.parcel_group_members || []).map((m: any) => m.sub_parcel_id),
        }));
      }),
  ]);

  console.log(`[V3 Context] Loaded for user ${userId.substring(0, 8)}...: parcels=${parcelsResult.length}, products=${products.length}, fertilizers=${fertilizers.length}, groups=${parcelGroupsResult.length}`);

  const ctx: CachedContext = {
    parcels: parcelsResult,
    products,
    fertilizers,
    parcelGroups: parcelGroupsResult,
    loadedAt: Date.now(),
  };

  contextCache.set(userId, ctx);
  return ctx;
}

// ============================================================================
// PRODUCT UNIT HELPERS
// ============================================================================

function getDefaultUnitForProduct(
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

function normalizeDosageUnit(dosage: number, unit: string): { dosage: number; unit: string } {
  const u = unit.toLowerCase().replace('/ha', '').trim();
  if (u === 'g' || u === 'gram' || u === 'gr') return { dosage: dosage / 1000, unit: 'kg' };
  if (u === 'ml') return { dosage: dosage / 1000, unit: 'L' };
  if (u === 'kg') return { dosage, unit: 'kg' };
  if (u === 'l' || u === 'liter') return { dosage, unit: 'L' };
  return { dosage, unit: unit || 'L' };
}

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

const RequestSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
  })).max(50),
  currentDraft: z.any().nullable(),
});

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      console.error('[V3] Invalid JSON body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error('[V3] Request validation failed:', parseResult.error.issues);
      return NextResponse.json({ error: `Validation failed: ${parseResult.error.issues.map(i => i.message).join(', ')}` }, { status: 400 });
    }

    const { message, conversationHistory, currentDraft } = parseResult.data;
    console.log(`[V3] POST: message="${message.substring(0, 80)}", history=${conversationHistory.length}, hasDraft=${!!currentDraft}`);

    const userId = await getServerUserId();
    if (!userId) {
      console.error('[V3] Auth failed - no userId');
      return NextResponse.json({ error: 'Unauthorized - niet ingelogd' }, { status: 401 });
    }
    console.log(`[V3] Auth OK: userId=${userId.substring(0, 8)}...`);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (msg: StreamMessageV2) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
          } catch { /* stream closed */ }
        };

        try {
          if (!currentDraft) {
            await handleFirstMessage(message, userId, send);
          } else {
            // Try deterministic follow-up FIRST (parcel removal, dosage changes, etc.)
            const ctx = await getOrLoadContext(userId);
            const deterFollowUp = tryDeterministicFollowUp(message, currentDraft, ctx);
            if (deterFollowUp) {
              console.log(`[V3] ⚡ Deterministic follow-up handled: ${deterFollowUp.action}`);
              send({ type: 'complete', response: deterFollowUp });
            } else {
              await handleAgentMessage(message, conversationHistory, currentDraft, userId, send);
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const errStack = error instanceof Error ? error.stack : '';
          console.error('[V3] Handler error:', errMsg, '\nStack:', errStack);
          send({ type: 'error', message: `Er ging iets mis: ${errMsg}` });
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
    console.error('[V3] Top-level error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ============================================================================
// PATH 1: First Message (Deterministic-First Pipeline)
// ============================================================================

async function handleFirstMessage(
  message: string,
  userId: string,
  send: (msg: StreamMessageV2) => void
): Promise<void> {
  const startTime = Date.now();
  let currentStep = 'init';

  try {
  currentStep = 'detectRegistrationType';
  const registrationType = detectRegistrationType(message);
  console.log(`[V3] Step 0: registrationType=${registrationType}`);

  // Step 1: Load context (from cache or DB)
  currentStep = 'loadContext';
  send({ type: 'processing', phase: 'Context laden...' });
  const ctx = await getOrLoadContext(userId);
  console.log(`[V3] Step 1: context loaded - parcels=${ctx.parcels.length}, products=${ctx.products.length}, fertilizers=${ctx.fertilizers.length}`);

  // Step 2: Try deterministic parse FIRST
  currentStep = 'deterministicParse';
  send({ type: 'processing', phase: 'Invoer analyseren...' });
  const deterResult = deterministicParse(message, ctx.parcels, ctx.parcelGroups);
  console.log(`[V3] Step 2: Deterministic parse: confidence=${deterResult.confidence.toFixed(2)}, path=${deterResult.parsePath || 'none'}, parcels=${deterResult.parcelIds?.length ?? 0}, products=${deterResult.products?.length ?? 0}, isGrouped=${deterResult.isGrouped || false}, registrations=${deterResult.registrations?.length ?? 0}`);

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
    console.log(`[V3] ⚡ FAST PATH: Skipping AI (confidence: ${deterResult.confidence})`);
  } else {
    // SLOW PATH: Fall back to AI
    usedAI = true;
    send({ type: 'processing', phase: 'AI verwerkt...' });
    console.log(`[V3] 🤖 AI FALLBACK: Confidence too low (${deterResult.confidence})`);

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
      console.error('[V3] AI fallback failed, using partial deterministic result:', aiError);
      // Use whatever the deterministic parser found (even if low confidence)
      parcelIds = deterResult.parcelIds || [];
      rawProducts = deterResult.products || [];
      // Don't set usedAI flag since AI failed
    }
  }

  // Step 3: Resolve products through alias pipeline
  currentStep = 'resolveProducts';
  send({ type: 'processing', phase: 'Producten resolven...' });
  console.log(`[V3] Step 3: parcelIds=${parcelIds.length}, rawProducts=${rawProducts.length}, isGrouped=${isGrouped}, registrations=${registrations?.length ?? 0}`);

  const allRawProducts = isGrouped && registrations
    ? registrations.flatMap(r => r.products)
    : rawProducts;

  const productNames = allRawProducts.map(p => p.product);
  console.log(`[V3] Step 3: resolving aliases for: ${productNames.join(', ')}`);
  // Use resolveProductAliasesParallel with pre-loaded context (no browser auth dependency)
  const resolvedAliases = await resolveProductAliasesParallel(productNames, ctx.products, null, []);
  console.log(`[V3] Step 3: aliases resolved`);

  // Step 4: Build registration units
  currentStep = 'buildUnits';
  const groupId = crypto.randomUUID();
  const registrationDate = deterResult.date || new Date();
  console.log(`[V3] Step 4: building units, date=${registrationDate}`);

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
  send({ type: 'processing', phase: 'Valideren...' });
  console.log(`[V3] Step 6: units=${units.length}, products=${units.flatMap(u => u.products).map(p => `${p.product}(${p.source})`).join(',')}`);

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

  console.log(`[V3] Step 6: ctgbProducts=${ctgbProducts.length}, allPlots=${allPlots.length}, date=${dateStr}`);

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
            [] as any // Parcel history not needed for first-pass validation
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
        recentHistory: [],
        productAliases: [],
        loadedAt: new Date().toISOString(),
      })),
      productsNeedingDosage.length > 0 ? getLastUsedDosages(productsNeedingDosage) : Promise.resolve(new Map()),
    ]);
    validationResult = results[0];
    draftValidation = results[1];
    lastUsedDosages = results[2];
    console.log(`[V3] Step 6: validation complete`);
  } catch (validationError) {
    console.error('[V3] Validation failed (non-fatal):', validationError);
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
  let action: SmartInputV2Response['action'] = 'new_draft';
  if (needsDosage || allPlots.length === 0) action = 'clarification_needed';

  const response: SmartInputV2Response = {
    action,
    humanSummary,
    registration: registrationGroup,
    validationFlags: validationFlags.length > 0 ? validationFlags : undefined,
    processingTimeMs: Date.now() - startTime,
    // V3-specific: indicate which path was used
    toolsCalled: usedAI ? ['ai_parse'] : ['deterministic_parse'],
  };

  if (needsDosage) {
    const productNeedingDosage = allProducts.find(p => p.dosage === 0);
    const productName = productNeedingDosage?.product || '';
    const lastUsed = lastUsedDosages.get(productName);

    response.clarification = {
      question: lastUsed
        ? `Welke dosering voor ${productName}? Vorige keer: ${lastUsed.dosage} ${lastUsed.unit}`
        : `Welke dosering voor ${productName}?`,
      options: lastUsed ? [`${lastUsed.dosage} ${lastUsed.unit} (vorige keer)`] : undefined,
      field: 'dosage',
    };
  }

  currentStep = 'sendComplete';
  send({ type: 'complete', response });
  console.log(`[V3] ✅ Complete in ${Date.now() - startTime}ms (${usedAI ? 'AI' : '⚡ INSTANT'})`);

  } catch (stepError) {
    const errMsg = stepError instanceof Error ? stepError.message : String(stepError);
    const errStack = stepError instanceof Error ? stepError.stack : '';
    console.error(`[V3] ❌ Crash at step "${currentStep}":`, errMsg, '\nStack:', errStack);
    throw new Error(`Stap "${currentStep}" mislukt: ${errMsg}`);
  }
}

// ============================================================================
// PATH 1.5: Deterministic Follow-Up (parcel removal, dosage changes, etc.)
// ============================================================================

function tryDeterministicFollowUp(
  message: string,
  currentDraft: any,
  ctx: CachedContext
): SmartInputV2Response | null {
  const msgLower = message.toLowerCase().trim();
  const startTime = Date.now();

  // --- Pattern 1: Parcel removal ---
  // "Kloetinge ook niet", "Conference niet", "Nieuwe Conference Jachthoek niet"
  // "zonder Kloetinge", "behalve de Conference"
  const removalPatterns = [
    /^(.+?)\s+ook\s+niet$/i,           // "Kloetinge ook niet"
    /^(.+?)\s+niet$/i,                 // "Conference niet"
    /^(.+?)\s+(?:weg|eruit|verwijderen)$/i, // "Kloetinge verwijderen"
    /^(?:zonder|behalve)\s+(?:de\s+)?(.+)$/i, // "zonder Kloetinge"
  ];

  for (const pattern of removalPatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const targetText = match[1].trim();
      // Skip if the text looks like a product or dosage, not a parcel
      if (/^\d/.test(targetText) || /\d\s*(l|kg|ml|g)\b/i.test(targetText)) continue;

      const resolved = resolveParcelsByText(targetText, ctx.parcels, ctx.parcelGroups);
      if (resolved.ids.length > 0) {
        const removeSet = new Set(resolved.ids);
        const updatedUnits = currentDraft.units
          .map((u: any) => ({
            ...u,
            plots: u.plots.filter((p: string) => !removeSet.has(p)),
          }))
          .filter((u: any) => u.plots.length > 0);

        const totalRemoved = resolved.ids.length;
        const totalRemaining = updatedUnits.reduce((sum: number, u: any) => sum + u.plots.length, 0);
        const removedNames = resolved.ids
          .map(id => ctx.parcels.find(p => p.id === id)?.name || id)
          .slice(0, 3);
        const nameSummary = removedNames.length > 3
          ? `${removedNames.join(', ')} en ${totalRemoved - 3} andere`
          : removedNames.join(', ');

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        console.log(`[V3 FollowUp] Removed ${totalRemoved} parcels (${nameSummary}), ${totalRemaining} remaining`);

        return {
          action: 'update_draft',
          humanSummary: `${nameSummary} ${totalRemoved > 1 ? 'zijn' : 'is'} verwijderd uit de registratie. Nog ${totalRemaining} ${totalRemaining === 1 ? 'perceel' : 'percelen'} over.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // --- Pattern 2: Add parcels ---
  // "Conference ook", "Conference erbij", "ook de appels"
  const addPatterns = [
    /^(.+?)\s+(?:ook|erbij|toevoegen)$/i,     // "Conference ook"
    /^ook\s+(?:de\s+)?(.+)$/i,                 // "ook de appels"
  ];

  for (const pattern of addPatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const targetText = match[1].trim();
      if (/^\d/.test(targetText) || /\d\s*(l|kg|ml|g)\b/i.test(targetText)) continue;

      const resolved = resolveParcelsByText(targetText, ctx.parcels, ctx.parcelGroups);
      if (resolved.ids.length > 0) {
        // Add to the first unit (or the only unit)
        const existingPlots = new Set(currentDraft.units.flatMap((u: any) => u.plots));
        const newPlots = resolved.ids.filter(id => !existingPlots.has(id));

        if (newPlots.length === 0) {
          return {
            action: 'update_draft',
            humanSummary: 'Die percelen zitten al in de registratie.',
            registration: {
              groupId: currentDraft.groupId,
              date: new Date(currentDraft.date),
              rawInput: currentDraft.rawInput,
              registrationType: currentDraft.registrationType,
              units: currentDraft.units.map((u: any) => ({
                ...u,
                date: u.date ? new Date(u.date) : undefined,
              })),
            },
            toolsCalled: ['deterministic_followup'],
            processingTimeMs: Date.now() - startTime,
          };
        }

        const updatedUnits = [...currentDraft.units];
        updatedUnits[0] = {
          ...updatedUnits[0],
          plots: [...updatedUnits[0].plots, ...newPlots],
        };

        const addedNames = newPlots
          .map(id => ctx.parcels.find(p => p.id === id)?.name || id)
          .slice(0, 3);
        const nameSummary = addedNames.length > 3
          ? `${addedNames.join(', ')} en ${newPlots.length - 3} andere`
          : addedNames.join(', ');

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        console.log(`[V3 FollowUp] Added ${newPlots.length} parcels (${nameSummary})`);

        return {
          action: 'update_draft',
          humanSummary: `${nameSummary} ${newPlots.length > 1 ? 'zijn' : 'is'} toegevoegd. Nu ${updatedUnits[0].plots.length} percelen.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // --- Pattern 3: Simple dosage correction ---
  // "0,5 L", "nee 2 kg", "niet 2 maar 1.5", "2 L/ha"
  const dosagePatterns = [
    /^(?:nee\s+)?(\d+[.,]?\d*)\s*(l|liter|kg|kilo|ml|g|gram|gr|l\/ha|kg\/ha)\s*$/i,                          // "0,5 L" or "nee 2 kg" or "500 gram"
    /^(?:nee\s+|niet\s+\d+[.,]?\d*\s*\w*\s+maar\s+)(\d+[.,]?\d*)\s*(l|liter|kg|kilo|ml|g|gram|gr|l\/ha|kg\/ha)\s*$/i, // "niet 2 maar 1.5 L"
  ];

  for (const pattern of dosagePatterns) {
    const match = msgLower.match(pattern);
    if (match) {
      const rawDosage = parseFloat(match[1].replace(',', '.'));
      const rawUnit = match[2].replace('/ha', '').trim();
      const normalized = normalizeDosageUnit(rawDosage, rawUnit);

      // Find the product with dosage 0 or the last product
      const allProducts = currentDraft.units.flatMap((u: any) => u.products);
      const zeroDosageProduct = allProducts.find((p: any) => p.dosage === 0);

      if (zeroDosageProduct || allProducts.length === 1) {
        const targetProduct = zeroDosageProduct || allProducts[0];

        const updatedUnits = currentDraft.units.map((u: any) => ({
          ...u,
          products: u.products.map((p: any) =>
            p.product === targetProduct.product
              ? { ...p, dosage: normalized.dosage, unit: normalized.unit }
              : p
          ),
        }));

        const registration: SprayRegistrationGroup = {
          groupId: currentDraft.groupId,
          date: new Date(currentDraft.date),
          rawInput: currentDraft.rawInput,
          registrationType: currentDraft.registrationType,
          units: updatedUnits.map((u: any) => ({
            ...u,
            date: u.date ? new Date(u.date) : undefined,
          })),
        };

        // Check if there are still products without dosage
        const remainingZero = updatedUnits.flatMap((u: any) => u.products).filter((p: any) => p.dosage === 0);

        const response: SmartInputV2Response = {
          action: 'update_draft',
          humanSummary: `Dosering voor ${targetProduct.product} aangepast naar ${normalized.dosage} ${normalized.unit}/ha.`,
          registration,
          toolsCalled: ['deterministic_followup'],
          processingTimeMs: Date.now() - startTime,
        };

        if (remainingZero.length > 0) {
          response.action = 'clarification_needed';
          response.clarification = {
            question: `Welke dosering voor ${remainingZero[0].product}?`,
            field: 'dosage',
          };
        }

        console.log(`[V3 FollowUp] Dosage corrected: ${targetProduct.product} → ${normalized.dosage} ${normalized.unit}`);
        return response;
      }
    }
  }

  // --- Pattern 4: Confirmation ---
  // "klopt", "opslaan", "bevestig", "ja"
  if (/^(?:klopt|opslaan|bevestig(?:en)?|ja(?:\s+klopt)?|sla op|bewaar|ok[eé]?|akkoord)\s*[.!]?\s*$/i.test(msgLower)) {
    // Don't handle this deterministically if there are unresolved issues
    const hasZeroDosage = currentDraft.units.some((u: any) =>
      u.products.some((p: any) => p.dosage === 0)
    );
    if (!hasZeroDosage) {
      // Let the agent handle save (it calls the save_registration tool)
      return null;
    }
  }

  // --- Pattern 5: Cancellation ---
  if (/^(?:annuleer|stop|toch\s+niet|laat\s+maar|cancel)\s*[.!]?\s*$/i.test(msgLower)) {
    return {
      action: 'cancel',
      humanSummary: 'Registratie geannuleerd.',
      toolsCalled: ['deterministic_followup'],
      processingTimeMs: Date.now() - startTime,
    };
  }

  // No deterministic match → fall through to AI agent
  return null;
}

// ============================================================================
// PATH 2: Agent Message (reuse V2 agent)
// ============================================================================

async function handleAgentMessage(
  message: string,
  conversationHistory: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>,
  currentDraft: any,
  userId: string,
  send: (msg: StreamMessageV2) => void
): Promise<void> {
  const startTime = Date.now();
  send({ type: 'processing', phase: 'Agent denkt na...' });

  const ctx = await getOrLoadContext(userId);

  const draftWithDates: SprayRegistrationGroup = {
    groupId: currentDraft.groupId,
    date: new Date(currentDraft.date),
    rawInput: currentDraft.rawInput,
    registrationType: currentDraft.registrationType,
    units: currentDraft.units.map((u: any) => ({
      ...u,
      date: u.date ? new Date(u.date) : undefined,
    })),
  };

  const draftForAgent = {
    ...draftWithDates,
    date: draftWithDates.date.toISOString().split('T')[0],
    units: draftWithDates.units.map(u => ({
      ...u,
      date: u.date ? (u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date).split('T')[0]) : undefined,
    })),
  };

  await requestContext.run({ userId }, async () => {
    const agentStream = registrationAgentStream({
      userMessage: message,
      currentDraft: draftForAgent,
      conversationHistory: conversationHistory.map(m => ({ role: m.role, content: m.content })),
      userId,
      parcelContext: ctx.parcels.map(p => ({
        id: p.id, name: p.name, crop: p.crop || 'Onbekend', variety: p.variety || 'Onbekend',
      })),
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

    if (finalOutput.updatedDraft) {
      response.registration = {
        groupId: finalOutput.updatedDraft.groupId,
        date: new Date(finalOutput.updatedDraft.date),
        rawInput: finalOutput.updatedDraft.rawInput,
        registrationType: draftWithDates.registrationType,
        units: finalOutput.updatedDraft.units.map(u => {
          // Try to resolve parcel names to IDs (only if agent returned names, not UUIDs)
          const resolvedPlots = resolveParcelsByText(u.plots.join(' '), ctx.parcels, ctx.parcelGroups);
          return {
            id: u.id,
            plots: resolvedPlots.ids.length > 0 ? resolvedPlots.ids : u.plots,
            products: u.products,
            label: u.label,
            status: u.status,
            date: u.date ? new Date(u.date) : undefined,
          };
        }),
      };
    }

    if (finalOutput.clarification) response.clarification = finalOutput.clarification;
    if (finalOutput.queryAnswer) response.queryAnswer = finalOutput.queryAnswer;

    send({ type: 'complete', response });
  });
}

// ============================================================================
// Helpers
// ============================================================================

function resolveProducts(
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
