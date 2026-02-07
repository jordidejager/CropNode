import { NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { z as zod } from 'zod';
import {
    getRelevantProducts,
    buildProductContext,
    extractSearchTerms,
    // New semantic search functions (Fase 2.2)
    getRelevantProductUsages,
    buildProductUsageContext,
    searchProductUsages,
    type ProductUsageMatch
} from '@/lib/rag-service';
import {
    getActiveParcels, getUserPreferences, setUserPreference, getParcelHistoryEntries, getCtgbProductsByNames,
    searchCtgbProducts, getCtgbProductByName, getLogbookEntries, type ActiveParcel,
    getTaskTypes, getActiveTaskSessions, startTaskSession, stopTaskSession, addTaskLog,
    getSprayableParcels, type SprayableParcel
} from '@/lib/supabase-store';
import { resolveProductAlias, PRODUCT_ALIASES, getFrequentlyUsedProducts } from '@/lib/product-aliases';
import { detectParcelGroups, resolveParcelGroup, buildParcelContextWithGroups } from '@/lib/parcel-resolver';
import { classifyIntentWithParams } from '@/ai/flows/intent-router';
// Punt 2: Session caching
import {
    getCacheKey,
    getFromCache,
    setInCache,
    invalidateUserCache,
    CacheTypes,
    getCacheStats
} from '@/lib/session-cache';
import { agribotAgentStream } from '@/ai/flows/agribot-agent';
// Fase 3.1.1: Multi-turn Corrections
import {
    detectCorrection,
    applyCorrection,
    getCorrectionMessage,
    type DraftContext,
    type CorrectionResult
} from '@/lib/correction-service';
import type { IntentType, IntentWithParams, QueryProductParams, QueryHistoryParams, QueryRegulationParams } from '@/ai/schemas/intents';
import type { CtgbProduct, SprayRegistrationGroup, SprayRegistrationUnit, ConfidenceBreakdown } from '@/lib/types';
import { extractQueryParams, isQueryIntent, isLikelySprayRegistration, isDateSplitPattern } from '@/ai/schemas/intents';
import { parseSprayApplicationV2, type RegistrationUnit } from '@/ai/flows/parse-spray-application';
// Punt 7: Combined intent + spray parsing for optimization
import { classifyAndParseSpray, shouldUseCombinedFlow, splitCombinedOutput, type ClassifyAndParseOutput } from '@/ai/flows/classify-and-parse-spray';
// Hours registration AI parsing
import { parseHoursRegistration, isLikelyHoursRegistration, type HoursEntry, type ParseHoursOutput } from '@/ai/flows/parse-hours-registration';

/**
 * Fase 2.6.1: Defensive Validation
 * This API should NEVER crash with 500 errors - always stream error messages instead
 */

// Chat message schema (2.6.2 Context Awareness)
const ChatMessageSchema = zod.object({
    role: zod.enum(['user', 'assistant']),
    content: zod.string(),
    timestamp: zod.string().optional(),
});

// Parcel info schema for correction detection
const ParcelInfoSchema = zod.object({
    id: zod.string(),
    name: zod.string(),
    variety: zod.string().optional(),
    crop: zod.string().optional(),
    area: zod.number().optional(),  // Area in hectares (for test scenarios)
});

// Input Mode type (matches frontend)
const InputModeSchema = zod.enum(['registration', 'product_info', 'workforce', 'research']).default('registration');
type InputMode = zod.infer<typeof InputModeSchema>;

// Input validation schema
const AnalyzeInputRequestSchema = zod.object({
    rawInput: zod.string().min(1, 'Input is required'),
    previousDraft: zod.object({
        plots: zod.array(zod.string()).default([]),
        products: zod.array(zod.object({
            product: zod.string(),
            dosage: zod.number(),
            unit: zod.string(),
            targetReason: zod.string().optional(),
        })).default([]),
        date: zod.string().optional(),
    }).nullable().optional(),
    chatHistory: zod.array(ChatMessageSchema).optional(),  // Chat history (2.6.2)
    parcelInfo: zod.array(ParcelInfoSchema).optional(),    // Parcel metadata for name resolution (refinement flow)
    mode: InputModeSchema,  // Multi-modal input mode
});

// Slot request type (2.6.3 Slot Filling)
interface SlotRequest {
    missingSlot: 'plots' | 'products' | 'dosage' | 'date';
    question: string;
    suggestions: string[];
    currentDraft?: {
        plots: string[];
        products: Array<{ product: string; dosage: number; unit: string }>;
        date?: string;
    };
}

/**
 * Build chat context for AI prompt (2.6.2 Context Awareness + 3.1.1 Conversation Memory)
 * Summarizes recent conversation for the AI with structured context extraction
 */
function buildChatContext(chatHistory: Array<{ role: string; content: string }> | undefined): string {
    if (!chatHistory || chatHistory.length === 0) {
        return '';
    }

    // Only include last 6 messages for context (3 turns)
    const recentMessages = chatHistory.slice(-6);

    // === EXTRACT KEY CONTEXT FROM LAST ASSISTANT MESSAGE ===
    let lastAssistantContext = '';
    const lastAssistantMsg = [...recentMessages].reverse().find(msg => msg.role === 'assistant');

    if (lastAssistantMsg) {
        // Extract products mentioned (common patterns)
        const productMatches = lastAssistantMsg.content.match(/\b(Captan|Delan|Merpan|Decis|Luna\s*Sensation|Bellis|Scala|Chorus|Score|Switch|Topsin|Folicur|Flint|Teldor|Rovral|Malvin|Thiram|Amistar|Signum)\b/gi);

        // Extract dosages mentioned (e.g., "1.5 kg", "2 L", "0.5 kg/ha")
        const dosageMatches = lastAssistantMsg.content.match(/(\d+(?:[.,]\d+)?)\s*(kg|l|ml|g)(?:\s*\/\s*ha)?/gi);

        // Extract parcels/crops mentioned
        const parcelMatches = lastAssistantMsg.content.match(/\b(peer|appel|kers|pruim|elstar|jonagold|conference|boskoop|golden|gala|braeburn)\b/gi);

        // Build structured context
        const extractedItems: string[] = [];

        if (productMatches && productMatches.length > 0) {
            const uniqueProducts = [...new Set(productMatches.map(p => p.trim()))];
            extractedItems.push(`- Laatst genoemde producten: ${uniqueProducts.join(', ')}`);
        }

        if (dosageMatches && dosageMatches.length > 0) {
            const uniqueDosages = [...new Set(dosageMatches.map(d => d.trim()))];
            extractedItems.push(`- Laatst genoemde doseringen: ${uniqueDosages.join(', ')}`);
        }

        if (parcelMatches && parcelMatches.length > 0) {
            const uniqueParcels = [...new Set(parcelMatches.map(p => p.trim().toLowerCase()))];
            extractedItems.push(`- Laatst genoemde percelen/gewassen: ${uniqueParcels.join(', ')}`);
        }

        if (extractedItems.length > 0) {
            lastAssistantContext = `
**VORIGE CONTEXT (voor reference resolution):**
${extractedItems.join('\n')}
`;
        }
    }

    // === BUILD CONVERSATION TRANSCRIPT ===
    const contextLines = recentMessages.map(msg => {
        const role = msg.role === 'user' ? 'Gebruiker' : 'Assistent';
        // Truncate very long messages to keep context manageable
        const content = msg.content.length > 500
            ? msg.content.substring(0, 500) + '...'
            : msg.content;
        return `${role}: ${content}`;
    });

    return `
=== CONVERSATION HISTORY ===
${contextLines.join('\n')}
===========================
${lastAssistantContext}
**REFERENCE RESOLUTION INSTRUCTIES:**
- Bij "En op perceel X?" → Pas de VORIGE actie (product + dosering) toe op perceel X
- Bij "Doe maar iets meer" → Verhoog de laatst genoemde dosering met 10-20%
- Bij "Dat middel" / "Die dosering" → Refereer naar bovenstaande context
- Bij "Wat zei je net?" → Vat het vorige assistent-antwoord samen
`;
}

/**
 * Check for missing required slots and generate appropriate questions (2.6.3 Slot Filling)
 * Enhanced with smart suggestions (3.1.4 Guided Slot Filling)
 */
function checkMissingSlots(
    extractedData: any,
    allParcels: any[],
    rawInput: string,
    frequentProducts: string[] = [],
    recentHistory: any[] = []
): SlotRequest | null {
    // For spray registration, we need at minimum: plots and products

    // Check if plots are missing
    if (!extractedData.plots || extractedData.plots.length === 0) {
        // 3.1.4: Smart parcel suggestions based on crops
        const suggestions: string[] = [];

        // Group parcels by crop and suggest crop groups first
        const cropGroups = new Map<string, any[]>();
        for (const parcel of allParcels) {
            const crop = parcel.crop?.toLowerCase();
            if (crop) {
                if (!cropGroups.has(crop)) {
                    cropGroups.set(crop, []);
                }
                cropGroups.get(crop)!.push(parcel);
            }
        }

        // Add crop group suggestions (e.g., "Alle appels", "Alle peren")
        for (const [crop, parcels] of cropGroups) {
            if (parcels.length > 1) {
                suggestions.push(`Alle ${crop}s`);
            }
        }

        // If we have products mentioned, suggest parcels that match the product's typical crop
        const productName = extractedData.products?.[0]?.product?.toLowerCase() || '';
        if (productName) {
            // Add recent parcels where this product was used
            const parcelsFromHistory = recentHistory
                .filter(h => h.products?.some((p: any) => p.name?.toLowerCase().includes(productName)))
                .flatMap(h => h.parcels || [])
                .slice(0, 2);

            for (const parcelName of parcelsFromHistory) {
                if (!suggestions.includes(parcelName)) {
                    suggestions.push(parcelName);
                }
            }
        }

        // Add individual parcel names
        const parcelNames = allParcels
            .slice(0, 4 - suggestions.length)
            .map(p => p.name || p.id)
            .filter(name => !suggestions.includes(name));
        suggestions.push(...parcelNames);

        return {
            missingSlot: 'plots',
            question: 'Op welk perceel wil je dit toepassen?',
            suggestions: suggestions.slice(0, 4),
            currentDraft: extractedData
        };
    }

    // Check if products are missing
    if (!extractedData.products || extractedData.products.length === 0) {
        // EERST: Check of de rawInput duidelijk productnamen bevat
        // Als ja, vraag NIET om producten - de AI heeft ze gewoon niet goed geëxtraheerd
        const commonProductKeywords = [
            'captan', 'delan', 'merpan', 'decis', 'luna', 'bellis', 'scala', 'chorus',
            'score', 'switch', 'topsin', 'folicur', 'flint', 'teldor', 'rovral', 'malvin',
            'thiram', 'amistar', 'signum', 'coragen', 'surround', 'karate', 'pirimor',
            'movento', 'teppeki', 'calypso', 'steward', 'runner', 'mimic', 'insegar'
        ];
        const inputLower = rawInput.toLowerCase();
        const hasProductInInput = commonProductKeywords.some(prod => inputLower.includes(prod));

        if (hasProductInInput) {
            // User mentioned products but AI didn't extract them - don't ask, just continue
            // The validation step will catch missing products later
            console.log(`[checkMissingSlots] Products mentioned in input but not extracted - skipping slot request`);
            return null;
        }

        // 3.1.4: Smart product suggestions based on frequency and crop
        const suggestions: string[] = [];

        // Get the crop from selected parcels
        const selectedCrops = extractedData.plots
            .map((plotId: string) => {
                const parcel = allParcels.find(p => p.id === plotId);
                return parcel?.crop?.toLowerCase();
            })
            .filter(Boolean);
        const mainCrop = selectedCrops[0];

        // Add frequently used products first
        if (frequentProducts.length > 0) {
            suggestions.push(...frequentProducts.slice(0, 3));
        }

        // If no frequent products, add defaults
        if (suggestions.length === 0) {
            suggestions.push('Captan', 'Delan', 'Merpan');
        }

        // Add "Ander middel" option
        if (!suggestions.includes('Ander middel...')) {
            suggestions.push('Ander middel...');
        }

        return {
            missingSlot: 'products',
            question: mainCrop
                ? `Welk middel wil je gebruiken op de ${mainCrop}?`
                : 'Welk middel wil je gebruiken?',
            suggestions: suggestions.slice(0, 4),
            currentDraft: extractedData
        };
    }

    // Check if any product is missing dosage
    // NOTE: We now have auto-fill from CTGB in the validation step, so we can skip this
    // unless the user explicitly asked for dosage help
    const productWithoutDosage = extractedData.products.find(
        (p: any) => !p.dosage || p.dosage <= 0
    );
    // Skip dosage slot request - auto-fill will handle it in validation
    if (false && productWithoutDosage) {
        // 3.1.4: Smart dosage suggestions based on product name
        const productName = productWithoutDosage.product?.toLowerCase() || '';
        let dosageSuggestions: string[];

        // Check history for typical dosage of this product
        const historicalDosages = recentHistory
            .flatMap(h => h.products || [])
            .filter((p: any) => p.name?.toLowerCase().includes(productName))
            .map((p: any) => `${p.dosage} ${p.unit}/ha`)
            .slice(0, 2);

        if (historicalDosages.length > 0) {
            // Use historical dosages + some variations
            dosageSuggestions = [...new Set(historicalDosages), '1 kg/ha', '1.5 kg/ha'];
        } else if (productName.includes('captan') || productName.includes('merpan')) {
            // Fungicides typically use kg
            dosageSuggestions = ['0.7 kg/ha', '1 kg/ha', '1.5 kg/ha', '2 kg/ha'];
        } else if (productName.includes('olie') || productName.includes('oil')) {
            // Oils typically use L
            dosageSuggestions = ['10 L/ha', '15 L/ha', '20 L/ha', '25 L/ha'];
        } else {
            // Default suggestions
            dosageSuggestions = ['1 kg/ha', '1.5 kg/ha', '2 L/ha', '2.5 L/ha'];
        }

        return {
            missingSlot: 'dosage',
            question: `Welke dosering voor ${productWithoutDosage.product}?`,
            suggestions: dosageSuggestions.slice(0, 4),
            currentDraft: extractedData
        };
    }

    // All required slots are filled
    return null;
}

/**
 * AgriBot Analyze Input API - Multi-Intent Architecture
 *
 * Flow:
 * 0. INTENT CLASSIFICATION: Determine what the user wants (fast, pre-filter + AI fallback)
 * 1. BRANCH: Route to appropriate handler based on intent
 *    - REGISTER_SPRAY / MODIFY_DRAFT → Full spray registration flow
 *    - QUERY_* → Query handlers (product info, history, regulations)
 *    - CONFIRM / CANCEL → Direct response
 *    - CLARIFY / NAVIGATE → Help or navigation response
 *
 * For REGISTER_SPRAY / MODIFY_DRAFT:
 * 2. RAG Step: Extract search terms and find relevant products
 * 3. Alias Resolution: Map short names to official product names
 * 4. Parcel Grouping: Pre-resolve "alle peren", "alle appels", etc.
 * 5. AI Step: Stream intent extraction with enriched context
 * 6. MERGE Step: Combine mutations with previous draft
 * 7. Validation happens separately via /api/validate endpoint
 */

// Action types for multi-turn conversation
const ActionType = z.enum(['new', 'add', 'remove', 'update', 'split']).describe(
    'Type of action: new=fresh registration, add=add to existing, remove=remove from existing, update=modify values, split=split into multiple groups with different dates'
);

const IntentSchema = z.object({
    action: ActionType.describe('Detected action type based on user input'),
    plots: z.array(z.string()).describe('List of parcel IDs to add/remove/set'),
    plotsToRemove: z.array(z.string()).optional().describe('Specific parcel IDs to remove (for remove action)'),
    products: z.array(z.object({
        product: z.string().describe('Exact product name from context'),
        dosage: z.number().describe('Dosage value'),
        unit: z.string().describe('Unit (L, kg, ml, g)'),
        targetReason: z.string().optional().describe('Target organism/reason if mentioned')
    })),
    productsToRemove: z.array(z.string()).optional().describe('Product names to remove'),
    date: z.string().optional().describe('Date in YYYY-MM-DD format if mentioned'),
    updateField: z.string().optional().describe('Which field to update (for update action)'),
    // Split action fields: for creating two groups with different dates
    splitParcels: z.array(z.string()).optional().describe('Parcel IDs to split off into a new group (for split action)'),
    splitDate: z.string().optional().describe('Date for the split-off parcels (YYYY-MM-DD format)'),
    remainingDate: z.string().optional().describe('Date for the remaining parcels (YYYY-MM-DD format)')
});

// Type for the previous draft context
interface PreviousDraft {
    plots: string[];
    products: Array<{
        product: string;
        dosage: number;
        unit: string;
        targetReason?: string;
    }>;
    date?: string;
}

// Streaming message types for the frontend
type StreamMessage =
    | { type: 'intent'; intent: IntentType; confidence: number; params?: Record<string, unknown> }
    | { type: 'searching'; terms: string[] }
    | { type: 'context_ready'; productCount: number; parcelCount: number; resolvedAliases?: Record<string, string> }
    | { type: 'extracting' }
    | { type: 'partial'; data: Partial<z.infer<typeof IntentSchema>> }
    | { type: 'complete'; data: z.infer<typeof IntentSchema>; merged?: boolean; reply?: string }
    | { type: 'grouped_complete'; group: SprayRegistrationGroup; reply: string; parcels: Array<{ id: string; name: string; area: number | null }> }  // V2: Grouped registrations with parcel info
    | { type: 'product_suggestion'; originalInput: string; suggestedProduct: string; message: string }  // NEW: Self-learning alias
    | { type: 'alias_learned'; alias: string; product: string; message: string }  // NEW: Confirm alias saved
    | { type: 'answer'; message: string; intent: IntentType; data?: unknown }
    | { type: 'agent_thinking' }
    | { type: 'agent_tool_call'; tool: string; input?: unknown }
    | { type: 'agent_tool_result'; tool: string; result?: unknown }
    | { type: 'agent_answer'; message: string; toolsUsed?: string[] }
    | { type: 'slot_request'; slotRequest: SlotRequest }  // NEW: 2.6.3 Slot Filling
    | { type: 'correction'; correction: CorrectionResult; message: string; updatedDraft: DraftContext }  // NEW: 3.1.1 Corrections
    | { type: 'error'; message: string };

/**
 * Detect if input contains variation patterns that should trigger grouped parsing
 * Trigger words: "maar", "behalve", "uitgezonderd", "alleen de", "halve dosering", etc.
 */
function detectVariationPattern(input: string): { hasVariation: boolean; pattern?: string } {
    const inputLower = input.toLowerCase();

    const variationPatterns = [
        { pattern: /\bbehalve\b/, label: 'behalve' },
        { pattern: /\buitgezonderd\b/, label: 'uitgezonderd' },
        { pattern: /\bniet de\b/, label: 'niet de' },
        { pattern: /\bzonder de?\b/, label: 'zonder' },
        // "maar" followed by parcel/product context (not just "maar ook")
        { pattern: /\bmaar\b.*\b(ook|extra|nog)\b/, label: 'maar...ook' },
        { pattern: /\bmaar\b(?!.*\bniet\b).*\b(score|merpan|captan|delan|bellis)/i, label: 'maar + product' },
        // Dosage variations
        { pattern: /\bhalve\s*dosering\b/, label: 'halve dosering' },
        { pattern: /\bdubbele\s*dosering\b/, label: 'dubbele dosering' },
        { pattern: /\b(0[.,]5|halve?)\s*(kg|l)\b/, label: 'halve dosis' },
    ];

    for (const { pattern, label } of variationPatterns) {
        if (pattern.test(inputLower)) {
            return { hasVariation: true, pattern: label };
        }
    }

    return { hasVariation: false };
}

/**
 * Punt 5: Generate regex hints for AI pre-enrichment
 * These hints provide context to the AI but don't make definitive decisions
 */
interface RegexHints {
    possibleGroup?: string;
    possibleException?: string;
    variationPattern?: string;
    detectedProducts?: string[];
    detectedDate?: string;
}

function generateRegexHints(
    input: string,
    groupInfo: { hasGroupKeyword: boolean; groupType: 'all' | 'crop' | 'variety' | null; groupValue: string | null },
    variationInfo: { hasVariation: boolean; pattern?: string },
    productTerms: string[]
): RegexHints {
    const hints: RegexHints = {};
    const inputLower = input.toLowerCase();

    // Group keyword hint
    if (groupInfo.hasGroupKeyword && groupInfo.groupValue) {
        hints.possibleGroup = groupInfo.groupValue;
    }

    // Variation pattern hint
    if (variationInfo.hasVariation && variationInfo.pattern) {
        hints.variationPattern = variationInfo.pattern;
    }

    // Exception detection (after "behalve", "niet de", "zonder", etc.)
    const exceptionPatterns = [
        /behalve\s+(?:de\s+)?(\w+)/i,
        /niet\s+de\s+(\w+)/i,
        /zonder\s+(?:de\s+)?(\w+)/i,
        /(\w+)\s+overgeslagen/i,
        /(\w+)\s+niet\b/i,
    ];
    for (const pattern of exceptionPatterns) {
        const match = inputLower.match(pattern);
        if (match && match[1]) {
            hints.possibleException = match[1];
            break;
        }
    }

    // Product terms as hints
    if (productTerms.length > 0) {
        hints.detectedProducts = productTerms;
    }

    // Date detection
    const datePatterns = [
        { pattern: /\bvandaag\b/i, value: 'vandaag' },
        { pattern: /\bgisteren\b/i, value: 'gisteren' },
        { pattern: /\beergisteren\b/i, value: 'eergisteren' },
        { pattern: /\b(\d{1,2})[-\/](\d{1,2})(?:[-\/](\d{2,4}))?\b/, value: 'datum' },
        { pattern: /\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/i, value: 'datum' },
    ];
    for (const { pattern, value } of datePatterns) {
        if (pattern.test(input)) {
            hints.detectedDate = value;
            break;
        }
    }

    return hints;
}

/**
 * Punt 5: Validate AI output against regex hints
 * Returns confidence adjustment based on agreement/disagreement
 */
function validateAIAgainstRegex(
    aiOutput: { registrations: Array<{ plots: string[]; products: Array<{ product: string }> }> },
    regexHints: RegexHints,
    allParcels: Array<{ id: string; name: string; crop: string | null; variety: string | null }>
): { confidenceAdjustment: number; reason: string } {
    // If no hints, no adjustment
    if (!regexHints.possibleGroup && !regexHints.possibleException && !regexHints.detectedProducts) {
        return { confidenceAdjustment: 0, reason: 'no_hints' };
    }

    // Check if AI found the expected exception
    if (regexHints.possibleException) {
        const exceptionLower = regexHints.possibleException.toLowerCase();
        // Check if any registration excludes a parcel that matches the exception
        const allAIPlots = aiOutput.registrations.flatMap(r => r.plots);
        const exceptionParcel = allParcels.find(p =>
            p.name.toLowerCase().includes(exceptionLower) ||
            p.variety?.toLowerCase().includes(exceptionLower)
        );

        if (exceptionParcel && !allAIPlots.includes(exceptionParcel.id)) {
            // AI correctly excluded the exception - boost confidence
            return { confidenceAdjustment: 0.05, reason: 'exception_confirmed' };
        } else if (exceptionParcel && allAIPlots.includes(exceptionParcel.id)) {
            // AI included what should be excluded - lower confidence
            return { confidenceAdjustment: -0.1, reason: 'exception_missed' };
        }
    }

    // Check if AI found the expected products
    if (regexHints.detectedProducts && regexHints.detectedProducts.length > 0) {
        const aiProducts = aiOutput.registrations.flatMap(r => r.products.map(p => p.product.toLowerCase()));
        const foundAll = regexHints.detectedProducts.every(term =>
            aiProducts.some(p => p.includes(term.toLowerCase()))
        );
        if (foundAll) {
            return { confidenceAdjustment: 0.05, reason: 'products_confirmed' };
        }
    }

    return { confidenceAdjustment: 0, reason: 'partial_match' };
}

/**
 * Convert AI V2 output to SprayRegistrationGroup
 * Now includes optional confidence information (Punt 4)
 *
 * Bug 3 Fix: Validates plot IDs against known parcels to filter out phantom UUIDs
 * that the AI might hallucinate. Only plots that exist in validParcelIds are included.
 */
function convertToRegistrationGroup(
    registrations: RegistrationUnit[],
    date: Date,
    rawInput: string,
    confidence?: ConfidenceBreakdown,
    validParcelIds?: Set<string>
): SprayRegistrationGroup {
    const units: SprayRegistrationUnit[] = registrations
        .map((reg, index) => {
            // Bug 3 Fix: Filter plot IDs to only include valid ones
            let validPlots = reg.plots;
            if (validParcelIds && validParcelIds.size > 0) {
                const originalCount = reg.plots.length;
                validPlots = reg.plots.filter(id => validParcelIds.has(id));
                if (validPlots.length < originalCount) {
                    console.warn(`[convertToRegistrationGroup] Filtered ${originalCount - validPlots.length} phantom plot IDs from unit ${index + 1}`);
                }
            }

            return {
                id: `unit-${Date.now()}-${index}`,
                plots: validPlots,
                products: reg.products.map(p => ({
                    product: p.product,
                    dosage: p.dosage,
                    unit: p.unit,
                    targetReason: p.targetReason,
                })),
                label: reg.label,
                status: 'pending' as const,
            };
        })
        // Bug 3 Fix: Remove units that have no valid plots after filtering
        .filter(unit => unit.plots.length > 0);

    if (units.length === 0) {
        console.error('[convertToRegistrationGroup] All units filtered out - no valid plot IDs found');
    }

    return {
        groupId: `group-${Date.now()}`,
        date,
        rawInput,
        units,
        confidence,
    };
}

/**
 * Punt 4: Calculate overall confidence from individual scores
 * Uses minimum of all scores (chain is as strong as weakest link)
 */
function calculateConfidenceBreakdown(
    intentConfidence: number,
    productConfidences: number[],
    parcelConfidence: number
): ConfidenceBreakdown {
    // Product confidence is the minimum of all resolved products
    const productResolution = productConfidences.length > 0
        ? Math.min(...productConfidences)
        : 1.0; // No products = no uncertainty

    // Overall is the minimum of all (weakest link)
    const overall = Math.min(intentConfidence, productResolution, parcelConfidence);

    // Identify uncertain fields
    const uncertainFields: string[] = [];
    if (intentConfidence < 0.65) uncertainFields.push('intent');
    if (productResolution < 0.65) uncertainFields.push('product');
    if (parcelConfidence < 0.65) uncertainFields.push('perceel');

    return {
        intentClassification: intentConfidence,
        productResolution,
        parcelResolution: parcelConfidence,
        overall,
        uncertainFields: uncertainFields.length > 0 ? uncertainFields : undefined,
    };
}

/**
 * Generate a conversational reply based on the action and data
 * This gives the bot personality and makes interactions feel natural
 */
function generateConversationalReply(
    action: string,
    data: z.infer<typeof IntentSchema>,
    wasMerged: boolean
): string {
    const plotCount = data.plots?.length || 0;
    const productCount = data.products?.length || 0;
    const productNames = data.products?.map(p => p.product).join(', ') || '';
    const firstProduct = data.products?.[0];

    // Build reply based on action type
    switch (action) {
        case 'new':
            if (productCount === 1 && plotCount > 0) {
                return `Begrepen! Ik heb ${firstProduct?.product} klaargezet voor ${plotCount} ${plotCount === 1 ? 'perceel' : 'percelen'}. Check rechts of alles klopt.`;
            } else if (productCount > 1 && plotCount > 0) {
                return `Top, ${productCount} middelen klaargezet voor ${plotCount} ${plotCount === 1 ? 'perceel' : 'percelen'}. Zie het overzicht rechts.`;
            } else if (plotCount > 0) {
                return `Ik heb ${plotCount} ${plotCount === 1 ? 'perceel' : 'percelen'} geselecteerd. Zie rechts voor de details.`;
            }
            return `Registratie voorbereid. Controleer rechts of alles klopt.`;

        case 'add':
            if (productCount > 0 && data.products) {
                const addedProducts = data.products.map(p => p.product).join(', ');
                return `Check, ik heb ${addedProducts} toegevoegd aan de registratie.`;
            } else if (plotCount > 0) {
                return `Oké, ${plotCount} ${plotCount === 1 ? 'perceel' : 'percelen'} toegevoegd aan de lijst.`;
            }
            return `Toegevoegd aan de registratie. Zie rechts.`;

        case 'remove':
            const removedCount = data.plotsToRemove?.length || 0;
            if (removedCount > 0) {
                return `Geregeld, ${removedCount} ${removedCount === 1 ? 'perceel' : 'percelen'} verwijderd uit de selectie.`;
            }
            return `Oké, verwijderd uit de registratie.`;

        case 'update':
            // Check updateField first to determine what was actually changed
            if (data.updateField === 'date' || (data.date && !data.updateField)) {
                // Date was updated (either explicitly via updateField or implicitly via date presence without other changes)
                return `Oké, datum aangepast naar ${data.date}. Zie rechts voor het overzicht.`;
            } else if (data.updateField === 'dosage' || firstProduct?.dosage) {
                return `Check, ik heb de dosering aangepast naar ${firstProduct?.dosage || 0} ${firstProduct?.unit || 'L'}/ha.`;
            } else if (data.updateField === 'product') {
                return `Oké, product aangepast. Zie rechts voor het overzicht.`;
            } else if (data.updateField === 'plots') {
                return `Oké, percelen aangepast. Zie rechts voor het overzicht.`;
            }
            return `Aangepast. Controleer rechts of het klopt.`;

        case 'split':
            // Split action has its own handling, but provide fallback message
            return `Registratie gesplitst in meerdere groepen met verschillende datums.`;

        default:
            return `Registratie bijgewerkt. Zie rechts voor de details.`;
    }
}

/**
 * Self-Learning Product Alias System
 *
 * Detecteert onbekende productnamen en zoekt mogelijke matches in CTGB.
 * Als er een match is, vraagt het systeem de gebruiker om bevestiging.
 * Bij bevestiging wordt de alias opgeslagen voor toekomstig gebruik.
 */
interface UnmatchedProduct {
    originalTerm: string;
    suggestedProduct: CtgbProduct | null;
    similarity: number;
}

/**
 * Zoek naar potentiële matches voor onbekende producttermen
 */
async function findProductSuggestions(
    productTerms: string[],
    userPreferences: Awaited<ReturnType<typeof getUserPreferences>>,
    existingAliases: Record<string, string>
): Promise<UnmatchedProduct[]> {
    const unmatched: UnmatchedProduct[] = [];

    for (const term of productTerms) {
        const normalizedTerm = term.toLowerCase().trim();

        // Skip als het al een bekende alias is
        if (PRODUCT_ALIASES[normalizedTerm]) continue;
        if (existingAliases[normalizedTerm]) continue;
        if (userPreferences?.some(p => p.alias.toLowerCase() === normalizedTerm)) continue;

        // Skip als het een gewas/variëteit naam is
        if (KNOWN_CROP_NAMES.has(normalizedTerm)) continue;

        // Zoek in CTGB database
        try {
            const searchResults = await searchCtgbProducts(term);

            if (searchResults.length > 0) {
                // Check of er een exacte match is
                const exactMatch = searchResults.find(p =>
                    p.naam.toLowerCase() === normalizedTerm ||
                    p.naam.toLowerCase().startsWith(normalizedTerm + ' ')
                );

                if (exactMatch) {
                    // Exacte match gevonden - geen suggestie nodig
                    continue;
                }

                // Zoek beste partial match
                const bestMatch = searchResults.find(p =>
                    p.naam.toLowerCase().includes(normalizedTerm)
                ) || searchResults[0];

                // Bereken een simpele similarity score
                const similarity = normalizedTerm.length / bestMatch.naam.length;

                if (similarity > 0.3) { // Minimale gelijkenis
                    unmatched.push({
                        originalTerm: term,
                        suggestedProduct: bestMatch,
                        similarity
                    });
                }
            }
        } catch (err) {
            console.error(`[findProductSuggestions] Error searching for "${term}":`, err);
        }
    }

    return unmatched;
}

/**
 * Handle de "Ja" bevestiging van een product suggestie
 * Slaat de alias op en geeft feedback
 */
async function handleProductConfirmation(
    alias: string,
    productName: string
): Promise<{ success: boolean; message: string }> {
    try {
        await setUserPreference({
            alias: alias.toLowerCase(),
            preferred: productName
        });

        // Punt 2: Invalidate user preferences cache after mutation
        invalidateUserCache('session'); // In production, use actual user ID

        return {
            success: true,
            message: `Top! Ik heb geleerd dat "${alias}" = "${productName}". Volgende keer vul ik dit automatisch in!`
        };
    } catch (err) {
        console.error('[handleProductConfirmation] Error saving preference:', err);
        return {
            success: false,
            message: 'Kon de voorkeur niet opslaan. Probeer het later opnieuw.'
        };
    }
}

/**
 * Known crop and variety names that should NOT be treated as products
 * These are commonly confused with product names by the AI
 */
const KNOWN_CROP_NAMES = new Set([
    'conference', 'elstar', 'jonagold', 'boskoop', 'golden', 'gala', 'fuji',
    'peer', 'peren', 'appel', 'appels', 'kers', 'kersen', 'pruim', 'pruimen',
    'doyenné', 'comice', 'williams', 'abate', 'concorde', 'gieser wildeman',
    'delcorf', 'discovery', 'rubens', 'kanzi', 'pinova', 'topaz', 'braeburn',
    'granny smith', 'red delicious', 'cox', 'santana', 'holsteiner', 'wellant'
]);

/**
 * Determine the correct unit (kg vs L) based on product name/formulation
 * Powders/granules use kg, liquids use L
 */
function getCorrectUnitForProduct(productName: string): 'kg' | 'L' {
    const nameLower = productName.toLowerCase();

    // Powder/granule indicators (use kg)
    const powderIndicators = [
        'spuitkorrel', 'korrel', 'poeder', 'granul',
        ' wg', ' wp', ' wdg', ' df', ' sg', ' sp',
        '-wg', '-wp', '-wdg', '-df', '-sg', '-sp'
    ];

    // Liquid indicators (use L)
    const liquidIndicators = [
        ' sc', ' ec', ' sl', ' se', ' ew', ' od', ' cs', ' dc', ' me',
        '-sc', '-ec', '-sl', '-se', '-ew', '-od', '-cs', '-dc', '-me',
        'flow', 'liquid', 'concentraat', 'emuls', 'suspens'
    ];

    // Check for powder indicators
    for (const indicator of powderIndicators) {
        if (nameLower.includes(indicator)) {
            return 'kg';
        }
    }

    // Check for liquid indicators
    for (const indicator of liquidIndicators) {
        if (nameLower.includes(indicator)) {
            return 'L';
        }
    }

    // Default heuristic: if product name ends with common formulation codes
    if (/\s(wg|wp|wdg|df|sg|sp)$/i.test(nameLower)) {
        return 'kg';
    }
    if (/\s(sc|ec|sl|se|ew|od|cs|dc|me)$/i.test(nameLower)) {
        return 'L';
    }

    // Default to L if unknown (most common)
    return 'L';
}

/**
 * Self-Correction: Remove invalid products (like crop/variety names)
 * AND products that weren't mentioned in the original input (AI hallucination prevention)
 *
 * This catches cases where the AI:
 * 1. Interprets "alle conference gespoten" as having "conference" as a product
 * 2. HALLUCINATES products like "Spuitzwavel" that weren't in the input
 */
function filterInvalidProducts(
    aiOutput: z.infer<typeof IntentSchema>,
    rawInput: string,
    productTerms: string[],
    resolvedAliases: Record<string, string>,
    previousDraft?: PreviousDraft | null
): z.infer<typeof IntentSchema> {
    if (!aiOutput.products || aiOutput.products.length === 0) {
        return aiOutput;
    }

    const inputLower = rawInput.toLowerCase();
    const inputWords = inputLower.split(/\s+/);

    // Build list of valid product references - ONLY real product terms
    const validProductRefs = new Set<string>();

    // Add product terms (extracted from input)
    for (const term of productTerms) {
        const termLower = term.toLowerCase().trim();
        if (termLower.length >= 3) { // Only meaningful terms
            validProductRefs.add(termLower);
        }
    }

    // Add resolved aliases
    for (const [alias, product] of Object.entries(resolvedAliases)) {
        validProductRefs.add(alias.toLowerCase());
        validProductRefs.add(product.toLowerCase());
    }

    // Add static aliases that match in input
    for (const [alias, product] of Object.entries(PRODUCT_ALIASES)) {
        if (inputWords.includes(alias) || inputLower.includes(alias)) {
            validProductRefs.add(alias);
            validProductRefs.add(product.toLowerCase());
        }
    }

    // CRITICAL: For MODIFY_DRAFT intents, products from the existing draft are valid!
    // These are not hallucinations - they're part of the ongoing registration
    if (previousDraft?.products && previousDraft.products.length > 0) {
        console.log(`[filterInvalidProducts] Adding ${previousDraft.products.length} products from previous draft as valid refs`);
        for (const draftProduct of previousDraft.products) {
            if (draftProduct.product) {
                const productLower = draftProduct.product.toLowerCase().trim();
                validProductRefs.add(productLower);
                // Also add first word for matching
                const firstWord = productLower.split(/[\s®™]+/)[0];
                if (firstWord.length >= 3) {
                    validProductRefs.add(firstWord);
                }
            }
        }
    }

    console.log(`[filterInvalidProducts] Valid product refs: ${[...validProductRefs].join(', ')}`);
    console.log(`[filterInvalidProducts] AI products: ${aiOutput.products.map(p => p.product).join(', ')}`);

    const validProducts = aiOutput.products.filter(product => {
        const productLower = product.product.toLowerCase().trim();
        const productFirstWord = productLower.split(/[\s®™]+/)[0];
        const productWords = productLower.split(/\s+/);

        // NEVER filter out products that were explicitly resolved from aliases
        // These are guaranteed to be intentional
        const isFromResolvedAlias = Object.values(resolvedAliases).some(resolved =>
            resolved.toLowerCase() === productLower ||
            resolved.toLowerCase().includes(productLower) ||
            productLower.includes(resolved.toLowerCase().split(/[\s®™]+/)[0])
        );
        if (isFromResolvedAlias) {
            console.log(`[filterInvalidProducts] KEEPING (from resolved alias): "${product.product}"`);
            return true;
        }

        // Remove if it's a known crop/variety name
        if (KNOWN_CROP_NAMES.has(productLower) || KNOWN_CROP_NAMES.has(productFirstWord)) {
            console.log(`[filterInvalidProducts] REMOVING crop/variety name: "${product.product}"`);
            return false;
        }

        // STRICT CHECK: Product is valid if ANY of these conditions are met:
        // 1. The first word of the product name appears in the raw input as a separate word
        const firstWordInInput = inputWords.some(w =>
            w === productFirstWord ||
            w.includes(productFirstWord) ||
            productFirstWord.includes(w) && w.length >= 4
        );

        // 2. The product name (or first word) is in our valid refs
        const inValidRefs = validProductRefs.has(productLower) ||
            validProductRefs.has(productFirstWord) ||
            productWords.some(pw => pw.length >= 4 && validProductRefs.has(pw));

        // 3. Any valid ref matches the product (bidirectional)
        const refMatches = [...validProductRefs].some(ref => {
            // Only match if ref is at least 4 chars (avoid false positives)
            if (ref.length < 4) return false;
            return productLower.includes(ref) || ref.includes(productFirstWord);
        });

        const wasInInput = firstWordInInput || inValidRefs || refMatches;

        if (!wasInInput) {
            console.log(`[filterInvalidProducts] REMOVING HALLUCINATION: "${product.product}" (firstWord="${productFirstWord}" not found in input or refs)`);
            return false;
        }

        console.log(`[filterInvalidProducts] KEEPING: "${product.product}" (matched: firstWordInInput=${firstWordInInput}, inValidRefs=${inValidRefs}, refMatches=${refMatches})`);
        return true;
    });

    return { ...aiOutput, products: validProducts };
}

/**
 * Self-Correction: Validate and fix dosage values from AI output
 *
 * This catches cases where the AI misinterprets dosages like "3 kg" as "30"
 * by extracting the actual number from the raw input and comparing.
 *
 * PRIORITY: For explicit dosage update commands ("X moet Y kg zijn"),
 * ALWAYS use the user's specified value, regardless of what the AI returns.
 */
function validateAndFixDosages(
    aiOutput: z.infer<typeof IntentSchema>,
    rawInput: string,
    previousDraft: PreviousDraft | null
): z.infer<typeof IntentSchema> {
    const context = 'Self-Correction';

    // Extract all dosage mentions from the input
    const dosageMatches = rawInput.match(/(\d+(?:[.,]\d+)?)\s*(kg|l|liter|ml|g)(?:\s*\/?\s*ha)?/gi);

    if (!dosageMatches || dosageMatches.length === 0) {
        return aiOutput;
    }

    // Parse expected dosages from input
    const expectedDosages: Array<{ value: number; unit: string }> = dosageMatches.map(match => {
        const parsed = match.match(/(\d+(?:[.,]\d+)?)\s*(kg|l|liter|ml|g)/i);
        if (!parsed) return null;
        const unitRaw = parsed[2].toLowerCase();
        return {
            value: parseFloat(parsed[1].replace(',', '.')),
            unit: unitRaw === 'liter' ? 'L' : unitRaw === 'l' ? 'L' : unitRaw
        };
    }).filter(Boolean) as Array<{ value: number; unit: string }>;

    if (expectedDosages.length === 0) {
        return aiOutput;
    }

    // Check if this is a dosage update (contains "moet" or similar patterns)
    const isDosageUpdate = /moet|maak|wijzig|verander|pas.*aan/i.test(rawInput);

    // Extract product name mentioned in update (e.g., "Surround moet 3 kg zijn" -> "Surround")
    const productUpdateMatch = rawInput.match(/(\w+)\s*moet/i);
    const targetProductName = productUpdateMatch?.[1]?.toLowerCase();

    console.log(`[${context}] Input: "${rawInput}", isDosageUpdate: ${isDosageUpdate}, targetProduct: ${targetProductName}, expectedDosages: ${JSON.stringify(expectedDosages)}`);

    // Validate and fix each product dosage
    const correctedOutput = { ...aiOutput, products: aiOutput.products.map(p => ({ ...p })) };
    let correctionsMade = false;

    // PRIORITY FIX: For explicit dosage updates, directly apply the user's value
    if (isDosageUpdate && expectedDosages[0]) {
        const expectedDosage = expectedDosages[0];

        // Find the target product (by name match or last product)
        let targetIndex = -1;
        if (targetProductName) {
            // Case-insensitive partial match for product name
            targetIndex = correctedOutput.products.findIndex(p =>
                p.product.toLowerCase().includes(targetProductName) ||
                targetProductName.includes(p.product.toLowerCase().split(' ')[0])
            );
        }

        // If not found by name, try matching by unit
        if (targetIndex === -1) {
            targetIndex = correctedOutput.products.findIndex(p =>
                p.unit.toLowerCase() === expectedDosage.unit.toLowerCase()
            );
        }

        // If still not found, use the last product
        if (targetIndex === -1 && correctedOutput.products.length > 0) {
            targetIndex = correctedOutput.products.length - 1;
        }

        if (targetIndex >= 0) {
            const product = correctedOutput.products[targetIndex];
            const currentDosage = product.dosage;

            // Always apply the user's specified dosage for explicit update commands
            if (Math.abs(currentDosage - expectedDosage.value) > 0.01) {
                console.log(`[${context}] DIRECT FIX: ${product.product} dosage ${currentDosage} -> ${expectedDosage.value} ${expectedDosage.unit}`);
                correctedOutput.products[targetIndex] = {
                    ...product,
                    dosage: expectedDosage.value,
                    unit: expectedDosage.unit
                };
                correctionsMade = true;
            }
        }
    } else {
        // For non-update scenarios, check for x10 errors
        for (let i = 0; i < correctedOutput.products.length; i++) {
            const product = correctedOutput.products[i];

            // Find matching expected dosage by unit
            const expectedDosage = expectedDosages.find(d =>
                d.unit.toLowerCase() === product.unit.toLowerCase()
            );

            if (!expectedDosage) continue;

            // Check for x10 error (3 -> 30 or vice versa)
            const ratio = product.dosage / expectedDosage.value;

            if (ratio >= 9 && ratio <= 11) {
                console.log(`[${context}] Fixing x10 error for ${product.product}: ${product.dosage} -> ${expectedDosage.value}`);
                correctedOutput.products[i] = { ...product, dosage: expectedDosage.value };
                correctionsMade = true;
            } else if (ratio >= 0.09 && ratio <= 0.11) {
                console.log(`[${context}] Fixing /10 error for ${product.product}: ${product.dosage} -> ${expectedDosage.value}`);
                correctedOutput.products[i] = { ...product, dosage: expectedDosage.value };
                correctionsMade = true;
            }
        }
    }

    if (correctionsMade) {
        console.log(`[${context}] Corrections applied. Products: ${JSON.stringify(correctedOutput.products.map(p => ({ n: p.product, d: p.dosage, u: p.unit })))}`);
    }

    return correctedOutput;
}

/**
 * Merge the AI output with the previous draft based on action type
 */
function mergeDrafts(
    aiOutput: z.infer<typeof IntentSchema>,
    previousDraft: PreviousDraft | null
): z.infer<typeof IntentSchema> {
    // If no previous draft or action is 'new', return as-is
    if (!previousDraft || aiOutput.action === 'new') {
        return aiOutput;
    }

    const result = { ...aiOutput };

    switch (aiOutput.action) {
        case 'add':
            // Add new items to existing lists (deduplicated)
            result.plots = [...new Set([...previousDraft.plots, ...aiOutput.plots])];

            // Merge products, avoiding duplicates by product name
            const existingProductNames = new Set(previousDraft.products.map(p => p.product.toLowerCase()));
            const newProducts = aiOutput.products.filter(p => !existingProductNames.has(p.product.toLowerCase()));
            result.products = [...previousDraft.products, ...newProducts];

            // Keep previous date if not specified
            if (!result.date && previousDraft.date) {
                result.date = previousDraft.date;
            }
            break;

        case 'remove':
            // Remove specified items from existing lists
            const plotsToRemove = new Set([
                ...(aiOutput.plotsToRemove || []),
                ...aiOutput.plots // AI might put items to remove in plots array
            ].map(p => p.toLowerCase()));

            result.plots = previousDraft.plots.filter(p => !plotsToRemove.has(p.toLowerCase()));

            // Remove products if specified
            const productsToRemove = new Set((aiOutput.productsToRemove || []).map(p => p.toLowerCase()));
            result.products = productsToRemove.size > 0
                ? previousDraft.products.filter(p => !productsToRemove.has(p.product.toLowerCase()))
                : previousDraft.products;

            // Keep previous date
            if (!result.date && previousDraft.date) {
                result.date = previousDraft.date;
            }
            break;

        case 'update':
            // Update specific values while keeping the rest
            result.plots = aiOutput.plots.length > 0 ? aiOutput.plots : previousDraft.plots;

            // Update products: merge by name, update values if same product
            const productMap = new Map(previousDraft.products.map(p => [p.product.toLowerCase(), p]));
            for (const newProduct of aiOutput.products) {
                productMap.set(newProduct.product.toLowerCase(), newProduct);
            }
            result.products = Array.from(productMap.values());

            // Update date if specified
            if (!result.date && previousDraft.date) {
                result.date = previousDraft.date;
            }
            break;
    }

    // Final deduplication
    result.plots = [...new Set(result.plots)];

    // Deduplicate products by name (keep last occurrence with updated values)
    const finalProductMap = new Map<string, typeof result.products[0]>();
    for (const product of result.products) {
        finalProductMap.set(product.product.toLowerCase(), product);
    }
    result.products = Array.from(finalProductMap.values());

    return result;
}

// ============================================================================
// QUERY HANDLERS
// ============================================================================

/**
 * Handler voor QUERY_PRODUCT intent.
 * Gebruikt semantic search voor nauwkeurige product/voorschrift matching.
 */
async function handleQueryProduct(
    send: (msg: StreamMessage) => void,
    params: QueryProductParams,
    rawInput: string
): Promise<void> {
    try {
        // Build semantic search query from params
        const searchParts: string[] = [];
        if (params.productName) searchParts.push(params.productName);
        if (params.targetOrganism) searchParts.push(`tegen ${params.targetOrganism}`);
        if (params.crop) searchParts.push(`voor ${params.crop}`);

        const searchQuery = searchParts.length > 0 ? searchParts.join(' ') : rawInput;

        // Use semantic search for better matching
        const usageMatches = await searchProductUsages(searchQuery, { threshold: 0.35, limit: 10 });

        // If no semantic matches, fallback to keyword search
        if (usageMatches.length === 0) {
            const keywordResults = await searchCtgbProducts(params.productName || params.targetOrganism || params.crop || rawInput.split(' ')[0]);
            if (keywordResults.length === 0) {
                send({
                    type: 'answer',
                    message: 'Ik kon geen producten vinden die aan je zoekcriteria voldoen. ' +
                        'Probeer een andere zoekterm of vraag naar een specifiek product.',
                    intent: 'QUERY_PRODUCT'
                });
                return;
            }
            // Fallback to old display logic
            let message = `Gevonden producten:\n\n`;
            const displayProducts = keywordResults.slice(0, 5);
            for (const p of displayProducts) {
                message += `• **${p.naam}**`;
                if (p.werkzameStoffen?.length) {
                    message += ` (${p.werkzameStoffen[0]})`;
                }
                message += '\n';
            }
            send({
                type: 'answer',
                message,
                intent: 'QUERY_PRODUCT',
                data: { products: displayProducts.map(p => ({ naam: p.naam, toelatingsnummer: p.toelatingsnummer })) }
            });
            return;
        }

        // Build rich response from semantic search results
        let message = '';

        if (params.targetOrganism) {
            message = `**Middelen tegen ${params.targetOrganism}:**\n\n`;
        } else if (params.crop) {
            message = `**Middelen voor ${params.crop}:**\n\n`;
        } else if (params.productName) {
            message = `**Resultaten voor "${params.productName}":**\n\n`;
        } else {
            message = `**Gevonden voorschriften:**\n\n`;
        }

        // Group by product for cleaner display
        const byProduct = new Map<string, ProductUsageMatch[]>();
        for (const match of usageMatches) {
            if (!byProduct.has(match.productNaam)) {
                byProduct.set(match.productNaam, []);
            }
            byProduct.get(match.productNaam)!.push(match);
        }

        // Display top 5 products with their relevant usages
        let count = 0;
        for (const [productName, usages] of byProduct) {
            if (count >= 5) break;
            const first = usages[0];
            message += `• **${productName}** (${first.toelatingsnummer})\n`;

            // Show best matching usage details
            if (first.gewas) message += `  Gewas: ${first.gewas}\n`;
            if (first.doelorganisme) message += `  Doelorganisme: ${first.doelorganisme}\n`;
            if (first.dosering) message += `  Dosering: ${first.dosering}\n`;
            if (first.veiligheidstermijn) message += `  VGT: ${first.veiligheidstermijn}\n`;
            message += '\n';
            count++;
        }

        if (byProduct.size > 5) {
            message += `...en ${byProduct.size - 5} meer producten.`;
        }

        send({
            type: 'answer',
            message,
            intent: 'QUERY_PRODUCT',
            data: {
                products: Array.from(byProduct.entries()).slice(0, 5).map(([naam, usages]) => ({
                    naam,
                    toelatingsnummer: usages[0].toelatingsnummer,
                    topMatch: {
                        gewas: usages[0].gewas,
                        doelorganisme: usages[0].doelorganisme,
                        similarity: usages[0].similarity
                    }
                }))
            }
        });
    } catch (error) {
        console.error('Query product error:', error);
        send({
            type: 'answer',
            message: 'Er ging iets mis bij het zoeken naar producten. Probeer het opnieuw.',
            intent: 'QUERY_PRODUCT'
        });
    }
}

/**
 * Handler voor QUERY_HISTORY intent.
 * Haalt spuitgeschiedenis op uit de logbook.
 */
async function handleQueryHistory(
    send: (msg: StreamMessage) => void,
    params: QueryHistoryParams
): Promise<void> {
    try {
        const entries = await getLogbookEntries();

        // Filter op periode indien opgegeven
        let filteredEntries = entries;
        const now = new Date();

        if (params.period) {
            const periodDays: Record<string, number> = {
                'week': 7,
                'month': 30,
                'season': 180,
                'year': 365,
                'all': 9999
            };
            const days = periodDays[params.period] || 365;
            const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            filteredEntries = entries.filter(e => new Date(e.date) >= cutoff);
        }

        // Filter op product indien opgegeven
        if (params.productName) {
            const productLower = params.productName.toLowerCase();
            filteredEntries = filteredEntries.filter(e =>
                e.parsedData?.products?.some((p: { product: string }) =>
                    p.product.toLowerCase().includes(productLower)
                )
            );
        }

        // Bouw antwoord
        if (filteredEntries.length === 0) {
            send({
                type: 'answer',
                message: 'Geen registraties gevonden voor de opgegeven criteria.',
                intent: 'QUERY_HISTORY'
            });
            return;
        }

        let message = `**Spuitgeschiedenis** (${filteredEntries.length} registraties)\n\n`;

        // Toon laatste 5 registraties
        const recent = filteredEntries.slice(0, 5);
        for (const entry of recent) {
            const date = new Date(entry.date).toLocaleDateString('nl-NL');
            const products = (entry.parsedData?.products || []).map((p: { product: string }) => p.product).join(', ');
            message += `• ${date}: ${products}\n`;
        }

        if (filteredEntries.length > 5) {
            message += `\n...en ${filteredEntries.length - 5} meer.`;
        }

        // Bereken totalen
        const totalProducts = new Map<string, number>();
        for (const entry of filteredEntries) {
            for (const p of (entry.parsedData?.products || [])) {
                totalProducts.set(p.product, (totalProducts.get(p.product) || 0) + 1);
            }
        }

        if (totalProducts.size > 0) {
            message += '\n\n**Meest gebruikte middelen:**\n';
            const sorted = [...totalProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
            for (const [name, count] of sorted) {
                message += `• ${name}: ${count}x\n`;
            }
        }

        send({
            type: 'answer',
            message,
            intent: 'QUERY_HISTORY',
            data: { totalEntries: filteredEntries.length, recentEntries: recent }
        });
    } catch (error) {
        console.error('Query history error:', error);
        send({
            type: 'answer',
            message: 'Er ging iets mis bij het ophalen van de spuitgeschiedenis.',
            intent: 'QUERY_HISTORY'
        });
    }
}

/**
 * Handler voor QUERY_REGULATION intent.
 * Gebruikt semantic search voor nauwkeurige regelgeving matching.
 */
async function handleQueryRegulation(
    send: (msg: StreamMessage) => void,
    params: QueryRegulationParams | undefined,
    rawInput: string
): Promise<void> {
    if (!params?.productName && !params?.crop) {
        send({
            type: 'answer',
            message: 'Welk product of gewas wil je de regelgeving van weten? ' +
                'Zeg bijvoorbeeld: "Wat is de VGT van Captan op peer?"',
            intent: 'QUERY_REGULATION'
        });
        return;
    }

    try {
        // Build semantic search query
        const searchParts: string[] = [];
        if (params?.productName) searchParts.push(params.productName);
        if (params?.crop) searchParts.push(params.crop);
        if (params?.regulationType) {
            // Map regulation type to Dutch terms for better matching
            const regTypeMap: Record<string, string> = {
                'vgt': 'veiligheidstermijn',
                'dosering': 'dosering',
                'interval': 'interval',
                'max_toepassingen': 'maximum toepassingen'
            };
            searchParts.push(regTypeMap[params.regulationType] || params.regulationType);
        }

        const searchQuery = searchParts.join(' ') || rawInput;

        // Use semantic search for precise regulation matching
        const usageMatches = await searchProductUsages(searchQuery, { threshold: 0.3, limit: 8 });

        if (usageMatches.length === 0) {
            // Fallback to keyword search
            const product = params?.productName ? await getCtgbProductByName(params.productName) : null;
            if (product) {
                // Show basic product info from keyword match
                let message = `**${product.naam}** (${product.toelatingsnummer || 'N/A'})\n\n`;
                if (product.werkzameStoffen?.length) {
                    message += `**Werkzame stof:** ${product.werkzameStoffen.join(', ')}\n\n`;
                }
                if (product.gebruiksvoorschriften?.length) {
                    message += `**Gebruiksvoorschriften:**\n`;
                    for (const v of product.gebruiksvoorschriften.slice(0, 3)) {
                        if (v.gewas) message += `\n**${v.gewas}**\n`;
                        if (v.dosering) message += `• Dosering: ${v.dosering}\n`;
                        if (v.doelorganisme) message += `• Doelorganisme: ${v.doelorganisme}\n`;
                    }
                }
                send({ type: 'answer', message, intent: 'QUERY_REGULATION' });
                return;
            }
            send({
                type: 'answer',
                message: `Ik kon geen regelgeving vinden voor "${searchQuery}".`,
                intent: 'QUERY_REGULATION'
            });
            return;
        }

        // Build rich response from semantic search
        let message = '';

        if (params?.productName && params?.crop) {
            message = `**${params.productName} op ${params.crop}:**\n\n`;
        } else if (params?.productName) {
            message = `**Regelgeving voor ${params.productName}:**\n\n`;
        } else if (params?.crop) {
            message = `**Middelen voor ${params.crop}:**\n\n`;
        }

        // Group by product
        const byProduct = new Map<string, ProductUsageMatch[]>();
        for (const match of usageMatches) {
            if (!byProduct.has(match.productNaam)) {
                byProduct.set(match.productNaam, []);
            }
            byProduct.get(match.productNaam)!.push(match);
        }

        // Display regulations grouped by product
        let count = 0;
        for (const [productName, usages] of byProduct) {
            if (count >= 3) break;
            const first = usages[0];
            message += `**${productName}** (${first.toelatingsnummer})\n`;

            // Show relevant regulations for this product
            for (const usage of usages.slice(0, 2)) {
                if (usage.gewas) message += `\n📋 **${usage.gewas}**`;
                if (usage.doelorganisme) message += ` — ${usage.doelorganisme}`;
                message += '\n';
                if (usage.dosering) message += `  • Dosering: ${usage.dosering}\n`;
                if (usage.veiligheidstermijn) message += `  • VGT: ${usage.veiligheidstermijn}\n`;
                if (usage.maxToepassingen) message += `  • Max toepassingen: ${usage.maxToepassingen}\n`;
                if (usage.interval) message += `  • Interval: ${usage.interval}\n`;
            }
            message += '\n';
            count++;
        }

        if (byProduct.size > 3) {
            message += `...en ${byProduct.size - 3} meer producten.`;
        }

        send({
            type: 'answer',
            message,
            intent: 'QUERY_REGULATION',
            data: {
                products: Array.from(byProduct.entries()).slice(0, 3).map(([naam, usages]) => ({
                    naam,
                    toelatingsnummer: usages[0].toelatingsnummer,
                    usages: usages.slice(0, 2).map(u => ({
                        gewas: u.gewas,
                        doelorganisme: u.doelorganisme,
                        dosering: u.dosering,
                        veiligheidstermijn: u.veiligheidstermijn,
                        similarity: u.similarity
                    }))
                }))
            }
        });
    } catch (error) {
        console.error('Query regulation error:', error);
        send({
            type: 'answer',
            message: 'Er ging iets mis bij het ophalen van de regelgeving.',
            intent: 'QUERY_REGULATION'
        });
    }
}

/**
 * Handler voor complexe queries die de AgriBot Agent gebruiken.
 * De agent kan zelf beslissen welke tools aan te roepen.
 *
 * @param send - Function to send streaming messages
 * @param userQuery - The user's query
 * @param chatHistory - Optional conversation history for context awareness (3.1.1)
 */
async function handleAgentQuery(
    send: (msg: StreamMessage) => void,
    userQuery: string,
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<void> {
    try {
        const toolsUsed: string[] = [];

        // Pass conversation history to the agent for reference resolution
        const agentInput = {
            userQuery,
            conversationHistory: chatHistory
        };

        for await (const event of agribotAgentStream(agentInput)) {
            switch (event.type) {
                case 'thinking':
                    send({ type: 'agent_thinking' });
                    break;

                case 'tool_call':
                    send({
                        type: 'agent_tool_call',
                        tool: event.tool || 'unknown',
                        input: event.input,
                    });
                    if (event.tool) toolsUsed.push(event.tool);
                    break;

                case 'tool_result':
                    send({
                        type: 'agent_tool_result',
                        tool: event.tool || 'unknown',
                        result: event.result,
                    });
                    break;

                case 'answer':
                    send({
                        type: 'agent_answer',
                        message: event.content || 'Geen antwoord gegenereerd.',
                        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
                    });
                    break;

                case 'error':
                    send({
                        type: 'error',
                        message: event.content || 'Er ging iets mis.',
                    });
                    break;
            }
        }
    } catch (error) {
        console.error('Agent query error:', error);
        send({
            type: 'error',
            message: 'Er ging iets mis bij het verwerken van je vraag met de agent.',
        });
    }
}

/**
 * Bepaal of een query complex genoeg is voor de agent.
 * Complexe queries combineren meerdere aspecten of vereisen redenering.
 */
function isComplexQuery(query: string, params: Record<string, unknown> | null): boolean {
    const normalizedQuery = query.toLowerCase();

    // Indicatoren voor complexe queries:
    // 1. Bevat meerdere entiteiten (product + perceel, product + datum, etc.)
    const hasMultipleEntities = (
        (params && Object.keys(params).filter(k => params[k]).length >= 2) ||
        /en|ook|daarnaast|bovendien/.test(normalizedQuery)
    );

    // 2. Vraagt om vergelijking of analyse
    const needsAnalysis = /vergelijk|meeste|minste|gemiddeld|totaal|overzicht|samenvatting/.test(normalizedQuery);

    // 3. Combineert tijdsperiode met andere filters
    const combinesTimeWithFilter = (
        /(dit jaar|vorige maand|afgelopen|sinds)/.test(normalizedQuery) &&
        /(op|voor|met|van)/.test(normalizedQuery)
    );

    // 4. Expliciete complexe vraagstructuur
    const complexStructure = /wanneer.*en.*wat|wat.*en.*wanneer|hoeveel.*en|welke.*hebben/.test(normalizedQuery);

    return hasMultipleEntities || needsAnalysis || combinesTimeWithFilter || complexStructure;
}

export async function POST(req: Request) {
    const encoder = new TextEncoder();
    const context = 'Analyze Input API';

    try {
        // Step 1: Parse JSON body safely
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            console.error(`[${context}] Invalid JSON in request body`);
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        // Step 2: Validate input with Zod schema
        const parseResult = AnalyzeInputRequestSchema.safeParse(body);

        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            console.error(`[${context}] Validation failed:`, issues);
            return NextResponse.json({ error: `Validation failed: ${issues.join(', ')}` }, { status: 400 });
        }

        const { rawInput, previousDraft, chatHistory, parcelInfo, mode } = parseResult.data;
        console.log(`[${context}] Processing input: "${rawInput.substring(0, 100)}..." with ${chatHistory?.length || 0} history messages, ${parcelInfo?.length || 0} parcels, mode: ${mode}`);

        // Build chat context for AI (2.6.2 Context Awareness)
        const chatContext = buildChatContext(chatHistory);

        // Create streaming response
        const stream = new ReadableStream({
            async start(controller) {
                const send = (msg: StreamMessage) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));
                    } catch (err) {
                        console.error(`[${context}] Failed to send message:`, err);
                    }
                };

                // Safe send function that catches errors
                const safeSend = (msg: StreamMessage) => {
                    try {
                        send(msg);
                    } catch (err) {
                        console.error(`[${context}] SafeSend error:`, err);
                    }
                };

                try {
                    // === PHASE 0: Early Mode-Based Routing (skip unnecessary DB fetches) ===
                    // For non-registration modes, we don't need parcel data

                    if (mode === 'product_info') {
                        // Product Info mode: Search product database directly
                        safeSend({ type: 'searching', terms: [rawInput] });

                        try {
                            const searchResults = await searchCtgbProducts(rawInput);

                            if (searchResults.length === 0) {
                                safeSend({
                                    type: 'answer',
                                    message: `Geen producten gevonden voor "${rawInput}". Probeer een andere zoekterm of controleer de spelling.`,
                                    intent: 'QUERY_PRODUCT'
                                });
                            } else if (searchResults.length === 1) {
                                const product = searchResults[0];
                                safeSend({
                                    type: 'product_info',
                                    product: product,
                                    message: `Product gevonden: ${product.naam}`,
                                    intent: 'QUERY_PRODUCT'
                                });
                            } else {
                                const topResults = searchResults.slice(0, 8);
                                safeSend({
                                    type: 'product_list',
                                    products: topResults,
                                    totalCount: searchResults.length,
                                    message: `${searchResults.length} producten gevonden voor "${rawInput}"`,
                                    intent: 'QUERY_PRODUCT'
                                });
                            }
                        } catch (err: any) {
                            console.error('[product_info] Search error:', err);
                            safeSend({
                                type: 'error',
                                message: `Fout bij zoeken: ${err.message}`
                            });
                        }

                        controller.close();
                        return;
                    }

                    if (mode === 'workforce') {
                        // Workforce mode: AI-powered hours registration
                        // Supports: timer commands, natural language hours input, corrections
                        try {
                            const taskTypes = await getTaskTypes();
                            const activeSessions = await getActiveTaskSessions();
                            const sprayableParcels = await getSprayableParcels();
                            const availableTaskNames = taskTypes.map(t => t.name).join(',');

                            // Build parcel context for AI
                            const parcelContext = JSON.stringify(
                                sprayableParcels.map(p => ({ id: p.id, name: p.name, crop: p.crop, variety: p.variety }))
                            );

                            // Use AI to parse the input
                            safeSend({ type: 'parsing' });
                            const parseResult = await parseHoursRegistration({
                                userInput: rawInput,
                                availableParcels: parcelContext,
                                availableTaskTypes: availableTaskNames,
                                chatContext: chatContext || undefined,
                            });

                            console.log('[workforce] Parse result:', JSON.stringify(parseResult, null, 2));

                            // Handle timer commands
                            if (parseResult.isTimerCommand) {
                                if (parseResult.timerAction === 'start' && parseResult.timerTaskType) {
                                    const taskName = parseResult.timerTaskType.toLowerCase();
                                    const matchedTaskType = taskTypes.find(t =>
                                        t.name.toLowerCase().includes(taskName) ||
                                        taskName.includes(t.name.toLowerCase())
                                    );

                                    if (!matchedTaskType) {
                                        const availableTasks = taskTypes.map(t => t.name).join(', ');
                                        safeSend({
                                            type: 'answer',
                                            message: `Taak "${parseResult.timerTaskType}" niet gevonden.\n\n**Beschikbare taken:** ${availableTasks}\n\nProbeer: "Start [taaknaam]"`,
                                            intent: 'LOG_HOURS',
                                            data: { action: 'error', availableTasks: taskTypes }
                                        });
                                    } else {
                                        const session = await startTaskSession({
                                            taskTypeId: matchedTaskType.id,
                                            subParcelId: null,
                                            startTime: new Date(),
                                            peopleCount: 1,
                                            notes: `Gestart via Slimme Invoer: "${rawInput}"`
                                        });

                                        safeSend({
                                            type: 'workforce_action',
                                            action: 'start',
                                            data: {
                                                sessionId: session.id,
                                                taskType: matchedTaskType.name,
                                                startTime: session.startTime.toISOString()
                                            },
                                            message: `⏱️ Timer gestart voor **${matchedTaskType.name}**\n\nZeg "Stop" om de timer te stoppen.`
                                        });
                                    }
                                } else if (parseResult.timerAction === 'stop') {
                                    if (activeSessions.length === 0) {
                                        safeSend({
                                            type: 'answer',
                                            message: `Geen actieve timer gevonden.\n\nStart eerst een taak met "Start [taaknaam]"`,
                                            intent: 'LOG_HOURS'
                                        });
                                    } else {
                                        const session = activeSessions[0];
                                        const endTime = new Date();
                                        const startTime = new Date(session.startTime);
                                        const diffMs = endTime.getTime() - startTime.getTime();
                                        const hoursWorked = diffMs / (1000 * 60 * 60);

                                        await stopTaskSession(session.id, endTime, hoursWorked);

                                        const hours = Math.floor(hoursWorked);
                                        const minutes = Math.round((hoursWorked - hours) * 60);
                                        const timeStr = hours > 0 ? `${hours}u ${minutes}m` : `${minutes}m`;

                                        safeSend({
                                            type: 'workforce_action',
                                            action: 'stop',
                                            data: {
                                                sessionId: session.id,
                                                taskType: session.taskTypeName,
                                                duration: timeStr,
                                                hoursWorked
                                            },
                                            message: `✅ Timer gestopt voor **${session.taskTypeName}**\n\n**Gewerkte tijd:** ${timeStr}\n**Personen:** ${session.peopleCount}\n\nDe uren zijn geregistreerd.`
                                        });
                                    }
                                }
                            }
                            // Handle natural language hours registration
                            else if (parseResult.isHoursRegistration && parseResult.entries.length > 0) {
                                const registeredEntries: Array<{ entry: HoursEntry; taskLog?: any }> = [];

                                for (const entry of parseResult.entries) {
                                    // Find matching task type
                                    const matchedTaskType = taskTypes.find(t =>
                                        t.name.toLowerCase() === entry.activity.toLowerCase() ||
                                        t.name.toLowerCase().includes(entry.activity.toLowerCase()) ||
                                        entry.activity.toLowerCase().includes(t.name.toLowerCase())
                                    );

                                    if (!matchedTaskType) {
                                        console.log(`[workforce] Task type not found for activity: ${entry.activity}`);
                                        // Still record the entry for the response, but note it wasn't saved
                                        registeredEntries.push({ entry });
                                        continue;
                                    }

                                    // Find matching parcels (fuzzy match by name)
                                    let matchedParcelId: string | null = null;
                                    if (entry.parcelNames.length > 0) {
                                        const parcelName = entry.parcelNames[0].toLowerCase();
                                        const matchedParcel = sprayableParcels.find(p =>
                                            p.name.toLowerCase().includes(parcelName) ||
                                            parcelName.includes(p.name.toLowerCase())
                                        );
                                        if (matchedParcel) {
                                            matchedParcelId = matchedParcel.id;
                                        }
                                    }

                                    // Create task log
                                    try {
                                        const taskLog = await addTaskLog({
                                            startDate: new Date(entry.date),
                                            endDate: new Date(entry.date),
                                            days: 1, // Single day registration
                                            subParcelId: matchedParcelId,
                                            taskTypeId: matchedTaskType.id,
                                            peopleCount: entry.peopleCount,
                                            hoursPerPerson: entry.hours,
                                            notes: entry.notes || `Via Slimme Invoer: "${rawInput}"`,
                                        });
                                        registeredEntries.push({ entry, taskLog });
                                    } catch (logError: any) {
                                        console.error('[workforce] Failed to create task log:', logError);
                                        registeredEntries.push({ entry });
                                    }
                                }

                                // Build response message
                                const successCount = registeredEntries.filter(e => e.taskLog).length;
                                const totalEntries = registeredEntries.length;

                                let message = '';
                                if (successCount === totalEntries && totalEntries > 0) {
                                    message = `✅ **${totalEntries} urenregistratie${totalEntries > 1 ? 's' : ''} opgeslagen**\n\n`;
                                    for (const { entry, taskLog } of registeredEntries) {
                                        const parcelStr = entry.parcelNames.length > 0 ? ` op ${entry.parcelNames.join(', ')}` : '';
                                        const peopleStr = entry.peopleCount > 1 ? ` (${entry.peopleCount} personen)` : '';
                                        message += `• **${entry.hours}u ${entry.activity}**${parcelStr}${peopleStr}\n`;
                                        message += `  📅 ${entry.date}\n`;
                                    }
                                } else if (successCount > 0) {
                                    message = `⚠️ **${successCount}/${totalEntries} registraties opgeslagen**\n\n`;
                                    for (const { entry, taskLog } of registeredEntries) {
                                        const status = taskLog ? '✅' : '❌';
                                        const parcelStr = entry.parcelNames.length > 0 ? ` op ${entry.parcelNames.join(', ')}` : '';
                                        message += `${status} **${entry.hours}u ${entry.activity}**${parcelStr}\n`;
                                    }
                                    message += '\nSommige taaktypes werden niet gevonden in de database.';
                                } else {
                                    // No task types matched - suggest available types
                                    const availableTasks = taskTypes.map(t => t.name).join(', ');
                                    message = `❌ **Kon geen registraties opslaan**\n\nDe activiteit werd niet herkend.\n\n**Beschikbare taken:** ${availableTasks}`;
                                }

                                safeSend({
                                    type: 'workforce_action',
                                    action: 'log',
                                    data: {
                                        entries: registeredEntries.map(e => ({
                                            hours: e.entry.hours,
                                            activity: e.entry.activity,
                                            parcels: e.entry.parcelNames,
                                            date: e.entry.date,
                                            peopleCount: e.entry.peopleCount,
                                            teamMembers: e.entry.teamMembers,
                                            saved: !!e.taskLog,
                                            taskLogId: e.taskLog?.id,
                                        })),
                                        successCount,
                                        totalCount: totalEntries,
                                    },
                                    message
                                });
                            }
                            // Handle corrections
                            else if (parseResult.isCorrection) {
                                safeSend({
                                    type: 'answer',
                                    message: `🔄 **Correctie gedetecteerd**\n\n${parseResult.correctionType}: ${parseResult.correctedValue}\n\n*Correctie functionaliteit wordt binnenkort uitgebreid.*`,
                                    intent: 'LOG_HOURS',
                                    data: {
                                        isCorrection: true,
                                        correctionType: parseResult.correctionType,
                                        correctedField: parseResult.correctedField,
                                        correctedValue: parseResult.correctedValue,
                                    }
                                });
                            }
                            // Show status/help
                            else {
                                if (activeSessions.length > 0) {
                                    const session = activeSessions[0];
                                    const startTime = new Date(session.startTime);
                                    const diffMs = new Date().getTime() - startTime.getTime();
                                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                                    const minutes = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                    const timeStr = hours > 0 ? `${hours}u ${minutes}m` : `${minutes}m`;

                                    safeSend({
                                        type: 'answer',
                                        message: `**Actieve timer:** ${session.taskTypeName}\n**Looptijd:** ${timeStr}\n**Personen:** ${session.peopleCount}\n\nZeg "Stop" om te stoppen.`,
                                        intent: 'LOG_HOURS',
                                        data: { activeSessions }
                                    });
                                } else {
                                    const availableTasks = taskTypes.map(t => t.name).join(', ');
                                    safeSend({
                                        type: 'answer',
                                        message: parseResult.replyMessage || `**Urenregistratie**\n\n• "Start [taak]" - timer starten\n• "Stop" - timer stoppen\n• "3 uur gesnoeid op Plantsoen" - directe registratie\n\n**Taken:** ${availableTasks}`,
                                        intent: 'LOG_HOURS'
                                    });
                                }
                            }
                        } catch (err: any) {
                            console.error('[workforce] Error:', err);
                            safeSend({
                                type: 'error',
                                message: `Fout bij urenregistratie: ${err.message}`
                            });
                        }

                        controller.close();
                        return;
                    }

                    if (mode === 'research') {
                        // Research mode: RAG search (no parcel data needed)
                        safeSend({ type: 'agent_thinking' });

                        try {
                            const agentStream = agribotAgentStream({
                                userInput: rawInput,
                                chatContext: chatContext || '',
                            });

                            for await (const event of agentStream) {
                                if (event.type === 'thinking') {
                                    safeSend({ type: 'agent_thinking' });
                                } else if (event.type === 'tool_call') {
                                    safeSend({
                                        type: 'agent_tool_call',
                                        tool: event.tool,
                                        input: event.input
                                    });
                                } else if (event.type === 'tool_result') {
                                    safeSend({
                                        type: 'agent_tool_result',
                                        tool: event.tool,
                                        result: event.result
                                    });
                                } else if (event.type === 'answer') {
                                    safeSend({
                                        type: 'agent_answer',
                                        message: event.message,
                                        toolsUsed: event.toolsUsed
                                    });
                                }
                            }
                        } catch (err: any) {
                            safeSend({
                                type: 'error',
                                message: `Research fout: ${err.message}`
                            });
                        }

                        controller.close();
                        return;
                    }

                    // === PHASE 1: Database Fetch with Caching (only for registration mode) ===
                    // Punt 2: Session caching - check cache before hitting database
                    // Note: userId would come from auth context in production
                    const userId = 'session'; // Placeholder - in production use actual user ID

                    let allParcels: ActiveParcel[] = [];
                    let userPreferences: Awaited<ReturnType<typeof getUserPreferences>> = null;
                    let parcelHistory: Awaited<ReturnType<typeof getParcelHistoryEntries>> = [];
                    let frequentProducts: string[] = [];

                    // Cache keys
                    const parcelsCacheKey = getCacheKey(userId, CacheTypes.PARCELS);
                    const prefsCacheKey = getCacheKey(userId, CacheTypes.USER_PREFERENCES);
                    const historyCacheKey = getCacheKey(userId, CacheTypes.PARCEL_HISTORY);
                    const frequentCacheKey = getCacheKey(userId, CacheTypes.FREQUENT_PRODUCTS);

                    // Check caches first
                    const cachedParcels = getFromCache<ActiveParcel[]>(parcelsCacheKey);
                    const cachedPrefs = getFromCache<Awaited<ReturnType<typeof getUserPreferences>>>(prefsCacheKey);
                    const cachedHistory = getFromCache<Awaited<ReturnType<typeof getParcelHistoryEntries>>>(historyCacheKey);
                    const cachedFrequent = getFromCache<string[]>(frequentCacheKey);

                    // Determine which fetches we actually need
                    const needParcels = cachedParcels === undefined;
                    const needPrefs = cachedPrefs === undefined;
                    const needHistory = cachedHistory === undefined;
                    const needFrequent = cachedFrequent === undefined;

                    const cacheHits = [!needParcels, !needPrefs, !needHistory, !needFrequent].filter(Boolean).length;
                    if (cacheHits > 0) {
                        console.log(`[${context}] Cache hits: ${cacheHits}/4 (parcels=${!needParcels}, prefs=${!needPrefs}, history=${!needHistory}, frequent=${!needFrequent})`);
                    }

                    try {
                        // Only fetch what we don't have cached
                        const fetchPromises: Promise<unknown>[] = [];
                        const fetchTypes: string[] = [];

                        if (needParcels) {
                            fetchPromises.push(getActiveParcels().catch(err => {
                                console.error(`[${context}] Failed to fetch parcels:`, err?.message || err);
                                return [];
                            }));
                            fetchTypes.push('parcels');
                        }
                        if (needPrefs) {
                            fetchPromises.push(getUserPreferences().catch(err => {
                                console.error(`[${context}] Failed to fetch preferences:`, err?.message || err);
                                return null;
                            }));
                            fetchTypes.push('prefs');
                        }
                        if (needHistory) {
                            fetchPromises.push(getParcelHistoryEntries().catch(err => {
                                console.error(`[${context}] Failed to fetch history:`, err?.message || err);
                                return [];
                            }));
                            fetchTypes.push('history');
                        }
                        if (needFrequent) {
                            fetchPromises.push(getFrequentlyUsedProducts(10, 365).catch(err => {
                                console.error(`[${context}] Failed to fetch frequent products:`, err?.message || err);
                                return [];
                            }));
                            fetchTypes.push('frequent');
                        }

                        // Execute only needed fetches in parallel
                        if (fetchPromises.length > 0) {
                            const fetchStart = Date.now();
                            const results = await Promise.all(fetchPromises);
                            console.log(`[${context}] DB fetch (${fetchTypes.join(', ')}) completed in ${Date.now() - fetchStart}ms`);

                            // Map results back and cache them
                            let resultIndex = 0;
                            if (needParcels) {
                                allParcels = results[resultIndex++] as ActiveParcel[];
                                setInCache(parcelsCacheKey, allParcels);
                            }
                            if (needPrefs) {
                                userPreferences = results[resultIndex++] as Awaited<ReturnType<typeof getUserPreferences>>;
                                setInCache(prefsCacheKey, userPreferences);
                            }
                            if (needHistory) {
                                parcelHistory = results[resultIndex++] as Awaited<ReturnType<typeof getParcelHistoryEntries>>;
                                setInCache(historyCacheKey, parcelHistory);
                            }
                            if (needFrequent) {
                                frequentProducts = results[resultIndex++] as string[];
                                setInCache(frequentCacheKey, frequentProducts);
                            }
                        }

                        // Use cached values for anything we didn't fetch
                        if (!needParcels && cachedParcels) allParcels = cachedParcels;
                        if (!needPrefs && cachedPrefs !== undefined) userPreferences = cachedPrefs;
                        if (!needHistory && cachedHistory) parcelHistory = cachedHistory;
                        if (!needFrequent && cachedFrequent) frequentProducts = cachedFrequent;

                    } catch (fetchError) {
                        console.error(`[${context}] Database fetch failed:`, fetchError);
                        // Use whatever we had cached
                        if (cachedParcels) allParcels = cachedParcels;
                        if (cachedPrefs !== undefined) userPreferences = cachedPrefs;
                        if (cachedHistory) parcelHistory = cachedHistory;
                        if (cachedFrequent) frequentProducts = cachedFrequent;
                    }

                    // TEST MODE: If parcelInfo is provided and database returned empty, use parcelInfo as fallback
                    if (allParcels.length === 0 && parcelInfo && parcelInfo.length > 0) {
                        console.log(`[${context}] TEST MODE: Using provided parcelInfo (${parcelInfo.length} parcels) as fallback`);
                        allParcels = parcelInfo.map(p => ({
                            id: p.id,
                            name: p.name,
                            crop: p.crop || null,
                            variety: p.variety || null,
                            area: p.area || 1.0,
                        }));
                    }

                    // Build parcel info from database for correction detection
                    const effectiveParcelInfo = allParcels.map(p => ({
                        id: p.id,
                        name: p.name,
                        variety: p.variety || undefined,
                        crop: p.crop || undefined
                    }));

                    // === PHASE -0.5: Self-Learning Product Confirmation ===
                    // Check if user is confirming a product suggestion from previous message
                    const confirmationPatterns = /^(ja|yes|jep|yep|klopt|correct|exact|precies|inderdaad)[\s!.,]*$/i;
                    const isConfirmation = confirmationPatterns.test(rawInput.trim());

                    if (isConfirmation && chatHistory && chatHistory.length > 0) {
                        // Find the last assistant message that contains a product suggestion
                        const lastAssistantMsg = [...chatHistory].reverse().find(m => m.role === 'assistant');

                        if (lastAssistantMsg) {
                            // Check if it was asking about a product suggestion
                            // Pattern: "Bedoel je "Product Name"?" or similar
                            const suggestionMatch = lastAssistantMsg.content.match(/[Bb]edoel je "([^"]+)"\?|[Bb]edoel je ([^?]+)\?/);

                            if (suggestionMatch) {
                                const suggestedProduct = suggestionMatch[1] || suggestionMatch[2];

                                // Find the original alias from the same message or previous user message
                                // Look for pattern like "score" → "Score 250 EC" or just extract from context
                                const previousUserMsg = [...chatHistory].reverse().find(m => m.role === 'user' && m !== chatHistory[chatHistory.length - 1]);
                                const potentialAlias = previousUserMsg?.content.match(/\b(\w+)\b/)?.[1]?.toLowerCase();

                                // Extract the alias more reliably - look for unquoted product terms in the previous input
                                let aliasToSave = '';
                                if (previousUserMsg) {
                                    const words = previousUserMsg.content.toLowerCase().split(/\s+/);
                                    // Find a word that looks like a short product name (not a crop/common word)
                                    const commonWords = new Set(['met', 'en', 'op', 'alle', 'de', 'het', 'gespoten', 'vandaag', 'gisteren', 'morgen']);
                                    for (const word of words) {
                                        if (!commonWords.has(word) &&
                                            !KNOWN_CROP_NAMES.has(word) &&
                                            word.length > 2 &&
                                            suggestedProduct.toLowerCase().includes(word)) {
                                            aliasToSave = word;
                                            break;
                                        }
                                    }
                                }

                                if (aliasToSave && suggestedProduct) {
                                    console.log(`[${context}] User confirmed product suggestion: "${aliasToSave}" → "${suggestedProduct}"`);

                                    const result = await handleProductConfirmation(aliasToSave, suggestedProduct);

                                    send({
                                        type: 'alias_learned',
                                        alias: aliasToSave,
                                        product: suggestedProduct,
                                        message: result.message
                                    });

                                    // Also send a friendly response
                                    send({
                                        type: 'answer',
                                        message: result.message,
                                        intent: 'CONFIRM' as IntentType
                                    });

                                    controller.close();
                                    return;
                                }
                            }
                        }
                    }

                    // === PHASE 0: Check for Corrections First (3.1.1) ===
                    const hasDraft = !!(previousDraft && (previousDraft.plots.length > 0 || previousDraft.products.length > 0));

                    // Build draft context for correction detection (with parcel info for name resolution)
                    // Now we ALWAYS have parcelInfo from the database fetch above
                    const hasParcelInfo = effectiveParcelInfo.length > 0;
                    const draftContext: DraftContext | null = hasDraft && previousDraft ? {
                        plots: previousDraft.plots,
                        parcelInfo: hasParcelInfo ? effectiveParcelInfo : undefined,
                        products: previousDraft.products.map(p => ({
                            product: p.product,
                            dosage: p.dosage,
                            unit: p.unit
                        })),
                        date: previousDraft.date
                    } : null;

                    // Check for correction patterns BEFORE intent classification
                    // This provides instant feedback for simple corrections without AI roundtrip
                    // Now we always have parcelInfo for name-to-ID matching
                    const correction = detectCorrection(rawInput, draftContext);

                    if (correction.type !== 'none' && correction.type !== 'confirm' && correction.confidence >= 0.7 && draftContext) {
                        console.log(`[${context}] Correction detected: ${correction.type} (confidence: ${correction.confidence})`);

                        // Special handling for undo and add_back_plots - the frontend handles the state restoration
                        if (correction.type === 'undo' || correction.type === 'add_back_plots') {
                            send({
                                type: 'correction',
                                correction,
                                message: correction.type === 'undo'
                                    ? 'Undo verzoek ontvangen - frontend handelt dit af'
                                    : 'Percelen terugzetten - frontend handelt dit af',
                                updatedDraft: draftContext  // Send current draft, frontend will restore from history
                            });
                            controller.close();
                            return;
                        }

                        // Apply the correction to the draft
                        const updatedDraft = applyCorrection(correction, draftContext);
                        const message = getCorrectionMessage(correction, draftContext, updatedDraft);

                        // Send correction response
                        send({
                            type: 'correction',
                            correction,
                            message,
                            updatedDraft
                        });

                        // Also send a complete message with the updated data for the frontend to process
                        send({
                            type: 'complete',
                            data: {
                                action: 'update' as const,
                                plots: updatedDraft.plots,
                                products: updatedDraft.products,
                                date: updatedDraft.date
                            },
                            merged: true
                        });

                        controller.close();
                        return;
                    }

                    // Handle 'confirm' correction type - let it proceed to intent classification
                    // so the confirmation flow can be properly triggered

                    // NOTE: Non-registration modes (product_info, workforce, research)
                    // are handled in PHASE 0 above and return early before reaching here.

                    // === PHASE 2: Intent Classification with Parameters ===
                    // Punt 7: Check if we should use the combined flow for likely spray registrations
                    const likelySpray = isLikelySprayRegistration(rawInput);

                    let intentResult: IntentWithParams;
                    let combinedSprayData: ClassifyAndParseOutput['sprayData'] | null = null;

                    if (likelySpray && !hasDraft) {
                        // Punt 7: Use combined flow for likely spray registrations
                        // This saves one AI call by combining intent + parsing
                        console.log(`[${context}] Using combined classify+parse flow (likely spray registration)`);

                        // Quick product term extraction for context
                        const { productTerms: quickProductTerms } = extractSearchTerms(rawInput);

                        // Build parcel context for the AI - CRITICAL for matching "alle conference" etc.
                        const parcelContext = allParcels.length > 0
                            ? JSON.stringify(allParcels.map(p => ({
                                id: p.id,
                                name: p.name,
                                crop: p.crop,
                                variety: p.variety
                            })))
                            : undefined;

                        console.log(`[${context}] Passing ${allParcels.length} parcels to combined flow`);

                        const combinedResult = await classifyAndParseSpray({
                            userInput: rawInput,
                            hasDraft,
                            plots: parcelContext,
                            productNames: quickProductTerms.length > 0 ? quickProductTerms : undefined,
                            regexHints: {
                                detectedProducts: quickProductTerms.length > 0 ? quickProductTerms : undefined,
                            }
                        });

                        intentResult = {
                            intent: combinedResult.intent,
                            confidence: combinedResult.confidence
                        };
                        combinedSprayData = combinedResult.sprayData || null;

                        console.log(`[${context}] Combined flow result: intent=${combinedResult.intent}, confidence=${combinedResult.confidence.toFixed(2)}, hasSprayData=${!!combinedSprayData}`);
                    } else {
                        // Standard intent classification (non-spray or has draft)
                        intentResult = await classifyIntentWithParams({
                            userInput: rawInput,
                            hasDraft,
                        });
                    }

                    // Extract query params if present
                    const { type: queryType, params: queryParams } = extractQueryParams(intentResult);

                    // Stream the detected intent to frontend immediately
                    send({
                        type: 'intent',
                        intent: intentResult.intent,
                        confidence: intentResult.confidence,
                        params: queryParams as Record<string, unknown> | undefined
                    });

                    // === PHASE 1: Branch based on intent ===

                    // Handle non-registration intents with quick responses
                    if (intentResult.intent === 'CONFIRM') {
                        send({
                            type: 'answer',
                            message: hasDraft
                                ? 'Begrepen! De registratie wordt opgeslagen.'
                                : 'Er is nog geen registratie om te bevestigen.',
                            intent: 'CONFIRM'
                        });
                        return;
                    }

                    if (intentResult.intent === 'CANCEL') {
                        send({
                            type: 'answer',
                            message: hasDraft
                                ? 'Oké, de huidige draft wordt geannuleerd.'
                                : 'Er is niets om te annuleren.',
                            intent: 'CANCEL'
                        });
                        return;
                    }

                    if (intentResult.intent === 'CLARIFY') {
                        send({
                            type: 'answer',
                            message: 'Ik help je graag met het registreren van bespuitingen. ' +
                                'Zeg bijvoorbeeld: "Gisteren 2L Captan op alle peren" of ' +
                                '"Welke middelen mag ik gebruiken tegen schurft?"',
                            intent: 'CLARIFY'
                        });
                        return;
                    }

                    if (intentResult.intent === 'NAVIGATE') {
                        send({
                            type: 'answer',
                            message: 'Navigatie wordt binnenkort ondersteund. ' +
                                'Gebruik voorlopig het menu om naar percelen of registraties te gaan.',
                            intent: 'NAVIGATE'
                        });
                        return;
                    }

                    // === Handle Query Intents ===
                    if (isQueryIntent(intentResult.intent)) {
                        // [FIX] Check if this looks like a spray registration BEFORE routing to agent
                        // This prevents "Alle appels met Merpan, maar Kanzi ook Score" from going to agent
                        if (isLikelySprayRegistration(rawInput)) {
                            console.log(`[${context}] Query intent detected but input looks like spray registration - continuing to registration flow`);
                            // Fall through to spray registration flow
                        } else {
                            // Check if this is a complex query that needs the agent
                            const isComplex = isComplexQuery(rawInput, queryParams as Record<string, unknown>);

                            if (isComplex) {
                                // Use the AgriBot Agent for complex queries (3.1.1: pass chatHistory)
                                await handleAgentQuery(send, rawInput, chatHistory as Array<{ role: 'user' | 'assistant'; content: string }>);
                                return;
                            }

                            // Simple queries use direct handlers
                            if (intentResult.intent === 'QUERY_PRODUCT') {
                                const params = intentResult.queryProductParams || {};
                                await handleQueryProduct(send, params, rawInput);
                                return;
                            }

                            if (intentResult.intent === 'QUERY_HISTORY') {
                                const params = intentResult.queryHistoryParams || {};
                                await handleQueryHistory(send, params);
                                return;
                            }

                            if (intentResult.intent === 'QUERY_REGULATION') {
                                const params = intentResult.queryRegulationParams;
                                await handleQueryRegulation(send, params, rawInput);
                                return;
                            }
                        }
                    }

                    // === Continue with spray registration flow for REGISTER_SPRAY and MODIFY_DRAFT ===

                    // === PHASE 2: Extract search terms (fast, sync) ===
                    const { productTerms, contextTerms } = extractSearchTerms(rawInput);
                    send({ type: 'searching', terms: [...productTerms, ...contextTerms].slice(0, 5) });

                    // Check if we have essential data (from early fetch in PHASE -1)
                    if (allParcels.length === 0) {
                        console.warn(`[${context}] No parcels found - continuing with empty list`);
                    }

                    // === PHASE 2+3 PARALLELIZED: Product Resolution + Parcel Resolution ===
                    // Run product fetch, alias resolution, parcel group detection, and RAG search in parallel

                    // Parcel group detection (fast, sync - uses already-fetched allParcels)
                    const { hasGroupKeyword, groupType, groupValue } = detectParcelGroups(rawInput);

                    // Start parallel tasks
                    const parallelStartTime = Date.now();

                    // Task 1: CTGB Product Fetch (async database call)
                    const productFetchPromise = (async () => {
                        if (productTerms.length === 0) return { products: [] as CtgbProduct[], failed: false };
                        try {
                            const products = await getCtgbProductsByNames(productTerms);
                            return { products, failed: false };
                        } catch (err: any) {
                            console.warn(`[${context}] Product fetch failed, retrying...`, err?.message || err);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            try {
                                const products = await getCtgbProductsByNames(productTerms);
                                return { products, failed: false };
                            } catch (retryErr: any) {
                                console.error(`[${context}] Product fetch failed after retry:`, retryErr?.message || retryErr);
                                return { products: [] as CtgbProduct[], failed: true };
                            }
                        }
                    })();

                    // Task 2: RAG Product Search (async)
                    const ragSearchPromise = getRelevantProducts(rawInput);

                    // Task 3: Parcel Group Resolution (sync, but wrapped in promise for Promise.all)
                    const parcelResolutionPromise = Promise.resolve().then(() => {
                        if (hasGroupKeyword && groupType && groupValue) {
                            console.log(`[${context}] Group keyword detected: type="${groupType}", value="${groupValue}"`);
                            const matchedParcels = resolveParcelGroup(groupType, groupValue, allParcels);
                            console.log(`[${context}] Matched parcels for "${groupValue}": ${matchedParcels.length} - ${matchedParcels.map(p => p.name).join(', ')}`);
                            if (matchedParcels.length > 0) {
                                return matchedParcels.map(p => p.id);
                            }
                            console.warn(`[${context}] WARNING: No parcels matched for group "${groupValue}"!`);
                        }
                        return null;
                    });

                    // Wait for all parallel tasks to complete
                    const [productFetchResult, relevantProducts, preResolvedParcelIds] = await Promise.all([
                        productFetchPromise,
                        ragSearchPromise,
                        parcelResolutionPromise
                    ]);

                    const matchedCtgbProducts = productFetchResult.products;
                    const productFetchFailed = productFetchResult.failed;
                    console.log(`[${context}] Parallel phase completed in ${Date.now() - parallelStartTime}ms`);
                    console.log(`[${context}] Fetched ${matchedCtgbProducts.length} products for terms: ${productTerms.join(', ')}`);

                    // === Product Alias Resolution (parallel per product, uses results from above) ===
                    const resolvedAliases: Record<string, string> = {};
                    // Punt 4: Track confidence scores for each product resolution
                    const productConfidenceScores: number[] = [];

                    // FIRST: Quick pass - static aliases (sync, O(1) lookup per term)
                    for (const term of productTerms) {
                        const normalizedTerm = term.toLowerCase().trim();
                        if (PRODUCT_ALIASES[normalizedTerm]) {
                            resolvedAliases[term] = PRODUCT_ALIASES[normalizedTerm];
                            productConfidenceScores.push(0.95); // Static aliases have 95% confidence
                            console.log(`[${context}] Static alias: "${term}" → "${PRODUCT_ALIASES[normalizedTerm]}"`);
                        }
                    }

                    // THEN: Resolve remaining terms in parallel (user preferences, history, fuzzy match)
                    const unresolvedProductTerms = productTerms.filter(term => !resolvedAliases[term]);
                    if (unresolvedProductTerms.length > 0) {
                        const resolvePromises = unresolvedProductTerms.map(async term => {
                            const resolved = await resolveProductAlias(term, matchedCtgbProducts, userPreferences, parcelHistory);
                            return { term, resolved };
                        });

                        const resolvedResults = await Promise.all(resolvePromises);
                        for (const { term, resolved } of resolvedResults) {
                            if (resolved.confidence > 0 && resolved.source !== 'direct') {
                                resolvedAliases[term] = resolved.resolvedName;
                            }
                            // Punt 4: Track confidence score (normalize from 0-100 to 0-1)
                            productConfidenceScores.push(resolved.confidence / 100);
                        }
                    }

                    // Punt 4: Calculate parcel resolution confidence
                    // - Exact group match (preResolvedParcelIds) = 1.0
                    // - No group keyword but we have parcels = 0.85 (AI will decide)
                    // - No parcels found = 0.5
                    const parcelResolutionConfidence = preResolvedParcelIds !== null && preResolvedParcelIds.length > 0
                        ? 1.0 // Exact match via group keyword
                        : allParcels.length > 0
                            ? 0.85 // Parcels available, AI will select
                            : 0.5; // No parcels, uncertain

                    // === PHASE 2.5: Self-Learning Product Suggestions ===
                    // Check for product terms that weren't resolved to known products
                    const unresolvedTerms = productTerms.filter(term => {
                        const normalizedTerm = term.toLowerCase().trim();
                        if (resolvedAliases[term]) return false;
                        if (PRODUCT_ALIASES[normalizedTerm]) return false;
                        if (userPreferences?.some(p => p.alias.toLowerCase() === normalizedTerm)) return false;
                        if (matchedCtgbProducts.some(p =>
                            p.naam.toLowerCase() === normalizedTerm ||
                            p.naam.toLowerCase().startsWith(normalizedTerm + ' ')
                        )) return false;
                        if (KNOWN_CROP_NAMES.has(normalizedTerm)) return false;
                        return true;
                    });

                    // Find suggestions for unresolved terms
                    if (unresolvedTerms.length > 0) {
                        console.log(`[${context}] Unresolved product terms: ${unresolvedTerms.join(', ')}`);

                        const suggestions = await findProductSuggestions(unresolvedTerms, userPreferences, resolvedAliases);

                        if (suggestions.length > 0) {
                            const firstSuggestion = suggestions[0];
                            if (firstSuggestion.suggestedProduct) {
                                console.log(`[${context}] Suggesting: "${firstSuggestion.originalTerm}" → "${firstSuggestion.suggestedProduct.naam}"`);

                                send({
                                    type: 'product_suggestion',
                                    originalInput: firstSuggestion.originalTerm,
                                    suggestedProduct: firstSuggestion.suggestedProduct.naam,
                                    message: `Bedoel je "${firstSuggestion.suggestedProduct.naam}"? (Zeg "Ja" om dit te onthouden)`
                                });

                                resolvedAliases[firstSuggestion.originalTerm] = firstSuggestion.suggestedProduct.naam;
                            }
                        }
                    }

                    // === Merge relevant products with matched CTGB products ===
                    const relevantProductNames = new Set(relevantProducts.map(p => p.naam.toLowerCase()));
                    const additionalProducts = matchedCtgbProducts.filter(p =>
                        frequentProducts.includes(p.naam) && !relevantProductNames.has(p.naam.toLowerCase())
                    ).slice(0, 3);

                    const allRelevantProducts = [...relevantProducts, ...additionalProducts];

                    send({
                        type: 'context_ready',
                        productCount: allRelevantProducts.length,
                        parcelCount: allParcels.length,
                        resolvedAliases: Object.keys(resolvedAliases).length > 0 ? resolvedAliases : undefined
                    });

                    // === PHASE 5: Build enriched context ===
                    const productContext = buildProductContext(allRelevantProducts);
                    const { parcelList, availableGroups } = buildParcelContextWithGroups(allParcels);

                    // Build alias hint for AI
                    const aliasHints = Object.entries(resolvedAliases)
                        .map(([alias, product]) => `"${alias}" → "${product}"`)
                        .join('\n');

                    // Build parcel name to ID mapping for the AI
                    const parcelNameToId = allParcels.reduce((acc, p) => {
                        acc[p.name.toLowerCase()] = p.id;
                        acc[p.variety?.toLowerCase() || ''] = p.id;
                        return acc;
                    }, {} as Record<string, string>);

                    // === PHASE 5.5: Check for Variation Patterns (V2 Grouped Registrations) ===
                    const { hasVariation, pattern: variationPattern } = detectVariationPattern(rawInput);

                    // Punt 7: Check if we can use combined flow's pre-computed spray data
                    // This only works for simple (non-grouped) registrations where we don't need
                    // the full parcel context for variation handling
                    if (combinedSprayData && !combinedSprayData.isGrouped && !hasVariation && combinedSprayData.products && combinedSprayData.products.length > 0) {
                        console.log(`[${context}] Using pre-computed spray data from combined flow (simple registration)`);
                        send({ type: 'extracting' });

                        try {
                            // Map product names to resolve aliases with full context
                            const resolvedProducts = (combinedSprayData.products || []).map(p => {
                                const originalLower = p.product.toLowerCase();
                                return {
                                    ...p,
                                    product: resolvedAliases[originalLower] || PRODUCT_ALIASES[originalLower] || p.product
                                };
                            });

                            // Resolve plot names to IDs using the parcel list
                            let resolvedPlotIds = combinedSprayData.plots || [];
                            if (resolvedPlotIds.length === 0 && preResolvedParcelIds) {
                                // Use pre-resolved parcels if no specific plots in combined data
                                resolvedPlotIds = preResolvedParcelIds;
                            } else if (resolvedPlotIds.length > 0) {
                                // Validate that plot IDs exist in our parcel list
                                const validIds = resolvedPlotIds.filter(id =>
                                    allParcels.some(p => p.id === id || p.name.toLowerCase() === id.toLowerCase())
                                );
                                if (validIds.length < resolvedPlotIds.length) {
                                    console.log(`[${context}] Some plot IDs from combined flow not found, using pre-resolved parcels`);
                                    resolvedPlotIds = preResolvedParcelIds || validIds;
                                }
                            }

                            if (resolvedPlotIds.length > 0 && resolvedProducts.length > 0) {
                                const parsedDate = combinedSprayData.date
                                    ? new Date(combinedSprayData.date)
                                    : new Date();

                                // Calculate confidence breakdown
                                const confidenceBreakdown = calculateConfidenceBreakdown(
                                    intentResult.confidence,
                                    productConfidenceScores,
                                    parcelResolutionConfidence
                                );

                                // Convert to SprayRegistrationGroup (single unit)
                                const group: SprayRegistrationGroup = {
                                    groupId: `group-${Date.now()}`,
                                    date: parsedDate,
                                    rawInput,
                                    units: [{
                                        id: `unit-${Date.now()}`,
                                        plots: resolvedPlotIds,
                                        products: resolvedProducts.map(p => ({
                                            product: p.product,
                                            dosage: p.dosage,
                                            unit: p.unit,
                                            targetReason: p.targetReason
                                        })),
                                        status: 'pending' as const
                                    }],
                                    confidence: confidenceBreakdown
                                };

                                const relevantParcels = allParcels
                                    .filter(p => resolvedPlotIds.includes(p.id))
                                    .map(p => ({ id: p.id, name: p.name, area: p.area }));

                                const reply = `Registratie klaargezet voor ${resolvedPlotIds.length} percelen. Controleer rechts of alles klopt.`;

                                console.log(`[${context}] Sending grouped_complete from combined flow: ${resolvedPlotIds.length} plots, ${resolvedProducts.length} products`);

                                send({
                                    type: 'grouped_complete',
                                    group,
                                    reply,
                                    parcels: relevantParcels
                                });
                                return; // Exit - combined flow completed
                            }
                        } catch (combinedError: unknown) {
                            const errorMsg = combinedError instanceof Error ? combinedError.message : 'Unknown error';
                            console.error(`[${context}] Combined flow data processing failed:`, errorMsg);
                            // Fall through to standard flow
                        }
                    }

                    if (hasVariation && !hasDraft) {
                        console.log(`[${context}] Variation pattern detected: "${variationPattern}" - using V2 grouped parsing`);
                        console.log(`[${context}] V2 input: parcels=${allParcels.length}, products=${allRelevantProducts.length}`);
                        send({ type: 'extracting' });

                        try {
                            // Call V2 AI parsing with grouped support
                            const plotsJson = JSON.stringify(allParcels.map(p => ({
                                id: p.id,
                                name: p.name,
                                crop: p.crop,
                                variety: p.variety,
                            })));

                            const productNames = allRelevantProducts.map(p => p.naam);
                            console.log(`[${context}] V2 calling AI with ${productNames.length} products: ${productNames.slice(0, 5).join(', ')}...`);

                            // Punt 5: Generate regex hints for AI context
                            const regexHints = generateRegexHints(
                                rawInput,
                                { hasGroupKeyword, groupType, groupValue },
                                { hasVariation, pattern: variationPattern },
                                productTerms
                            );
                            if (Object.keys(regexHints).length > 0) {
                                console.log(`[${context}] Regex hints generated:`, JSON.stringify(regexHints));
                            }

                            const v2Result = await parseSprayApplicationV2({
                                naturalLanguageInput: rawInput,
                                plots: plotsJson,
                                productNames,
                                userPreferences: (userPreferences || []).map(pref => ({
                                    alias: pref.alias,
                                    preferred: pref.preferred
                                })),
                                regexHints, // Punt 5: Pass hints to AI
                            });

                            console.log(`[${context}] V2 result: ${v2Result.registrations.length} registrations`,
                                v2Result.registrations.map(r => ({ plots: r.plots.length, products: r.products.length, label: r.label })));

                            if (v2Result.registrations.length > 0) {
                                // Validate that registrations have actual content
                                const validRegistrations = v2Result.registrations.filter(r =>
                                    r.plots.length > 0 && r.products.length > 0
                                );

                                if (validRegistrations.length === 0) {
                                    console.log(`[${context}] V2 registrations are empty (no plots/products), falling back`);
                                    // Fall through to standard flow
                                } else {
                                // Apply resolved aliases to products
                                for (const reg of v2Result.registrations) {
                                    for (const product of reg.products) {
                                        const originalLower = product.product.toLowerCase();
                                        if (resolvedAliases[originalLower]) {
                                            product.product = resolvedAliases[originalLower];
                                        } else if (PRODUCT_ALIASES[originalLower]) {
                                            product.product = PRODUCT_ALIASES[originalLower];
                                        }
                                    }
                                }

                                // Parse date
                                const parsedDate = v2Result.date
                                    ? new Date(v2Result.date)
                                    : new Date();

                                // Punt 5: Validate AI output against regex hints and adjust confidence
                                const regexValidation = validateAIAgainstRegex(v2Result, regexHints, allParcels);
                                if (regexValidation.confidenceAdjustment !== 0) {
                                    console.log(`[${context}] Regex validation: ${regexValidation.reason}, adjustment=${regexValidation.confidenceAdjustment > 0 ? '+' : ''}${regexValidation.confidenceAdjustment.toFixed(2)}`);
                                }

                                // Punt 4: Calculate confidence breakdown (with Punt 5 adjustment)
                                const confidenceBreakdown = calculateConfidenceBreakdown(
                                    intentResult.confidence,
                                    productConfidenceScores,
                                    parcelResolutionConfidence
                                );
                                // Apply regex validation adjustment to overall confidence
                                confidenceBreakdown.overall = Math.max(0, Math.min(1, confidenceBreakdown.overall + regexValidation.confidenceAdjustment));
                                console.log(`[${context}] Confidence breakdown: intent=${intentResult.confidence.toFixed(2)}, products=${productConfidenceScores.join(',')}, parcels=${parcelResolutionConfidence.toFixed(2)}, overall=${confidenceBreakdown.overall.toFixed(2)}${regexValidation.confidenceAdjustment !== 0 ? ` (regex: ${regexValidation.reason})` : ''}`);

                                // Bug 3 Fix: Create a set of valid parcel IDs to filter out phantom UUIDs
                                // Conference fix: When group keyword detected (e.g., "alle conference"),
                                // ONLY allow parcels from the pre-resolved set to prevent variety mixing
                                let validParcelIds: Set<string>;
                                if (hasGroupKeyword && preResolvedParcelIds && preResolvedParcelIds.length > 0) {
                                    validParcelIds = new Set(preResolvedParcelIds);
                                    console.log(`[${context}] Enforcing pre-resolved parcels for "${groupValue}": ${validParcelIds.size} allowed`);
                                } else {
                                    validParcelIds = new Set(allParcels.map(p => p.id));
                                }

                                // Convert to SprayRegistrationGroup (with phantom UUID filtering)
                                const group = convertToRegistrationGroup(
                                    v2Result.registrations,
                                    parsedDate,
                                    rawInput,
                                    confidenceBreakdown,
                                    validParcelIds
                                );

                                // Bug 3 Fix: Check if any units remain after filtering
                                if (group.units.length === 0) {
                                    console.error(`[${context}] All registrations filtered out - no valid plot IDs found`);
                                    send({ type: 'error', message: 'Geen geldige percelen gevonden. De AI heeft mogelijk onjuiste perceel-IDs gegenereerd.' });
                                    return;
                                }

                                // Generate reply for grouped registrations
                                const unitCount = group.units.length;
                                const totalPlots = group.units.reduce((sum, u) => sum + u.plots.length, 0);
                                const reply = unitCount > 1
                                    ? `Ik heb ${unitCount} deelregistraties klaargezet met in totaal ${totalPlots} percelen. Bekijk het overzicht rechts en bevestig per onderdeel.`
                                    : `Registratie klaargezet voor ${totalPlots} percelen. Controleer rechts of alles klopt.`;

                                // Extract only the plot IDs used in the group
                                const usedPlotIds = new Set(group.units.flatMap(u => u.plots));
                                const relevantParcels = allParcels
                                    .filter(p => usedPlotIds.has(p.id))
                                    .map(p => ({ id: p.id, name: p.name, area: p.area }));

                                console.log(`[${context}] Sending grouped_complete with ${relevantParcels.length} parcels for ${usedPlotIds.size} plot IDs`);

                                send({
                                    type: 'grouped_complete',
                                    group,
                                    reply,
                                    parcels: relevantParcels
                                });
                                return; // Exit - V2 flow complete
                                }
                            }
                        } catch (v2Error: any) {
                            console.error(`[${context}] V2 parsing failed:`, v2Error?.message || v2Error);
                            console.log(`[${context}] Falling back to standard PHASE 6 flow`);
                            // Fall through to standard PHASE 6 flow
                        }
                    }

                    // Log if we fell through from V2 (variation detected but didn't complete)
                    let alreadySentExtracting = false;
                    if (hasVariation && !hasDraft) {
                        console.log(`[${context}] V2 flow did not complete, continuing with standard flow`);
                        alreadySentExtracting = true; // We already sent 'extracting' in V2 block
                    }

                    // === PHASE 6: AI Intent Extraction (streamed) with Multi-turn Support ===
                    if (!alreadySentExtracting) {
                        send({ type: 'extracting' });
                    }

                    // Note: hasDraft is already defined in PHASE 0

                    const systemPrompt = `Je bent een assistent voor het registreren van gewasbeschermingsmiddelen.
Extraheer de intentie uit de gebruikersinvoer en match met de beschikbare percelen en producten.

=== MULTI-TURN CONVERSATIE REGELS ===
${hasDraft ? `
**ER IS EEN ACTIEVE DRAFT** - Bepaal eerst of de gebruiker:
1. Een CORRECTIE/VERWIJDERING maakt (action: "remove")
   Triggers: "niet", "toch niet", "verwijder", "haal weg", "zonder", "behalve", "skip", "X niet", "X en Y niet"

2. Een TOEVOEGING maakt (action: "add")
   Triggers: "ook", "en ook", "daarnaast", "voeg toe", "extra", "plus"

3. Een UPDATE/WIJZIGING maakt (action: "update")
   Triggers: "maak er X van", "verander naar", "moet X zijn", "wijzig", "pas aan"

4. Een DATUM-SPLIT maakt (action: "split") ⭐ NIEUW
   Triggers (expliciet): "X trouwens gisteren", "de rest vandaag", "X gisteren, Y vandaag", "eigenlijk gisteren"
   Triggers (impliciet): "X heb ik gisteren gespoten", "X was gisteren", "X gisteren gedaan", "alleen X gisteren", "oh ja X was gisteren", "X gisteren, de rest vandaag"

   BELANGRIJK: Als de gebruiker zegt dat EEN SPECIFIEK perceel (uit de draft) op een ANDERE datum is gespoten,
   is dit ALTIJD een split actie! De rest van de draft blijft op de oorspronkelijke datum.

   Dit splitst de registratie in TWEE groepen met verschillende datums.
   Zet de afgesplitste percelen in splitParcels en hun datum in splitDate.
   Zet de datum voor de overige percelen in remainingDate.

   Voorbeeld 1: "Plantsoen trouwens gisteren gespoten, de rest vandaag"
   → action: "split"
   → splitParcels: [IDs van Plantsoen-percelen]
   → splitDate: "gisteren"
   → remainingDate: "vandaag"

   Voorbeeld 2: "Stadhoek heb ik gisteren gespoten"
   → action: "split"
   → splitParcels: [IDs van Stadhoek-percelen]
   → splitDate: "gisteren"
   → remainingDate: "vandaag" (default: behoud oorspronkelijke datum of vandaag)

   Voorbeeld 3: "Plantsoen heb ik gisteren gespoten de rest vandaag"
   → action: "split"
   → splitParcels: [IDs van Plantsoen-percelen]
   → splitDate: "gisteren"
   → remainingDate: "vandaag"

   Voorbeeld 4: "Oh ja Stadhoek was gisteren" of "Alleen Stadhoek was gisteren"
   → action: "split"
   → splitParcels: [IDs van Stadhoek-percelen]
   → splitDate: "gisteren"
   → remainingDate: "vandaag"

   Voorbeeld 5: "Stadhoek gisteren, de rest vandaag"
   → action: "split"
   → splitParcels: [IDs van Stadhoek-percelen]
   → splitDate: "gisteren"
   → remainingDate: "vandaag"

   → plots: [] (niet nodig, we splitsen de bestaande draft)

5. Een COMPLEET NIEUWE registratie start (action: "new")
   Triggers: Volledige nieuwe bespuiting met percelen EN middelen

HUIDIGE DRAFT:
- Percelen (${previousDraft!.plots.length}): ${previousDraft!.plots.length > 0
    ? previousDraft!.plots.map(id => {
        const info = parcelInfo?.find(p => p.id === id);
        return info ? `${info.name} (ID: ${id})` : id;
    }).join(', ')
    : 'geen'}
- Middelen: ${previousDraft!.products.length > 0 ? previousDraft!.products.map(p => `${p.product} (${p.dosage} ${p.unit})`).join(', ') : 'geen'}
- Datum: ${previousDraft!.date || 'niet ingesteld'}

⚠️ De draft bevat ALLEEN bovenstaande percelen. Er zijn GEEN andere percelen in de draft!

=== ⚠️ KRITIEK: REFINEMENT PROTOCOL ===
**DE GOUDEN REGEL BIJ VERFIJNING:**
Bij ELKE actie behalve "new", werk je ALLEEN met de huidige draft percelen/producten!

❌ VERBODEN bij remove/add/update:
- NIET alle percelen uit de database halen
- NIET de selectie "resetten" naar alle percelen
- NIET percelen toevoegen die niet expliciet gevraagd worden

✅ CORRECT GEDRAG:
- Bij "remove": Neem HUIDIGE DRAFT percelen en verwijder alleen de genoemde items
- Bij "add": Neem HUIDIGE DRAFT percelen en voeg ALLEEN genoemde items toe
- Bij "update": Neem HUIDIGE DRAFT percelen en wijzig alleen de genoemde waarden

VOORBEELDEN:
• Draft heeft: [Peer-A, Peer-B, Peer-C] (3 peren, GEEN appels)
• User: "Peer-A niet" of "Busje niet" (Busje = Peer-A)
• ❌ FOUT: Return [Peer-B, Peer-C, Appel-X, Appel-Y] ← NOOIT appels toevoegen!
• ✅ GOED: Return [Peer-B, Peer-C] ← Alleen de genoemde verwijderen

• Draft heeft: [Elstar, Jonagold] (2 appels)
• User: "Voeg de peren toe"
• ✅ GOED: Return [Elstar, Jonagold, Peer-A, Peer-B] ← Draft + gevraagde toevoegingen

Bij VERWIJDERING: Zet de te verwijderen perceel IDs in 'plotsToRemove' en product namen in 'productsToRemove'
Bij TOEVOEGING: Zet alleen de NIEUWE items in 'plots' en 'products' (worden later gemerged)
Bij UPDATE: Zet de gewijzigde waarden in de relevante velden
` : 'Geen actieve draft - dit is een NIEUWE registratie (action: "new")'}

${chatContext}
=== PERCEEL GROEPEN ===
Herken groepsaanduidingen en selecteer ALLE bijbehorende percelen:
${availableGroups.map(g => `   - ${g}`).join('\n')}

=== PRODUCT ALIASSEN ===
${aliasHints || '(geen specifieke aliassen gedetecteerd)'}

=== BESCHIKBARE PRODUCTEN ===
${productContext}

=== BESCHIKBARE PERCELEN (met IDs) ===
${hasDraft ? '⚠️ ALLEEN gebruiken bij action:"add" of action:"new" - NIET bij "remove" of "update"!' : ''}
${JSON.stringify(parcelList)}

Perceel naam naar ID mapping (voor name→ID lookup): ${JSON.stringify(parcelNameToId)}

${preResolvedParcelIds ? `
BELANGRIJK: De gebruiker zei "${groupValue}" - dit zijn de perceel IDs:
${JSON.stringify(preResolvedParcelIds)}
` : ''}

=== OUTPUT REGELS ===
1. Gebruik ALLEEN productnamen uit BESCHIKBARE PRODUCTEN
2. Gebruik de PERCEEL IDs (niet namen) in de output
3. Converteer doseringen naar standaard units (L of kg per hectare)
4. Als geen datum genoemd, laat het veld leeg
5. Als de input onduidelijk is voor een nieuwe registratie maar WEL een correctie kan zijn op de draft, behandel het als correctie
${hasDraft ? `6. ⚠️ BIJ REMOVE: Zet ALLEEN de te verwijderen IDs in plotsToRemove, NIET alle overige percelen in plots!
7. ⚠️ BIJ REMOVE: De result.plots worden automatisch berekend uit draft minus plotsToRemove
8. ⚠️ NOOIT percelen uit de database toevoegen aan een bestaande draft tenzij expliciet gevraagd!` : ''}`;

                    const { stream: aiStream } = ai.generateStream({
                        prompt: `Gebruikersinvoer: "${rawInput}"

${hasDraft ? 'Bepaal of dit een correctie/toevoeging/update is op de huidige draft, of een nieuwe registratie.' : 'Dit is een nieuwe registratie.'}

Extraheer de intentie en retourneer als JSON met het juiste "action" type.
${preResolvedParcelIds ? `Gebruik de pre-resolved perceel IDs voor "${groupValue}".` : ''}
${Object.keys(resolvedAliases).length > 0 ? `Gebruik de product aliassen: ${aliasHints}` : ''}
${hasDraft && isDateSplitPattern(rawInput) ? `⚠️ DATE-SPLIT PATROON GEDETECTEERD: De input bevat een datum-split patroon. Gebruik action="split" met splitParcels en splitDate.` : ''}`,
                        system: systemPrompt,
                        output: { schema: IntentSchema },
                    });

                    let lastOutput: z.infer<typeof IntentSchema> | null = null;

                    for await (const chunk of aiStream) {
                        if (chunk.output && typeof chunk.output === 'object') {
                            const output = chunk.output as z.infer<typeof IntentSchema>;
                            if (output.action && output.plots && output.products) {
                                lastOutput = output;
                                send({ type: 'partial', data: output });
                            }
                        }
                    }

                    // Apply pre-resolved parcels - ALWAYS use them for group keywords!
                    // This ensures "alle peren" only selects pear parcels, even if AI returns all
                    if (lastOutput && preResolvedParcelIds && lastOutput.action === 'new' && hasGroupKeyword) {
                        console.log(`[${context}] Enforcing pre-resolved parcels for "${groupValue}": ${preResolvedParcelIds.length} parcels`);
                        lastOutput.plots = preResolvedParcelIds;
                    } else if (lastOutput && preResolvedParcelIds && lastOutput.plots.length === 0 && lastOutput.action === 'new') {
                        // Fallback: if AI returned no plots, use pre-resolved
                        console.log(`[${context}] Using pre-resolved parcels as fallback: ${preResolvedParcelIds.length} parcels`);
                        lastOutput.plots = preResolvedParcelIds;
                    }

                    // Apply resolved product aliases if AI used the original names
                    if (lastOutput && lastOutput.products) {
                        for (const product of lastOutput.products) {
                            const originalLower = product.product.toLowerCase();
                            // Check if the product name is an alias that should be resolved
                            if (resolvedAliases[originalLower]) {
                                product.product = resolvedAliases[originalLower];
                            } else if (PRODUCT_ALIASES[originalLower]) {
                                product.product = PRODUCT_ALIASES[originalLower];
                            }
                        }
                    }

                    // === PHASE 6.3: Enforce Expected Products ===
                    // If user typed known product aliases, GUARANTEE they appear in output
                    // This is critical when database is unavailable and AI might miss products
                    if (lastOutput && Object.keys(resolvedAliases).length > 0) {
                        console.log(`[${context}] Enforcing expected products. resolvedAliases:`, resolvedAliases);
                        console.log(`[${context}] AI returned products:`, lastOutput.products.map(p => p.product));

                        for (const [inputTerm, expectedProduct] of Object.entries(resolvedAliases)) {
                            const expectedLower = expectedProduct.toLowerCase();
                            const inputTermLower = inputTerm.toLowerCase();

                            // Check if expected product is already in AI output (flexible matching)
                            const isInOutput = lastOutput.products.some(p => {
                                const pLower = p.product.toLowerCase();
                                const pFirstWord = pLower.split(/[\s®™]+/)[0];
                                const expectedFirstWord = expectedLower.split(/[\s®™]+/)[0];

                                return (
                                    pLower === expectedLower ||
                                    pLower.includes(expectedLower) ||
                                    expectedLower.includes(pLower) ||
                                    pFirstWord === expectedFirstWord ||
                                    pFirstWord === inputTermLower ||
                                    pLower.includes(inputTermLower)
                                );
                            });

                            if (!isInOutput) {
                                console.log(`[${context}] MISSING expected product "${expectedProduct}" for input "${inputTerm}" - ADDING IT`);

                                // Determine correct unit for this product
                                const correctUnit = getCorrectUnitForProduct(expectedProduct);

                                lastOutput.products.push({
                                    product: expectedProduct,
                                    dosage: 0, // Will prompt user or use default
                                    unit: correctUnit,
                                });
                            } else {
                                console.log(`[${context}] Expected product "${expectedProduct}" found in AI output`);
                            }
                        }

                        console.log(`[${context}] Final products after enforcement:`, lastOutput.products.map(p => p.product));
                    }

                    if (lastOutput) {
                        // === PHASE 6.4: Filter Invalid Products (crop/variety names + AI hallucinations) ===
                        // Pass previousDraft so products from existing draft aren't filtered as hallucinations
                        const filteredOutput = filterInvalidProducts(lastOutput, rawInput, productTerms, resolvedAliases, previousDraft);

                        // === PHASE 6.5: Self-Correction Loop for Dosages ===
                        // Validate AI output and fix common errors (e.g., "3 kg" -> 30)
                        const correctedOutput = validateAndFixDosages(filteredOutput, rawInput, previousDraft || null);

                        // === PHASE 6.6: Correct Units Based on Product Type ===
                        // Ensure powders use kg and liquids use L
                        for (const product of correctedOutput.products) {
                            const correctUnit = getCorrectUnitForProduct(product.product);
                            if (product.unit.toLowerCase() !== correctUnit.toLowerCase()) {
                                console.log(`[${context}] Correcting unit for "${product.product}": ${product.unit} → ${correctUnit}`);
                                product.unit = correctUnit;
                            }
                        }

                        // === PHASE 6.7: Force SPLIT action when date-split pattern detected ===
                        // If the AI didn't detect split but we have a clear pattern, force it
                        const patternDetected = isDateSplitPattern(rawInput);
                        console.log(`[${context}] Force-split check: previousDraft=${!!previousDraft}, action=${correctedOutput.action}, patternDetected=${patternDetected}`);
                        if (previousDraft && correctedOutput.action !== 'split' && patternDetected) {
                            console.log(`[${context}] Force-split: Pattern detected but AI returned action="${correctedOutput.action}"`);

                            // Extract parcel name from input using various patterns
                            const forceSplitPatterns = [
                                // "Oh ja X was gisteren"
                                /oh\s+ja\s+(\w+)\s+(?:was|heb)/i,
                                // "Alleen X was gisteren"
                                /alleen\s+(\w+)\s+(?:was|heb|gisteren)/i,
                                // "X gisteren, de rest vandaag"
                                /^(\w+)\s+gisteren/i,
                                // "X was gisteren"
                                /^(\w+)\s+was\s+gisteren/i,
                                // "X trouwens gisteren"
                                /^(\w+)\s+trouwens\s+gisteren/i,
                                // "X heb ik gisteren"
                                /^(\w+)\s+heb\s+ik\s+gisteren/i,
                            ];

                            let extractedParcelName: string | null = null;
                            for (const pattern of forceSplitPatterns) {
                                const match = rawInput.match(pattern);
                                if (match && match[1]) {
                                    extractedParcelName = match[1].toLowerCase();
                                    console.log(`[${context}] Force-split: Extracted parcel name "${extractedParcelName}" using pattern ${pattern}`);
                                    break;
                                }
                            }

                            console.log(`[${context}] Force-split: extractedParcelName=${extractedParcelName}, draftPlots=${previousDraft.plots.length}, allParcels=${allParcels.length}, parcelInfo=${parcelInfo?.length || 0}`);
                            if (extractedParcelName) {
                                // Find matching parcel IDs from the draft
                                // Check both allParcels (from DB) and parcelInfo (from request) for name matching
                                const matchingParcelIds = previousDraft.plots.filter(plotId => {
                                    // Try allParcels first
                                    const parcel = allParcels.find(p => p.id === plotId);
                                    if (parcel?.name?.toLowerCase().includes(extractedParcelName!)) {
                                        return true;
                                    }
                                    // Fall back to parcelInfo from request
                                    const parcelFromRequest = parcelInfo?.find(p => p.id === plotId);
                                    if (parcelFromRequest?.name?.toLowerCase().includes(extractedParcelName!)) {
                                        return true;
                                    }
                                    return false;
                                });

                                if (matchingParcelIds.length > 0) {
                                    console.log(`[${context}] Force-split: Found ${matchingParcelIds.length} parcels matching "${extractedParcelName}": ${matchingParcelIds.join(', ')}`);
                                    correctedOutput.action = 'split';
                                    correctedOutput.splitParcels = matchingParcelIds;
                                    correctedOutput.splitDate = 'gisteren';
                                    correctedOutput.remainingDate = 'vandaag';

                                    // Inherit products from draft if not present
                                    if (correctedOutput.products.length === 0 && previousDraft.products.length > 0) {
                                        console.log(`[${context}] Force-split: Inheriting ${previousDraft.products.length} products from draft`);
                                        correctedOutput.products = [...previousDraft.products];
                                    }

                                    // Set plots to draft plots for split processing
                                    if (correctedOutput.plots.length === 0) {
                                        correctedOutput.plots = [...previousDraft.plots];
                                    }

                                    console.log(`[${context}] Force-split COMPLETE: action=${correctedOutput.action}, splitParcels=${correctedOutput.splitParcels?.length}, plots=${correctedOutput.plots.length}, products=${correctedOutput.products.length}`);
                                } else {
                                    console.log(`[${context}] Force-split: No parcels found matching "${extractedParcelName}"`);
                                }
                            }
                        }

                        // === PHASE 7: Merge with previous draft if applicable ===
                        // SPECIAL CASE: If adding new products to a SUBSET of existing plots,
                        // create a grouped registration instead of merging
                        const isAddingNewProducts = previousDraft &&
                            correctedOutput.action === 'add' &&
                            correctedOutput.products.length > 0 &&
                            correctedOutput.plots.length > 0;

                        const newProductNames = correctedOutput.products.map(p => p.product.toLowerCase());
                        const existingProductNames = previousDraft?.products.map(p => p.product.toLowerCase()) || [];
                        const hasNewProducts = newProductNames.some(n => !existingProductNames.includes(n));

                        // Bug 3 Fix: Create a set of valid parcel IDs for filtering
                        const validParcelIdSet = new Set(allParcels.map(p => p.id));

                        // CRITICAL: Resolve parcel NAMES to IDs before filtering
                        // The AI might return names like "Stadhoek" instead of UUIDs
                        const resolvedPlotIds = correctedOutput.plots.map(plotIdOrName => {
                            // If it's already a valid ID, use it
                            if (validParcelIdSet.has(plotIdOrName)) {
                                return plotIdOrName;
                            }
                            // Otherwise, try to find by name (exact, partial, or contains)
                            const plotLower = plotIdOrName.toLowerCase();
                            const parcel = allParcels.find(p => {
                                const nameLower = p.name.toLowerCase();
                                return nameLower === plotLower ||
                                       nameLower.includes(plotLower) ||
                                       plotLower.includes(nameLower.split(' ')[0]); // Match first word
                            });
                            if (parcel) {
                                console.log(`[${context}] Resolved parcel name "${plotIdOrName}" to ID "${parcel.id}" (${parcel.name})`);
                            }
                            return parcel?.id || plotIdOrName;
                        });

                        // Now filter to only valid IDs
                        const specifiedPlotIds = resolvedPlotIds.filter(id => validParcelIdSet.has(id));
                        const existingPlotIds = (previousDraft?.plots || []).filter(id => validParcelIdSet.has(id));

                        // Log if any IDs couldn't be resolved
                        if (specifiedPlotIds.length < correctedOutput.plots.length) {
                            const unresolvedPlots = correctedOutput.plots.filter((_, i) => !validParcelIdSet.has(resolvedPlotIds[i]));
                            console.warn(`[${context}] Could not resolve ${unresolvedPlots.length} plot names: ${unresolvedPlots.join(', ')}`);
                        }
                        if (previousDraft && existingPlotIds.length < previousDraft.plots.length) {
                            console.warn(`[${context}] Filtered ${previousDraft.plots.length - existingPlotIds.length} phantom existing plot IDs`);
                        }

                        const isSubset = specifiedPlotIds.length > 0 &&
                            specifiedPlotIds.length < existingPlotIds.length &&
                            specifiedPlotIds.every(p => existingPlotIds.includes(p));

                        if (isAddingNewProducts && hasNewProducts && isSubset) {
                            // Create grouped registration with two units
                            console.log(`[${context}] Creating grouped registration: new products for subset of plots`);

                            const newProducts = correctedOutput.products.filter(
                                p => !existingProductNames.includes(p.product.toLowerCase())
                            );

                            // The subset unit gets ALL products (existing + new)
                            const allProductsForSubset = [...previousDraft!.products, ...newProducts];

                            // Get parcel info for the subset
                            const subsetParcelInfo = specifiedPlotIds.map(id => {
                                const parcel = allParcels.find(p => p.id === id);
                                return parcel || { id, name: id, area: null };
                            });
                            const subsetParcelNames = subsetParcelInfo.map(p => p.name).join(', ');

                            // Get the first parcel name for the label (cleaner)
                            const firstSubsetParcel = subsetParcelInfo[0];
                            const subsetLabel = firstSubsetParcel?.name || subsetParcelNames;

                            // Use previousDraft date if available, otherwise today
                            // Don't trust correctedOutput.date for product additions - it might be hallucinated
                            const groupDate = previousDraft!.date
                                ? new Date(previousDraft!.date)
                                : new Date();

                            // Count remaining plots for better label
                            const remainingPlots = existingPlotIds.filter(id => !specifiedPlotIds.includes(id));
                            const remainingCount = remainingPlots.length;
                            const remainingLabel = remainingCount <= 3
                                ? remainingPlots.map(id => {
                                    const p = allParcels.find(parcel => parcel.id === id);
                                    return p?.name || id;
                                }).join(', ')
                                : `Overige ${remainingCount} percelen`;

                            const group: SprayRegistrationGroup = {
                                groupId: `group-${Date.now()}`,
                                date: groupDate,
                                rawInput: rawInput,
                                units: [
                                    {
                                        id: `unit-original-${Date.now()}`,
                                        label: remainingLabel,
                                        plots: remainingPlots,
                                        products: previousDraft!.products,
                                        status: 'pending',
                                        date: groupDate // Inherit date from group
                                    },
                                    {
                                        id: `unit-new-${Date.now() + 1}`,
                                        label: subsetLabel,
                                        plots: specifiedPlotIds,
                                        products: allProductsForSubset,
                                        status: 'pending',
                                        date: groupDate // Inherit date from group
                                    }
                                ]
                            };

                            const newProductNamesList = newProducts.map(p => p.product).join(', ');
                            const reply = `Check, ik heb ${newProductNamesList} toegevoegd aan de registratie voor ${subsetLabel}. De overige percelen behouden de originele bespuiting.`;

                            send({
                                type: 'grouped_complete',
                                group,
                                reply,
                                parcels: allParcels.map(p => ({ id: p.id, name: p.name, area: p.area }))
                            });
                            return;
                        }

                        // === PHASE 7b: Handle SPLIT action (date-based split) ===
                        // Creates ONE registration group with TWO units, each having their own date
                        if (previousDraft && correctedOutput.action === 'split' && correctedOutput.splitParcels?.length) {
                            console.log(`[${context}] Processing SPLIT action: splitting ${correctedOutput.splitParcels.length} parcels`);

                            // Bug 3 Fix: Create a set of valid parcel IDs to filter out phantom UUIDs
                            const validParcelIdSet = new Set(allParcels.map(p => p.id));

                            // Bug 3 Fix: Also filter previousDraft.plots to only include valid ones
                            const validDraftPlots = previousDraft.plots.filter(id => validParcelIdSet.has(id));
                            if (validDraftPlots.length < previousDraft.plots.length) {
                                console.warn(`[${context}] Filtered ${previousDraft.plots.length - validDraftPlots.length} phantom draft plot IDs`);
                            }
                            const draftPlotSet = new Set(validDraftPlots);

                            // CRITICAL FIX: Extract the parcel name mentioned in the user input
                            // and ONLY split parcels whose names actually contain that text
                            // This prevents the AI from selecting unrelated parcels
                            const inputLower = rawInput.toLowerCase();

                            // Extract parcel name from common split patterns
                            // Patterns: "X trouwens gisteren", "X heb ik gisteren", "X gisteren gespoten"
                            // IMPORTANT: More specific patterns should come first to avoid false matches
                            const splitNamePatterns = [
                                // "Stadhoek gisteren gespoten" - parcel name at start + date + action verb
                                /^(\w+(?:\s+\w+)?)\s+(?:gisteren|vandaag|vorige\s+week)\s+(?:gespoten|gedaan|behandeld)/i,
                                // "Plantsoen was gisteren" - single word at start followed by was + date
                                /^(\w+)\s+was\s+(?:gisteren|vandaag|vorige\s+week)/i,
                                // "Plantsoen trouwens gisteren" or "Plantsoen heb ik gisteren gespoten de rest vandaag"
                                /^(\w+(?:\s+\w+)?)\s+(?:trouwens|heb\s+ik)\s+(?:gisteren|vandaag|vorige\s+week)/i,
                                // "oh ja Plantsoen was gisteren"
                                /oh\s+ja\s+(\w+)\s+(?:was|heb\s+ik)?\s*(?:gisteren|vandaag|vorige\s+week)/i,
                                // "alleen Plantsoen was gisteren" - specific pattern with "was" after name
                                /(?:alleen|wel)\s+(\w+)\s+was\s+(?:gisteren|vandaag|vorige\s+week)/i,
                                // NOTE: Removed generic "alleen/wel X gisteren" pattern as it causes false matches
                                // with phrases like "de rest wel gewoon vandaag" → incorrectly extracts "gewoon"
                            ];

                            // Common Dutch words that should NOT be treated as parcel names
                            const nonParcelWords = new Set([
                                'gewoon', 'ook', 'wel', 'niet', 'maar', 'dan', 'nog', 'al', 'toch',
                                'rest', 'andere', 'overige', 'allemaal', 'alles', 'beide', 'alle'
                            ]);

                            // Get all parcel names from draft for validation
                            const draftParcelNames = validDraftPlots.map(id => {
                                const p = allParcels.find(pp => pp.id === id);
                                return p?.name?.toLowerCase() || '';
                            }).filter(Boolean);

                            let mentionedParcelName: string | null = null;
                            for (const pattern of splitNamePatterns) {
                                const match = rawInput.match(pattern);
                                if (match && match[1]) {
                                    const candidate = match[1].toLowerCase().trim();

                                    // Skip if it's a common Dutch word
                                    if (nonParcelWords.has(candidate)) {
                                        console.log(`[${context}] Skipping non-parcel word: "${candidate}"`);
                                        continue;
                                    }

                                    // Validate that this name actually matches a parcel in the draft
                                    const matchesParcel = draftParcelNames.some(name =>
                                        name.includes(candidate) || candidate.includes(name.split(' ')[0])
                                    );

                                    if (matchesParcel) {
                                        mentionedParcelName = candidate;
                                        console.log(`[${context}] Extracted parcel name from input: "${mentionedParcelName}"`);
                                        break;
                                    } else {
                                        console.log(`[${context}] Candidate "${candidate}" doesn't match any draft parcel - trying next pattern`);
                                    }
                                }
                            }

                            // Filter split parcels: must be in draft AND (if we extracted a name) must contain that name
                            const rawSplitParcelIds = correctedOutput.splitParcels;
                            const splitParcelIds = rawSplitParcelIds.filter(id => {
                                const isValid = validParcelIdSet.has(id);
                                const isInDraft = draftPlotSet.has(id);

                                if (!isValid || !isInDraft) {
                                    if (isValid && !isInDraft) {
                                        const parcel = allParcels.find(p => p.id === id);
                                        console.warn(`[${context}] Split parcel "${parcel?.name || id}" is not in draft - filtering out`);
                                    }
                                    return false;
                                }

                                // CRITICAL: If we extracted a parcel name from the input,
                                // only include parcels whose names contain that text
                                if (mentionedParcelName) {
                                    const parcel = allParcels.find(p => p.id === id);
                                    const parcelNameLower = parcel?.name?.toLowerCase() || '';
                                    const nameMatches = parcelNameLower.includes(mentionedParcelName);

                                    if (!nameMatches) {
                                        console.warn(`[${context}] Split parcel "${parcel?.name}" does not match mentioned name "${mentionedParcelName}" - filtering out`);
                                        return false;
                                    }
                                }

                                return true;
                            });

                            console.log(`[${context}] Split parcel filtering: ${rawSplitParcelIds.length} raw -> ${splitParcelIds.length} after validation`);
                            if (splitParcelIds.length < rawSplitParcelIds.length) {
                                const filteredCount = rawSplitParcelIds.length - splitParcelIds.length;
                                console.warn(`[${context}] Filtered ${filteredCount} split parcel IDs (not in draft, phantom, or name mismatch)`);
                            }

                            const remainingParcelIds = validDraftPlots.filter(id => !splitParcelIds.includes(id));

                            // Resolve dates
                            const today = new Date().toISOString().split('T')[0];
                            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                            // Get the original draft date (this is what the user initially said)
                            const originalDraftDate = previousDraft.date
                                ? new Date(previousDraft.date).toISOString().split('T')[0]
                                : today;

                            // Parse splitDate (e.g., "gisteren" -> yesterday)
                            let splitDateStr = correctedOutput.splitDate || yesterday;

                            // CRITICAL: For remaining parcels, ALWAYS use the original draft date
                            // Don't trust AI's remainingDate - it often hallucinates random dates
                            let remainingDateStr = originalDraftDate;

                            // Convert Dutch date words to ISO dates
                            if (splitDateStr.toLowerCase() === 'gisteren') splitDateStr = yesterday;
                            if (splitDateStr.toLowerCase() === 'vandaag') splitDateStr = today;
                            // Only override remainingDate if user explicitly mentions it
                            if (correctedOutput.remainingDate?.toLowerCase() === 'gisteren') remainingDateStr = yesterday;
                            if (correctedOutput.remainingDate?.toLowerCase() === 'vandaag') remainingDateStr = today;

                            // Override AI dates if input clearly mentions gisteren/vandaag
                            // This handles cases where AI returns incorrect ISO dates
                            if (inputLower.includes('gisteren') && splitDateStr !== yesterday) {
                                console.log(`[${context}] Overriding splitDate from "${splitDateStr}" to yesterday (input mentions gisteren)`);
                                splitDateStr = yesterday;
                            }
                            // Keep original draft date for remaining unless user explicitly says otherwise
                            if (inputLower.includes('de rest vandaag') || inputLower.includes('vandaag de rest')) {
                                remainingDateStr = today;
                            } else if (inputLower.includes('de rest gisteren') || inputLower.includes('gisteren de rest')) {
                                remainingDateStr = yesterday;
                            }

                            console.log(`[${context}] SPLIT dates: splitDate=${splitDateStr}, remainingDate=${remainingDateStr}, originalDraftDate=${originalDraftDate}`);

                            // Get parcel names for the split group
                            const splitParcelInfo = splitParcelIds.map(id => {
                                const parcel = allParcels.find(p => p.id === id);
                                return parcel || { id, name: id, area: null };
                            });
                            const splitLabel = splitParcelInfo.map(p => p.name).join(', ');

                            // Get parcel names for the remaining group
                            const remainingParcelInfo = remainingParcelIds.map(id => {
                                const parcel = allParcels.find(p => p.id === id);
                                return parcel || { id, name: id, area: null };
                            });
                            const remainingLabel = remainingParcelIds.length <= 3
                                ? remainingParcelInfo.map(p => p.name).join(', ')
                                : `Overige ${remainingParcelIds.length} percelen`;

                            // Format dates for display - NEVER show raw ISO strings
                            const formatDateDisplay = (dateStr: string): string => {
                                if (dateStr === yesterday) return 'gisteren';
                                if (dateStr === today) return 'vandaag';
                                // Format any other date nicely
                                try {
                                    const date = new Date(dateStr);
                                    if (!isNaN(date.getTime())) {
                                        return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
                                    }
                                } catch {
                                    // Fallback
                                }
                                return 'vandaag'; // Default to today if date is invalid
                            };
                            const splitDateDisplay = formatDateDisplay(splitDateStr);
                            const remainingDateDisplay = formatDateDisplay(remainingDateStr);

                            // Validate we have parcels to split
                            if (splitParcelIds.length === 0) {
                                console.warn(`[${context}] SPLIT: No valid split parcels after filtering - falling back to update`);
                                // Fall through to normal flow if no valid split parcels
                            } else {
                                // Create ONE group with TWO units, each having their own date
                                // This is important because the frontend only handles one grouped_complete message
                                // Filter out units with no plots (edge case from phantom UUID filtering)
                                const units: SprayRegistrationUnit[] = [];

                                if (splitParcelIds.length > 0) {
                                    units.push({
                                        id: `unit-split-${Date.now()}`,
                                        label: `${splitLabel} (${splitDateDisplay})`,
                                        plots: splitParcelIds,
                                        products: previousDraft.products,
                                        status: 'pending',
                                        date: new Date(splitDateStr) // Unit-specific date for the split-off parcels
                                    });
                                }

                                if (remainingParcelIds.length > 0) {
                                    units.push({
                                        id: `unit-remaining-${Date.now() + 1}`,
                                        label: `${remainingLabel} (${remainingDateDisplay})`,
                                        plots: remainingParcelIds,
                                        products: previousDraft.products,
                                        status: 'pending',
                                        date: new Date(remainingDateStr) // Unit-specific date for remaining parcels
                                    });
                                }

                                if (units.length === 0) {
                                    console.error(`[${context}] SPLIT: No valid units after filtering - this should not happen`);
                                    send({ type: 'error', message: 'Geen geldige percelen voor de split operatie.' });
                                    return;
                                }

                                const combinedGroup: SprayRegistrationGroup = {
                                    groupId: `group-split-${Date.now()}`,
                                    date: new Date(remainingDateStr), // Group date is the "main" date
                                    rawInput: rawInput,
                                    units: units
                                };

                                console.log(`[${context}] SPLIT: Sending grouped_complete with ${units.length} units:`, {
                                    splitParcels: splitParcelIds.length,
                                    remainingParcels: remainingParcelIds.length,
                                    splitDate: splitDateStr,
                                    remainingDate: remainingDateStr
                                });

                                const reply = `Begrepen! Ik heb de registratie gesplitst:\n• ${splitLabel}: datum ${splitDateDisplay}\n• ${remainingLabel}: datum ${remainingDateDisplay}\n\nJe ziet nu twee registratiekaarten met verschillende datums.`;

                                // Send ONE grouped_complete message with both units
                                // isSplit flag tells frontend to MERGE instead of REPLACE
                                send({
                                    type: 'grouped_complete',
                                    group: combinedGroup,
                                    reply: reply,
                                    parcels: allParcels.map(p => ({ id: p.id, name: p.name, area: p.area })),
                                    isSplit: true,
                                    splitParcelIds: splitParcelIds // Tell frontend which parcels were split off
                                });

                                return;
                            }
                        }

                        const mergedOutput = mergeDrafts(correctedOutput, previousDraft || null);
                        const wasMerged = previousDraft && correctedOutput.action !== 'new';

                        // === PHASE 8: Slot Filling Check (2.6.3 + 3.1.4 Guided) ===
                        // Check if any required slots are missing
                        const missingSlot = checkMissingSlots(
                            mergedOutput,
                            allParcels,
                            rawInput,
                            frequentProducts,
                            parcelHistory
                        );

                        if (missingSlot) {
                            console.log(`[${context}] Missing slot detected: ${missingSlot.missingSlot}`);
                            send({
                                type: 'slot_request',
                                slotRequest: missingSlot
                            });
                            return; // Stop here, wait for user to fill the slot
                        }

                        // Generate conversational reply
                        let conversationalReply = generateConversationalReply(
                            mergedOutput.action,
                            mergedOutput,
                            !!wasMerged
                        );

                        // Add warning if product fetch failed
                        if (productFetchFailed) {
                            conversationalReply += ' ⚠️ Let op: de productdatabase was even niet bereikbaar, dus controleer de productnamen extra goed.';
                        }

                        // All slots filled, send complete response with reply
                        send({
                            type: 'complete',
                            data: mergedOutput,
                            merged: wasMerged,
                            reply: conversationalReply
                        });
                    } else {
                        send({ type: 'error', message: 'AI kon geen geldige output genereren' });
                    }

                } catch (error: unknown) {
                    // Robust error handling - categorize errors for better user feedback
                    console.error(`[${context}] Streaming error:`, error);

                    let errorMessage = 'Er is een onverwachte fout opgetreden.';

                    if (error instanceof Error) {
                        if (error.message?.includes('overloaded') || error.message?.includes('quota')) {
                            errorMessage = 'De AI is momenteel overbelast. Probeer het later opnieuw.';
                        } else if (error.message?.includes('fetch') || error.message?.includes('ECONNRESET')) {
                            errorMessage = 'Verbindingsprobleem. Controleer je internetverbinding en probeer opnieuw.';
                        } else if (error.message?.includes('timeout')) {
                            errorMessage = 'De aanvraag duurde te lang. Probeer het opnieuw.';
                        } else {
                            errorMessage = `Fout tijdens analyse: ${error.message}`;
                        }
                    }

                    try {
                        send({ type: 'error', message: errorMessage });
                    } catch {
                        // If we can't even send the error, just log it
                        console.error(`[${context}] Could not send error message to client`);
                    }
                } finally {
                    try {
                        controller.close();
                    } catch {
                        // Controller may already be closed
                    }
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: unknown) {
        // Outer catch - this should rarely be hit if streaming is working
        console.error(`[${context}] API Error:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Failed to analyze input';

        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
