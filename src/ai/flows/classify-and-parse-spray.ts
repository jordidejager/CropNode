/**
 * @fileOverview Punt 7: Combined Intent Classification + Spray Parsing
 *
 * This flow combines intent classification and spray registration parsing
 * into a SINGLE AI call, reducing latency and token usage for the most
 * common use case: registering a spray application.
 *
 * Instead of:
 * 1. classifyIntent() → AI call → REGISTER_SPRAY
 * 2. parseSprayApplication() → AI call → parsed data
 *
 * We now do:
 * 1. classifyAndParseSpray() → AI call → intent + parsed data (if applicable)
 *
 * Benefits:
 * - 50% reduction in AI calls for spray registrations
 * - Lower latency (single round-trip)
 * - More consistent parsing (AI sees full context)
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { IntentType } from '@/ai/schemas/intents';

// ============================================
// Schemas
// ============================================

const ProductEntrySchema = z.object({
  product: z.string().describe('The official name of the product used.'),
  dosage: z.number().describe('The dosage of the product. Use 0 if not specified.'),
  unit: z.string().describe('The unit of measurement (e.g., "kg", "L"). Default "L".'),
  targetReason: z.string().optional().describe('Target pest/disease if mentioned.'),
});

const RegistrationUnitSchema = z.object({
  plots: z.array(z.string()).describe('Plot IDs for this unit.'),
  products: z.array(ProductEntrySchema).describe('Products with dosages for this unit.'),
  label: z.string().optional().describe('Descriptive label for UI, e.g. "Appels (zonder Kanzi)"'),
  reason: z.enum(['base', 'exception', 'addition', 'reduced_dosage']).optional()
    .describe('Why this unit exists'),
});

/**
 * Combined input schema for the unified flow.
 */
const ClassifyAndParseInputSchema = z.object({
  userInput: z.string().describe('The raw user input text'),
  hasDraft: z.boolean().default(false).describe('Whether there is an active draft'),
  // Only needed if input is likely a spray registration
  plots: z.string().optional().describe('JSON string of available plots'),
  productNames: z.array(z.string()).optional().describe('Available product names'),
  userPreferences: z.array(z.object({
    alias: z.string(),
    preferred: z.string()
  })).optional().describe('User alias preferences'),
  regexHints: z.object({
    possibleGroup: z.string().optional(),
    possibleException: z.string().optional(),
    variationPattern: z.string().optional(),
    detectedProducts: z.array(z.string()).optional(),
    detectedDate: z.string().optional(),
  }).optional().describe('Regex pre-processing hints'),
  previousDraft: z.object({
    plots: z.array(z.string()),
    products: z.array(ProductEntrySchema),
    date: z.string().optional()
  }).optional().describe('Current draft if modifying'),
});

/**
 * Combined output schema that returns BOTH intent AND parsed data.
 */
const ClassifyAndParseOutputSchema = z.object({
  // Intent classification (always returned)
  intent: IntentType.describe('The detected intent type'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().optional().describe('Brief explanation for the classification'),

  // Spray parsing (only if intent is REGISTER_SPRAY or MODIFY_DRAFT)
  sprayData: z.object({
    registrations: z.array(RegistrationUnitSchema).optional()
      .describe('Array of registration units (for grouped registrations)'),
    plots: z.array(z.string()).optional().describe('Plot IDs (simple format)'),
    products: z.array(ProductEntrySchema).optional().describe('Products (simple format)'),
    date: z.string().optional().describe('Date in YYYY-MM-DD format'),
    isGrouped: z.boolean().describe('Whether this is a grouped registration'),
  }).optional().describe('Parsed spray data (only for REGISTER_SPRAY intent)'),
});

export type ClassifyAndParseInput = z.infer<typeof ClassifyAndParseInputSchema>;
export type ClassifyAndParseOutput = z.infer<typeof ClassifyAndParseOutputSchema>;

// ============================================
// Combined Prompt
// ============================================

const combinedPrompt = ai.definePrompt({
  name: 'classifyAndParseSprayPrompt',
  input: { schema: ClassifyAndParseInputSchema },
  output: { schema: ClassifyAndParseOutputSchema },
  prompt: `Je bent AgriBot, een expert in Nederlandse landbouw. Je taak is TWEE dingen tegelijk te doen:

1. **CLASSIFICEER** de intent van de gebruikersinvoer
2. **PARSE** de spray registratie data (alleen als intent = REGISTER_SPRAY of MODIFY_DRAFT)

## STAP 1: Intent Classificatie

Bepaal de intent:
- **REGISTER_SPRAY**: Registratie van bespuiting (datum, middel, dosering, perceel)
- **QUERY_PRODUCT**: Vraag over producten/middelen
- **QUERY_HISTORY**: Vraag over spuitgeschiedenis
- **QUERY_REGULATION**: Vraag over regels (VGT, dosering, voorschriften)
- **NAVIGATE**: Navigatie naar pagina/perceel
- **CONFIRM**: Bevestiging (ja/ok)
- **CANCEL**: Annulering (stop/nee)
- **CLARIFY**: Vraag om uitleg
- **MODIFY_DRAFT**: Aanpassing aan bestaande draft

{{#if hasDraft}}**Let op:** Er is een actieve draft - check of dit een MODIFY_DRAFT is.{{/if}}

## STAP 2: Spray Parsing (alleen bij REGISTER_SPRAY of MODIFY_DRAFT)

Als de intent REGISTER_SPRAY of MODIFY_DRAFT is, parse dan ook de spray data:

### Kritieke Regels:
- ALLEEN producten die de gebruiker EXPLICIET noemt
- Dosering = 0 als niet gespecificeerd (systeem vult aan)
- Unit = "L" als niet gespecificeerd
- Datum = ${new Date().toISOString().split('T')[0]} voor "vandaag"

{{#if regexHints}}
### Pre-processing Hints (context, niet definitief):
{{#if regexHints.possibleGroup}}- Groep keyword: "{{regexHints.possibleGroup}}"{{/if}}
{{#if regexHints.possibleException}}- Uitzondering: "{{regexHints.possibleException}}"{{/if}}
{{#if regexHints.variationPattern}}- Variatie patroon: "{{regexHints.variationPattern}}"{{/if}}
{{#if regexHints.detectedProducts}}- Gedetecteerde producten: {{#each regexHints.detectedProducts}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}{{/if}}
{{#if regexHints.detectedDate}}- Datum hint: "{{regexHints.detectedDate}}"{{/if}}
{{/if}}

### Variaties & Uitzonderingen:
Bij variaties (maar, behalve, halve dosering, etc.) maak **meerdere registrations**:

**Voorbeeld: Extra product voor subset**
"Alle appels met Merpan, maar Kanzi ook Score"
→ isGrouped: true, registrations: [
    { plots: [appels BEHALVE Kanzi], products: [Merpan], label: "Appels (zonder Kanzi)" },
    { plots: [alleen Kanzi], products: [Merpan, Score], label: "Kanzi" }
  ]

**Voorbeeld: Halve dosering voor subset**
"Peren met 1 kg Captan, Lucas halve dosering"
→ isGrouped: true, registrations: [
    { plots: [peren BEHALVE Lucas], products: [Captan 1kg], label: "Peren (zonder Lucas)" },
    { plots: [alleen Lucas], products: [Captan 0.5kg], label: "Lucas" }
  ]

**Voorbeeld: Simpele registratie**
"Alle appels met Merpan"
→ isGrouped: false, plots: [alle appel IDs], products: [Merpan]

### Perceel Matching:
- "alle appels" → alle percelen met crop='Appel'
- "alle peren" → alle percelen met crop='Peer'
- "alle elstar" → alle percelen met variety='Elstar'
- "overal" / "alles" → alle perceel IDs

{{#if previousDraft}}
### Actieve Draft (voor MODIFY_DRAFT):
{{{json previousDraft}}}
Pas de wijzigingen uit de input toe op deze draft.
{{/if}}

{{#if plots}}
### Beschikbare Percelen:
{{{plots}}}
{{/if}}

{{#if productNames}}
### Beschikbare Producten:
{{#each productNames}}- {{{this}}}
{{/each}}
{{/if}}

---

**Gebruikersinvoer:**
"{{{userInput}}}"

Retourneer JSON met intent, confidence, en optioneel sprayData.`,
});

// ============================================
// Flow Definition
// ============================================

/**
 * Combined Intent Classification + Spray Parsing Flow
 *
 * @example
 * // For spray registration
 * const result = await classifyAndParseSpray({
 *   userInput: "Gisteren alle appels met 2L Captan",
 *   plots: JSON.stringify(parcels),
 *   productNames: ['Captan 80 WDG', 'Merpan 500 SC']
 * });
 * // {
 * //   intent: 'REGISTER_SPRAY',
 * //   confidence: 0.95,
 * //   sprayData: { plots: [...], products: [...], date: '2024-01-15', isGrouped: false }
 * // }
 *
 * @example
 * // For non-spray intent
 * const result = await classifyAndParseSpray({
 *   userInput: "Welke middelen tegen schurft?"
 * });
 * // {
 * //   intent: 'QUERY_PRODUCT',
 * //   confidence: 0.9
 * // }
 */
export const classifyAndParseSpray = ai.defineFlow(
  {
    name: 'classifyAndParseSpray',
    inputSchema: ClassifyAndParseInputSchema,
    outputSchema: ClassifyAndParseOutputSchema,
  },
  async (input: ClassifyAndParseInput): Promise<ClassifyAndParseOutput> => {
    const startTime = Date.now();

    try {
      const llmResponse = await combinedPrompt(input);
      const output = llmResponse.output;

      if (!output) {
        console.error('[CLASSIFY-PARSE] AI returned no output');
        // Fallback to basic classification
        return {
          intent: 'CLARIFY',
          confidence: 0.3,
          reasoning: 'AI returned no output'
        };
      }

      const duration = Date.now() - startTime;
      console.log(`[CLASSIFY-PARSE] Completed in ${duration}ms: intent=${output.intent}, confidence=${output.confidence.toFixed(2)}${output.sprayData ? ', hasSprayData=true' : ''}`);

      return output;
    } catch (error) {
      console.error('[CLASSIFY-PARSE] Error:', error);
      // Conservative fallback
      return {
        intent: 'REGISTER_SPRAY',
        confidence: 0.4,
        reasoning: 'Fallback due to error'
      };
    }
  }
);

// ============================================
// Helper Functions
// ============================================

/**
 * Check if we should use the combined flow.
 * Only use when we have spray context data available.
 */
export function shouldUseCombinedFlow(
  hasPlots: boolean,
  hasProducts: boolean,
  isLikelySpray: boolean
): boolean {
  // Use combined flow when we have context AND input looks like spray
  return (hasPlots || hasProducts) && isLikelySpray;
}

/**
 * Convert combined output to separate intent and spray data.
 * Useful for compatibility with existing code paths.
 */
export function splitCombinedOutput(output: ClassifyAndParseOutput): {
  intentResult: { intent: string; confidence: number };
  sprayResult: ClassifyAndParseOutput['sprayData'] | null;
} {
  return {
    intentResult: {
      intent: output.intent as string,
      confidence: output.confidence as number
    },
    sprayResult: output.sprayData || null
  };
}
