/**
 * AgriBot Chat API v2.0 - Hybrid Engine Orchestrator
 *
 * ARCHITECTUUR:
 * 1. Ontvang bericht
 * 2. Pre-classify intent (deterministic, no AI)
 * 3. Als nodig: stuur naar LLM voor parsing
 * 4. RESOLVE STAP:
 *    - Zoek products via fuzzy matching
 *    - Voer location_filter uit op DB
 * 5. VALIDATE STAP:
 *    - Roep CTGB validator aan
 * 6. RESPONSE STAP:
 *    - valid === true: toon bevestigingskaart
 *    - valid === false: toon foutmelding
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limiter';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

import {
  AGRIBOT_SYSTEM_PROMPT,
  AgribotParseResultSchema,
  preClassifyIntent,
  parseDutchDate,
  extractDosage,
  type AgribotParseResult,
} from '@/ai/prompts/agribot-v2';

import { matchProducts, type MatchResult } from '@/lib/validation/product-matcher';
import { applyLocationFilter, describeFilter, type LocationFilter } from '@/lib/validation/parcel-filter';
import { validateApplication, type SprayTask, type CtgbValidationResult } from '@/lib/validation/ctgb-engine';

import { getSprayableParcels, getParcelHistoryEntries, getCtgbProductsByNames } from '@/lib/supabase-store';
import type { CtgbProduct, ParcelHistoryEntry } from '@/lib/types';

// ============================================
// Types
// ============================================

interface ChatRequest {
  message: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  context?: {
    lastSpray?: {
      date: string;
      products: string[];
      parcels: string[];
    };
  };
}

interface ChatResponse {
  type: 'confirmation' | 'error' | 'question' | 'answer' | 'processing';
  message: string;
  data?: {
    intent?: string;
    parsedData?: any;
    resolvedProducts?: Array<{
      searchTerm: string;
      resolved: string | null;
      found: boolean;
    }>;
    resolvedParcels?: Array<{
      id: string;
      name: string;
      crop: string;
    }>;
    validation?: CtgbValidationResult;
    suggestions?: string[];
  };
}

// ============================================
// Main Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Auth check: prevent unauthenticated access to AI endpoint
    const supabaseAuth = await createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { type: 'error', message: 'Niet ingelogd.' } as ChatResponse,
        { status: 401 }
      );
    }

    // Rate limit: 10 requests per minute per user
    const rl = rateLimit(`chat:${user.id}`, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { type: 'error', message: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' } as ChatResponse,
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const body: ChatRequest = await request.json();
    const { message, conversationHistory, context } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { type: 'error', message: 'Geen bericht ontvangen' } as ChatResponse,
        { status: 400 }
      );
    }

    if (message.length > 5000) {
      return NextResponse.json(
        { type: 'error', message: 'Bericht te lang (max 5000 tekens)' } as ChatResponse,
        { status: 400 }
      );
    }

    console.log(`[chat/route] Received message: "${message.substring(0, 100)}..."`);

    // Step 1: Pre-classify intent (deterministic, fast)
    const preClassified = preClassifyIntent(message);
    console.log(`[chat/route] Pre-classified:`, preClassified);

    // Handle simple intents without AI
    if (preClassified?.confidence && preClassified.confidence >= 0.95) {
      if (preClassified.intent === 'confirm') {
        return NextResponse.json({
          type: 'processing',
          message: 'Bevestiging ontvangen. Verwerken...',
          data: { intent: 'confirm' }
        } as ChatResponse);
      }

      if (preClassified.intent === 'cancel') {
        return NextResponse.json({
          type: 'answer',
          message: 'Actie geannuleerd.',
          data: { intent: 'cancel' }
        } as ChatResponse);
      }
    }

    // Step 2: Parse with AI if needed
    let parseResult: AgribotParseResult;

    try {
      parseResult = await parseWithAI(message, conversationHistory || []);
      console.log(`[chat/route] AI parse result:`, JSON.stringify(parseResult, null, 2));
    } catch (parseError) {
      console.error('[chat/route] AI parsing failed:', parseError);
      return NextResponse.json({
        type: 'error',
        message: 'Kon het bericht niet verwerken. Probeer het opnieuw.',
      } as ChatResponse);
    }

    // Step 3: Handle different intents
    switch (parseResult.intent) {
      case 'register_spray':
        return await handleSprayRegistration(parseResult, message);

      case 'query_product':
      case 'query_history':
      case 'query_regulation':
        return await handleQuery(parseResult);

      case 'modify_draft':
        return NextResponse.json({
          type: 'question',
          message: `Begrepen, je wilt ${parseResult.modification_target} ${parseResult.modification_type === 'remove' ? 'verwijderen' : 'aanpassen'}.`,
          data: {
            intent: 'modify_draft',
            parsedData: parseResult,
          }
        } as ChatResponse);

      default:
        return NextResponse.json({
          type: 'answer',
          message: 'Ik begreep het bericht niet helemaal. Kun je het anders formuleren?',
          data: { intent: 'unknown' }
        } as ChatResponse);
    }

  } catch (error) {
    console.error('[chat/route] Unexpected error:', error);
    return NextResponse.json(
      { type: 'error', message: 'Er ging iets mis. Probeer het later opnieuw.' } as ChatResponse,
      { status: 500 }
    );
  }
}

// ============================================
// AI Parsing
// ============================================

async function parseWithAI(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AgribotParseResult> {
  // Build context prompt with today's date
  const today = new Date().toISOString().split('T')[0];
  const contextPrompt = `VANDAAG: ${today}\n\n`;

  // Build messages array
  const messages: Array<{ role: 'user' | 'model'; content: Array<{ text: string }> }> = [];

  // Add conversation history
  for (const msg of history.slice(-5)) { // Last 5 messages for context
    messages.push({
      role: msg.role === 'user' ? 'user' : 'model',
      content: [{ text: msg.content }],
    });
  }

  // Add current message
  messages.push({
    role: 'user',
    content: [{ text: message }],
  });

  // Call AI
  const response = await ai.generate({
    system: contextPrompt + AGRIBOT_SYSTEM_PROMPT,
    messages,
    output: { schema: AgribotParseResultSchema },
  });

  // Parse response
  const output = response.output;

  if (!output) {
    throw new Error('AI returned empty response');
  }

  // Fix date if AI didn't parse it
  if (output.intent === 'register_spray' && !output.date) {
    const parsedDate = parseDutchDate(message);
    if (parsedDate) {
      output.date = parsedDate;
    }
  }

  return output;
}

// ============================================
// Spray Registration Handler
// ============================================

async function handleSprayRegistration(
  parseResult: AgribotParseResult,
  originalMessage: string
): Promise<NextResponse<ChatResponse>> {
  const { products, location_filter, date } = parseResult;

  if (!products || products.length === 0) {
    return NextResponse.json({
      type: 'question',
      message: 'Welk middel heb je gebruikt?',
      data: { intent: 'register_spray', parsedData: parseResult }
    });
  }

  // Step 1: Fetch all parcels
  console.log('[chat/route] Fetching parcels...');
  const allParcels = await getSprayableParcels();

  if (allParcels.length === 0) {
    return NextResponse.json({
      type: 'error',
      message: 'Geen percelen gevonden. Voeg eerst percelen toe.',
    });
  }

  // Step 2: Apply location filter
  console.log('[chat/route] Applying location filter:', location_filter);
  const filterResult = applyLocationFilter(
    location_filter || {},
    allParcels
  );

  if (filterResult.parcels.length === 0) {
    return NextResponse.json({
      type: 'error',
      message: `Geen percelen gevonden met filter: ${describeFilter(location_filter || {})}`,
      data: {
        intent: 'register_spray',
        parsedData: parseResult,
      }
    });
  }

  console.log(`[chat/route] Filter matched ${filterResult.parcels.length} parcels`);

  // Step 3: Resolve products via fuzzy matching
  const productSearchTerms = products.map(p => p.search_term);
  console.log('[chat/route] Matching products:', productSearchTerms);

  const productMatches = await matchProducts(productSearchTerms);

  const resolvedProducts: Array<{
    searchTerm: string;
    resolved: string | null;
    found: boolean;
    ctgbProduct?: CtgbProduct;
  }> = [];

  const unresolvedProducts: string[] = [];

  for (const [searchTerm, matchResult] of productMatches) {
    if (matchResult.found && matchResult.bestMatch) {
      resolvedProducts.push({
        searchTerm,
        resolved: matchResult.bestMatch.product.naam,
        found: true,
        ctgbProduct: matchResult.bestMatch.product,
      });
    } else {
      resolvedProducts.push({
        searchTerm,
        resolved: null,
        found: false,
      });
      unresolvedProducts.push(searchTerm);
    }
  }

  // If any products not found, return error with suggestions
  if (unresolvedProducts.length > 0) {
    const allSuggestions = [...productMatches.values()]
      .flatMap(m => m.suggestions)
      .slice(0, 5);

    return NextResponse.json({
      type: 'error',
      message: `Product(en) niet gevonden: ${unresolvedProducts.join(', ')}`,
      data: {
        intent: 'register_spray',
        parsedData: parseResult,
        resolvedProducts: resolvedProducts.map(p => ({
          searchTerm: p.searchTerm,
          resolved: p.resolved,
          found: p.found,
        })),
        suggestions: allSuggestions,
      }
    });
  }

  // Step 4: Fetch history and validate
  console.log('[chat/route] Fetching history for validation...');
  const parcelHistory = await getParcelHistoryEntries();

  // Build CTGB products map
  const ctgbProductsMap = new Map<string, CtgbProduct>();
  for (const rp of resolvedProducts) {
    if (rp.ctgbProduct) {
      ctgbProductsMap.set(rp.ctgbProduct.naam.toLowerCase(), rp.ctgbProduct);
    }
  }

  // Also fetch related products for substance checking
  const relatedProductNames = new Set<string>();
  for (const entry of parcelHistory) {
    relatedProductNames.add(entry.product);
  }
  if (relatedProductNames.size > 0) {
    const relatedProducts = await getCtgbProductsByNames([...relatedProductNames]);
    for (const p of relatedProducts) {
      if (!ctgbProductsMap.has(p.naam.toLowerCase())) {
        ctgbProductsMap.set(p.naam.toLowerCase(), p);
      }
    }
  }

  // Build parcel crops map
  const parcelCrops = new Map<string, string>();
  for (const parcel of filterResult.parcels) {
    parcelCrops.set(parcel.id, parcel.crop);
  }

  // Run validation for each product
  console.log('[chat/route] Running CTGB validation...');
  const validationResults: CtgbValidationResult[] = [];
  const applicationDate = date ? new Date(date) : new Date();

  for (let i = 0; i < resolvedProducts.length; i++) {
    const rp = resolvedProducts[i];
    const originalProduct = products[i];

    if (!rp.ctgbProduct) continue;

    const task: SprayTask = {
      productId: rp.ctgbProduct.toelatingsnummer,
      productName: rp.ctgbProduct.naam,
      dosage: originalProduct.dosage,
      unit: originalProduct.unit,
      applicationDate,
      parcelIds: filterResult.parcels.map(p => p.id),
      targetOrganism: originalProduct.target_reason,
    };

    const result = validateApplication(task, parcelHistory, ctgbProductsMap, parcelCrops);
    validationResults.push(result);
  }

  // Combine validation results
  const allErrors = validationResults.flatMap(r => r.errors);
  const allWarnings = validationResults.flatMap(r => r.warnings);
  const isValid = allErrors.length === 0;

  // Build response
  const combinedValidation: CtgbValidationResult = {
    valid: isValid,
    errors: allErrors,
    warnings: allWarnings,
    substanceReport: validationResults.flatMap(r => r.substanceReport || []),
  };

  if (isValid) {
    // Success - return confirmation card data
    const productSummary = resolvedProducts
      .map((rp, i) => `${products[i].dosage} ${products[i].unit} ${rp.resolved}`)
      .join(', ');

    const parcelSummary = filterResult.parcels.length <= 3
      ? filterResult.parcels.map(p => p.name).join(', ')
      : `${filterResult.parcels.length} percelen (${filterResult.filterApplied})`;

    let message = `Registratie voorbereid:\n`;
    message += `- Datum: ${applicationDate.toLocaleDateString('nl-NL')}\n`;
    message += `- Middel: ${productSummary}\n`;
    message += `- Percelen: ${parcelSummary}`;

    if (allWarnings.length > 0) {
      message += `\n\nLet op:\n`;
      message += allWarnings.map(w => `- ${w.message}`).join('\n');
    }

    return NextResponse.json({
      type: 'confirmation',
      message,
      data: {
        intent: 'register_spray',
        parsedData: {
          date: applicationDate.toISOString(),
          plots: filterResult.parcels.map(p => p.id),
          products: resolvedProducts.map((rp, i) => ({
            product: rp.resolved,
            dosage: products[i].dosage,
            unit: products[i].unit,
            targetReason: products[i].target_reason,
          })),
        },
        resolvedProducts: resolvedProducts.map(p => ({
          searchTerm: p.searchTerm,
          resolved: p.resolved,
          found: p.found,
        })),
        resolvedParcels: filterResult.parcels.map(p => ({
          id: p.id,
          name: p.name,
          crop: p.crop,
        })),
        validation: combinedValidation,
      }
    });
  } else {
    // Validation failed
    let message = `Validatie mislukt:\n`;
    message += allErrors.map(e => `- ${e.message}`).join('\n');

    if (allWarnings.length > 0) {
      message += `\n\nWaarschuwingen:\n`;
      message += allWarnings.map(w => `- ${w.message}`).join('\n');
    }

    return NextResponse.json({
      type: 'error',
      message,
      data: {
        intent: 'register_spray',
        parsedData: parseResult,
        validation: combinedValidation,
      }
    });
  }
}

// ============================================
// Query Handler
// ============================================

async function handleQuery(
  parseResult: AgribotParseResult
): Promise<NextResponse<ChatResponse>> {
  // For now, return a placeholder response
  // In full implementation, this would call the appropriate tools

  const queryTypeMessages: Record<string, string> = {
    'query_product': 'Ik zoek informatie over middelen...',
    'query_history': 'Ik bekijk de spuitgeschiedenis...',
    'query_regulation': 'Ik zoek regelgeving op...',
  };

  return NextResponse.json({
    type: 'answer',
    message: queryTypeMessages[parseResult.intent] || 'Verwerken...',
    data: {
      intent: parseResult.intent,
      parsedData: parseResult,
    }
  });
}

// ============================================
// GET Handler (for health check)
// ============================================

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '2.0',
    engine: 'hybrid',
  });
}
