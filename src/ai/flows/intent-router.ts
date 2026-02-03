/**
 * @fileOverview Intent Router - Lichtgewicht intent classificatie voor AgriBot
 *
 * Deze flow bepaalt EERST wat de gebruiker wil voordat we zware processing doen.
 * Ontworpen voor minimaal token-gebruik (<100 tokens per request).
 *
 * Strategie:
 * 1. Pre-classificatie met signaalwoorden (0 tokens, <1ms)
 * 2. AI classificatie alleen als pre-filter onduidelijk is
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
  IntentType,
  IntentClassificationSchema,
  IntentRouterInputSchema,
  IntentWithParamsSchema,
  preClassifyIntent,
  extractQueryParams,
  isQueryIntent,
  isActionIntent,
  isLikelySprayRegistration,
  type IntentRouterInput,
  type IntentClassification,
  type IntentWithParams,
  type QueryProductParams,
  type QueryHistoryParams,
  type QueryRegulationParams,
} from '@/ai/schemas/intents';

/**
 * Compact prompt voor AI classificatie.
 * Ontworpen om zo min mogelijk tokens te gebruiken.
 */
const classificationPrompt = ai.definePrompt({
  name: 'intentClassificationPrompt',
  input: { schema: IntentRouterInputSchema },
  output: { schema: IntentClassificationSchema },
  prompt: `Classificeer de intent van deze Nederlandse landbouw-input.

Opties:
- REGISTER_SPRAY: Registratie van bespuiting (datum, middel, dosering, perceel)
- QUERY_PRODUCT: Vraag over producten/middelen
- QUERY_HISTORY: Vraag over spuitgeschiedenis
- QUERY_REGULATION: Vraag over regels (VGT, dosering, voorschriften)
- NAVIGATE: Navigatie naar pagina/perceel
- CONFIRM: Bevestiging (ja/ok)
- CANCEL: Annulering (stop/nee)
- CLARIFY: Vraag om uitleg
- MODIFY_DRAFT: Aanpassing aan bestaande draft

{{#if hasDraft}}Er is een actieve draft.{{/if}}

Input: "{{userInput}}"

Retourneer JSON met intent en confidence (0-1).`,
});

/**
 * Punt 3: Structured logging interface for intent classification
 */
interface IntentRouterLog {
  input: string;
  prefilter: { intent: string; confidence: number } | null;
  aiFallback: boolean;
  aiResult?: { intent: string; confidence: number };
  aiLatencyMs?: number;
  finalIntent: string;
  finalConfidence: number;
  durationMs: number;
}

/**
 * Log intent classification result in structured JSON format
 */
function logIntentClassification(log: IntentRouterLog): void {
  const inputPreview = log.input.length > 100
    ? log.input.substring(0, 100) + '...'
    : log.input;

  console.log(`[INTENT-ROUTER] ${JSON.stringify({
    input: inputPreview,
    prefilter: log.prefilter,
    aiFallback: log.aiFallback,
    aiResult: log.aiResult,
    aiLatencyMs: log.aiLatencyMs,
    finalIntent: log.finalIntent,
    finalConfidence: log.finalConfidence,
    durationMs: log.durationMs
  })}`);
}

/**
 * Intent Router Flow
 *
 * Classificeert gebruikersinput naar een intent type.
 * Probeert eerst deterministische pre-classificatie, valt terug op AI indien nodig.
 *
 * @example
 * const result = await classifyIntent({
 *   userInput: "Gisteren 2L Captan op alle peren",
 *   hasDraft: false
 * });
 * // { intent: 'REGISTER_SPRAY', confidence: 0.85 }
 */
export const classifyIntent = ai.defineFlow(
  {
    name: 'classifyIntent',
    inputSchema: IntentRouterInputSchema,
    outputSchema: IntentClassificationSchema,
  },
  async (input: IntentRouterInput): Promise<IntentClassification> => {
    const startTime = Date.now();

    // Stap 1: Probeer snelle pre-classificatie
    const preResult = preClassifyIntent(input.userInput, input.hasDraft);

    if (preResult && preResult.confidence >= 0.8) {
      // Hoge confidence -> geen AI nodig
      const result: IntentClassification = {
        intent: preResult.intent,
        confidence: preResult.confidence,
        reasoning: 'Pre-classified via signal words',
      };

      // Punt 3: Log successful pre-classification
      logIntentClassification({
        input: input.userInput,
        prefilter: { intent: preResult.intent, confidence: preResult.confidence },
        aiFallback: false,
        finalIntent: result.intent,
        finalConfidence: result.confidence,
        durationMs: Date.now() - startTime
      });

      return result;
    }

    // Stap 2: AI classificatie nodig
    const aiStartTime = Date.now();
    try {
      const llmResponse = await classificationPrompt(input);
      const aiLatencyMs = Date.now() - aiStartTime;
      const output = llmResponse.output;

      if (!output) {
        // Fallback als AI faalt
        const fallback = fallbackClassification(input.userInput, input.hasDraft);

        logIntentClassification({
          input: input.userInput,
          prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
          aiFallback: true,
          aiLatencyMs,
          finalIntent: fallback.intent,
          finalConfidence: fallback.confidence,
          durationMs: Date.now() - startTime
        });

        return fallback;
      }

      // Combineer met pre-classificatie indien beide beschikbaar
      let result: IntentClassification;
      if (preResult && preResult.intent === output.intent) {
        // Beide eens -> boost confidence
        result = {
          ...output,
          confidence: Math.min(output.confidence + 0.1, 1),
          reasoning: `${output.reasoning || ''} (confirmed by pre-filter)`.trim(),
        };
      } else {
        result = output;
      }

      // Punt 3: Log AI classification result
      logIntentClassification({
        input: input.userInput,
        prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
        aiFallback: true,
        aiResult: { intent: output.intent, confidence: output.confidence },
        aiLatencyMs,
        finalIntent: result.intent,
        finalConfidence: result.confidence,
        durationMs: Date.now() - startTime
      });

      return result;
    } catch (error) {
      console.error('Intent classification error:', error);
      const fallback = fallbackClassification(input.userInput, input.hasDraft);

      logIntentClassification({
        input: input.userInput,
        prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
        aiFallback: true,
        aiLatencyMs: Date.now() - aiStartTime,
        finalIntent: fallback.intent,
        finalConfidence: fallback.confidence,
        durationMs: Date.now() - startTime
      });

      return fallback;
    }
  }
);

/**
 * Fallback classificatie als AI faalt.
 * Gebruikt conservatieve heuristieken.
 */
function fallbackClassification(
  userInput: string,
  hasDraft: boolean
): IntentClassification {
  const normalizedInput = userInput.toLowerCase();

  // Bevat getallen + eenheden -> waarschijnlijk spray registratie
  if (/\d+\s*(l|kg|ml|g)(\/ha)?/i.test(normalizedInput)) {
    return {
      intent: 'REGISTER_SPRAY',
      confidence: 0.6,
      reasoning: 'Fallback: dosage pattern detected',
    };
  }

  // Begint met vraagwoord -> query
  if (/^(wat|welke|hoeveel|wanneer|waar|hoe)\s/i.test(normalizedInput)) {
    return {
      intent: 'QUERY_PRODUCT',
      confidence: 0.5,
      reasoning: 'Fallback: question word detected',
    };
  }

  // Heeft draft en korte input -> modify
  if (hasDraft && userInput.length < 50) {
    return {
      intent: 'MODIFY_DRAFT',
      confidence: 0.5,
      reasoning: 'Fallback: short input with active draft',
    };
  }

  // Default: spray registratie (meest voorkomende use case)
  return {
    intent: 'REGISTER_SPRAY',
    confidence: 0.4,
    reasoning: 'Fallback: default to spray registration',
  };
}


// ============================================================================
// ENHANCED INTENT CLASSIFICATION WITH PARAMETERS
// ============================================================================

/**
 * Prompt voor intent + parameter extractie in één call.
 * Alleen gebruikt voor query intents waar parameters nodig zijn.
 */
const intentWithParamsPrompt = ai.definePrompt({
  name: 'intentWithParamsPrompt',
  input: { schema: IntentRouterInputSchema },
  output: { schema: IntentWithParamsSchema },
  prompt: `Je bent AgriBot. Classificeer de intent EN extraheer parameters uit deze Nederlandse landbouw-input.

INTENT TYPES:
- QUERY_PRODUCT: Vraag over producten/middelen → extraheer queryProductParams
- QUERY_HISTORY: Vraag over spuitgeschiedenis → extraheer queryHistoryParams
- QUERY_REGULATION: Vraag over regels (VGT, dosering) → extraheer queryRegulationParams
- NAVIGATE: Navigatie naar pagina/perceel → extraheer navigateParams
- REGISTER_SPRAY: Registratie van bespuiting
- CONFIRM/CANCEL/CLARIFY/MODIFY_DRAFT: Conversatie-acties

PARAMETER EXTRACTIE:
- queryProductParams: { productName?, crop?, targetOrganism?, category? }
- queryHistoryParams: { period?, productName?, parcelName? }
- queryRegulationParams: { productName, regulationType?, crop? }
- navigateParams: { target, name?, id? }

{{#if hasDraft}}Er is een actieve draft.{{/if}}

Input: "{{userInput}}"

Retourneer JSON met intent, confidence, en relevante params.`,
});

/**
 * Enhanced Intent Classification met Parameter Extractie
 *
 * Deze flow extraheert zowel intent als parameters in één AI call.
 * Gebruik dit voor query intents waar je parameters nodig hebt.
 *
 * @example
 * const result = await classifyIntentWithParams({
 *   userInput: "Welke middelen tegen schurft?",
 *   hasDraft: false
 * });
 * // {
 * //   intent: 'QUERY_PRODUCT',
 * //   confidence: 0.9,
 * //   queryProductParams: { targetOrganism: 'schurft' }
 * // }
 */
export const classifyIntentWithParams = ai.defineFlow(
  {
    name: 'classifyIntentWithParams',
    inputSchema: IntentRouterInputSchema,
    outputSchema: IntentWithParamsSchema,
  },
  async (input: IntentRouterInput): Promise<IntentWithParams> => {
    const startTime = Date.now();

    // Stap 1: Snelle pre-classificatie
    const preResult = preClassifyIntent(input.userInput, input.hasDraft);

    // Als pre-filter zeker is en het is GEEN query intent, skip parameter extractie
    if (preResult && preResult.confidence >= 0.9 && !isQueryIntent(preResult.intent)) {
      const result: IntentWithParams = {
        intent: preResult.intent,
        confidence: preResult.confidence,
      };

      // Punt 3: Log successful pre-classification (no AI needed)
      logIntentClassification({
        input: input.userInput,
        prefilter: { intent: preResult.intent, confidence: preResult.confidence },
        aiFallback: false,
        finalIntent: result.intent,
        finalConfidence: result.confidence,
        durationMs: Date.now() - startTime
      });

      return result;
    }

    // Stap 2: AI classificatie met parameter extractie
    const aiStartTime = Date.now();
    try {
      const llmResponse = await intentWithParamsPrompt(input);
      const aiLatencyMs = Date.now() - aiStartTime;
      const output = llmResponse.output;

      if (!output) {
        // Fallback
        const fallback = fallbackClassification(input.userInput, input.hasDraft);
        const result: IntentWithParams = {
          intent: fallback.intent,
          confidence: fallback.confidence,
        };

        logIntentClassification({
          input: input.userInput,
          prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
          aiFallback: true,
          aiLatencyMs,
          finalIntent: result.intent,
          finalConfidence: result.confidence,
          durationMs: Date.now() - startTime
        });

        return result;
      }

      // Punt 3: Log AI classification with params result
      logIntentClassification({
        input: input.userInput,
        prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
        aiFallback: true,
        aiResult: { intent: output.intent, confidence: output.confidence },
        aiLatencyMs,
        finalIntent: output.intent,
        finalConfidence: output.confidence,
        durationMs: Date.now() - startTime
      });

      return output;
    } catch (error) {
      console.error('Intent with params classification error:', error);
      const fallback = fallbackClassification(input.userInput, input.hasDraft);
      const result: IntentWithParams = {
        intent: fallback.intent,
        confidence: fallback.confidence,
      };

      logIntentClassification({
        input: input.userInput,
        prefilter: preResult ? { intent: preResult.intent, confidence: preResult.confidence } : null,
        aiFallback: true,
        aiLatencyMs: Date.now() - aiStartTime,
        finalIntent: result.intent,
        finalConfidence: result.confidence,
        durationMs: Date.now() - startTime
      });

      return result;
    }
  }
);

