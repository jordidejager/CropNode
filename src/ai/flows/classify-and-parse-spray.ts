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
// Schemas - FLATTENED to avoid Gemini nesting limits
// ============================================

/**
 * Flattened product entry - uses parallel arrays instead of nested objects
 * to stay within Gemini's 5-level nesting limit
 */
const FlatProductSchema = z.object({
  product: z.string().describe('Product name'),
  dosage: z.number().describe('Dosage (0 if not specified)'),
  unit: z.string().describe('Unit (L, kg). Default L'),
});

/**
 * Flattened registration unit - avoids nested products array
 */
const FlatRegistrationSchema = z.object({
  plotIds: z.string().describe('Comma-separated plot IDs, e.g. "plot1,plot2,plot3"'),
  productList: z.string().describe('Comma-separated products with dosage, e.g. "Captan:2:L,Score:0.5:L"'),
  label: z.string().optional().describe('UI label like "Appels (zonder Kanzi)"'),
});

/**
 * Combined input schema for the unified flow.
 */
const ClassifyAndParseInputSchema = z.object({
  userInput: z.string().describe('The raw user input text'),
  hasDraft: z.boolean().default(false).describe('Whether there is an active draft'),
  plots: z.string().optional().describe('JSON string of available plots'),
  productNames: z.array(z.string()).optional().describe('Available product names'),
  regexHints: z.object({
    possibleGroup: z.string().optional(),
    possibleException: z.string().optional(),
    variationPattern: z.string().optional(),
    detectedDate: z.string().optional(),
  }).optional().describe('Regex hints'),
});

/**
 * FLATTENED output schema - max 4 levels deep
 * Level 1: root object
 * Level 2: sprayData object
 * Level 3: registrations array
 * Level 4: FlatRegistrationSchema object
 */
const ClassifyAndParseOutputSchema = z.object({
  // Intent classification (always returned)
  intent: IntentType.describe('The detected intent type'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().optional().describe('Brief explanation'),

  // Spray parsing - FLATTENED structure
  sprayData: z.object({
    // For grouped registrations - use flat string format
    registrations: z.array(FlatRegistrationSchema).optional()
      .describe('Grouped registrations in flat format'),
    // For simple registrations - direct flat values
    plots: z.string().optional().describe('Comma-separated plot IDs'),
    products: z.string().optional().describe('Products as "name:dosage:unit,name:dosage:unit"'),
    date: z.string().optional().describe('Date YYYY-MM-DD'),
    isGrouped: z.boolean().describe('True if multiple registration units'),
  }).optional().describe('Parsed spray data'),
});

// Internal types for after parsing
export interface ProductEntry {
  product: string;
  dosage: number;
  unit: string;
  targetReason?: string;
}

export interface RegistrationUnit {
  plots: string[];
  products: ProductEntry[];
  label?: string;
}

export type ClassifyAndParseInput = z.infer<typeof ClassifyAndParseInputSchema>;
export type ClassifyAndParseOutputRaw = z.infer<typeof ClassifyAndParseOutputSchema>;

// The output type after post-processing
export interface ClassifyAndParseOutput {
  intent: string;
  confidence: number;
  reasoning?: string;
  sprayData?: {
    registrations?: RegistrationUnit[];
    plots?: string[];
    products?: ProductEntry[];
    date?: string;
    isGrouped: boolean;
  };
}

/**
 * Parse flat product string "name:dosage:unit" into ProductEntry
 */
function parseProductString(str: string): ProductEntry {
  const parts = str.split(':');
  return {
    product: parts[0] || '',
    dosage: parseFloat(parts[1]) || 0,
    unit: parts[2] || 'L',
  };
}

/**
 * Convert flat output to nested structure for rest of pipeline
 */
function unflattenOutput(raw: ClassifyAndParseOutputRaw): ClassifyAndParseOutput {
  const result: ClassifyAndParseOutput = {
    intent: raw.intent,
    confidence: raw.confidence,
    reasoning: raw.reasoning,
  };

  if (raw.sprayData) {
    result.sprayData = {
      isGrouped: raw.sprayData.isGrouped,
      date: raw.sprayData.date,
    };

    if (raw.sprayData.registrations && raw.sprayData.registrations.length > 0) {
      result.sprayData.registrations = raw.sprayData.registrations.map(reg => ({
        plots: reg.plotIds ? reg.plotIds.split(',').map(s => s.trim()).filter(Boolean) : [],
        products: reg.productList ? reg.productList.split(',').map(s => parseProductString(s.trim())) : [],
        label: reg.label,
      }));
    }

    if (raw.sprayData.plots) {
      result.sprayData.plots = raw.sprayData.plots.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (raw.sprayData.products) {
      result.sprayData.products = raw.sprayData.products.split(',').map(s => parseProductString(s.trim()));
    }
  }

  return result;
}

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

**BELANGRIJK: Output altijd in PLAT formaat (comma-separated strings):**
- plotIds: "plot1,plot2,plot3" (komma-gescheiden IDs)
- productList: "Merpan:0:L,Score:0.5:L" (formaat: naam:dosering:unit)
- plots: "plot1,plot2" (voor simpele registraties)
- products: "Captan:2:L" (voor simpele registraties)

**Voorbeeld: Extra product voor subset**
"Alle appels met Merpan, maar Kanzi ook Score"
→ isGrouped: true, registrations: [
    { plotIds: "appel1,appel2,appel3", productList: "Merpan:0:L", label: "Appels (zonder Kanzi)" },
    { plotIds: "kanzi1", productList: "Merpan:0:L,Score:0:L", label: "Kanzi" }
  ]

**Voorbeeld: Halve dosering voor subset**
"Peren met 1 kg Captan, Lucas halve dosering"
→ isGrouped: true, registrations: [
    { plotIds: "peer1,peer2", productList: "Captan:1:kg", label: "Peren (zonder Lucas)" },
    { plotIds: "lucas1", productList: "Captan:0.5:kg", label: "Lucas" }
  ]

**Voorbeeld: Simpele registratie**
"Alle appels met Merpan"
→ isGrouped: false, plots: "appel1,appel2,appel3", products: "Merpan:0:L"

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
    // Note: No outputSchema here - we post-process the flat AI output to nested structure
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

      // Convert flat AI output to nested structure for rest of pipeline
      return unflattenOutput(output);
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
