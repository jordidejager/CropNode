
/**
 * @fileOverview This file defines the Genkit flow for parsing spray application
 * data from natural language input. It uses AI to extract structured
 * information about which plots were sprayed with which products.
 *
 * - parseSprayApplication - A function that handles the spray parsing process.
 * - SprayApplicationInput - The input type for the parseSprayApplication function.
 * - SprayApplicationOutput - The return type for the parseSprayApplication function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ProductEntrySchema = z.object({
  product: z.string().describe('The official name of the product used, matched from the provided productNames list.'),
  dosage: z.number().describe('The dosage of the product. Use 0 if not specified by the user.'),
  unit: z.string().describe('The unit of measurement for the dosage (e.g., "kg", "L"). Use "L" if not specified.'),
  targetReason: z.string().optional().describe('The target pest, disease, or reason for spraying this product if mentioned (e.g., "schurft", "luis", "bladluis", "vruchtmot"). Extract keywords like "tegen [X]", "voor [X]", "bestrijding van [X]".'),
});

/**
 * Punt 5: Regex hints schema for pre-enrichment
 * Regex patterns run BEFORE AI and provide context hints, not definitive results
 */
const RegexHintsSchema = z.object({
  possibleGroup: z.string().optional().describe('Detected group keyword like "alle peren" or "alle appels"'),
  possibleException: z.string().optional().describe('Detected exception like "Conference" in "maar de Conference niet"'),
  variationPattern: z.string().optional().describe('Detected variation pattern like "maar...niet", "behalve", "halve dosering"'),
  detectedProducts: z.array(z.string()).optional().describe('Product names detected by regex'),
  detectedDate: z.string().optional().describe('Date detected by regex pattern'),
}).describe('Optional hints from regex pre-processing. Use as context but make final decisions independently.');

const SprayApplicationInputSchema = z.object({
  naturalLanguageInput: z
    .string()
    .describe('The natural language input from the user describing the spray application.'),
  plots: z
    .string()
    .describe('A JSON string representing an array of available plots with their id, name, crop and variety.'),
  productNames: z.array(z.string()).describe('An array of all available official product names.'),
  previousDraft: z.object({
    plots: z.array(z.string()),
    products: z.array(ProductEntrySchema),
    date: z.string().optional()
  }).optional().describe('The current state of the draft if this is a correction or follow-up.'),
  userPreferences: z.array(z.object({
    alias: z.string(),
    preferred: z.string()
  })).optional().describe('An array of user preferences/corrections from the past. Use these to favor certain matches.'),
  // Punt 5: Add regex hints as optional context
  regexHints: RegexHintsSchema.optional().describe('Optional hints from regex pre-processing to assist parsing.')
});

const SprayApplicationOutputSchema = z.object({
  plots: z
    .array(z.string())
    .describe('An array of plot IDs that were sprayed. This MUST be an ID from the provided plots list.'),
  products: z
    .array(ProductEntrySchema)
    .describe('An array of products that were used in the spray application, based on the user text.'),
  date: z.string().optional().describe("The date of the spray application in 'YYYY-MM-DD' format. If the user mentions 'today', 'yesterday', or a specific date, parse it. Otherwise, omit this field."),
});

// Schema for registration unit (sub-group with specific plots and products)
const RegistrationUnitSchema = z.object({
  plots: z.array(z.string()).describe('Plot IDs for this specific unit.'),
  products: z.array(ProductEntrySchema).describe('Products with dosages for this unit.'),
  label: z.string().optional().describe('Descriptive label for UI, e.g. "Appels (zonder Kanzi)" or "Kanzi"'),
  reason: z.enum(['base', 'exception', 'addition', 'reduced_dosage']).optional()
    .describe('Why this unit exists: base=main group, exception=excluded from base, addition=extra products, reduced_dosage=different dosage'),
});

// V2 Schema with support for grouped registrations
const SprayApplicationOutputSchemaV2 = z.object({
  registrations: z
    .array(RegistrationUnitSchema)
    .describe('Array of registration units. For simple inputs: 1 unit. For complex inputs with variations: multiple units.'),
  date: z.string().optional().describe("The date of the spray application in 'YYYY-MM-DD' format."),
});

export type SprayApplicationInput = z.infer<typeof SprayApplicationInputSchema>;
export type SprayApplicationOutput = z.infer<typeof SprayApplicationOutputSchema>;
export type SprayApplicationOutputV2 = z.infer<typeof SprayApplicationOutputSchemaV2>;
export type RegistrationUnit = z.infer<typeof RegistrationUnitSchema>;

export async function parseSprayApplication(input: SprayApplicationInput): Promise<SprayApplicationOutput> {
  return parseSprayApplicationFlow(input);
}


const prompt = ai.definePrompt({
  name: 'sprayApplicationPrompt',
  input: { schema: SprayApplicationInputSchema },
  output: { schema: SprayApplicationOutputSchema },
  prompt: `You are an expert in agriculture and your task is to parse a user's natural language input about a spray application.
You will be provided with a sentence, a list of available plots (parcels), a list of official product names, and optional context from a previous draft.

Your goal is to identify:
1.  Which plots were sprayed.
2.  Which products were used, including their dosage and unit.
3.  The date of the application if mentioned.

CRITICAL RULES:
-   ONLY PARSE PRODUCTS EXPLICITLY MENTIONED BY THE USER.
    -   DO NOT add products that are not in the user's input.
    -   DO NOT suggest or assume additional products.
    -   If the user says "coragen en score", ONLY output those two products.
    -   NEVER add extra products like "Spuitzwavel" or similar unless the user explicitly mentions them.
-   If the user does NOT specify a dosage, set dosage to 0 (the system will auto-fill from the database).
-   If the user does NOT specify a unit, default to "L".

Rules for parsing:
-   CONVERSATIONAL CONTEXT:
    -   If 'previousDraft' is provided, the user might be correcting it (e.g., "Nee, perceel 'thuis' niet").
    -   Use the 'previousDraft' as your base state and APPLY the changes from the 'naturalLanguageInput'.
    -   If the user says "nee, [X] niet", remove [X] from the existing plots/products.
    -   If the user adds information like "vandaag ook [Y]", add [Y] to the existing state.
-   Plots (Intelligent Grouping):
    -   Match per crop ('Appel', 'Peer') or variety ('Elstar', 'Conference').
    -   "alle appels" -> all IDs with crop 'Appel'.
    -   "alle elstar" -> all IDs with variety 'Elstar'.
-   Products: Match to the official list. Check userPreferences. ONLY include products the user explicitly mentioned.
-   Date: Parse mentions of 'today' (${new Date().toISOString().split('T')[0]}), 'yesterday', or specific dates.

Return the answer ONLY as a valid JSON object matching the provided schema.

Here is the user's input:
"{{{naturalLanguageInput}}}"

{{#if previousDraft}}
Here is the current state of the draft (to be updated):
{{{json previousDraft}}}
{{/if}}

Here is the list of available plots (parcels):
{{{plots}}}

Here is the list of official product names:
{{#each productNames}}
- {{{this}}}
{{/each}}
`
});

const parseSprayApplicationFlow = ai.defineFlow(
  {
    name: 'parseSprayApplicationFlow',
    inputSchema: SprayApplicationInputSchema,
    outputSchema: SprayApplicationOutputSchema,
  },
  async (input) => {
    const llmResponse = await prompt(input);
    const output = llmResponse.output;
    if (!output) {
      throw new Error('AI did not return a valid output.');
    }
    return output;
  }
);

// ============================================
// V2: Support for grouped registrations with variations
// ============================================

export async function parseSprayApplicationV2(input: SprayApplicationInput): Promise<SprayApplicationOutputV2> {
  return parseSprayApplicationFlowV2(input);
}

const promptV2 = ai.definePrompt({
  name: 'sprayApplicationPromptV2',
  input: { schema: SprayApplicationInputSchema },
  output: { schema: SprayApplicationOutputSchemaV2 },
  prompt: `You are an expert in agriculture and your task is to parse a user's natural language input about a spray application.
You will be provided with a sentence, a list of available plots (parcels), a list of official product names, and optional context from a previous draft.

Your goal is to identify:
1.  Which plots were sprayed.
2.  Which products were used, including their dosage and unit.
3.  The date of the application if mentioned.

CRITICAL RULES:
-   ONLY PARSE PRODUCTS EXPLICITLY MENTIONED BY THE USER.
    -   DO NOT add products that are not in the user's input.
    -   DO NOT suggest or assume additional products.
    -   If the user says "coragen en score", ONLY output those two products.
    -   NEVER add extra products like "Spuitzwavel" or similar unless the user explicitly mentions them.
-   If the user does NOT specify a dosage, set dosage to 0 (the system will auto-fill from the database).
-   If the user does NOT specify a unit, default to "L".

{{#if regexHints}}
**PRE-PROCESSING HINTS (Use as context, verify independently):**
{{#if regexHints.possibleGroup}}
- Detected group keyword: "{{regexHints.possibleGroup}}"
{{/if}}
{{#if regexHints.possibleException}}
- Detected exception: "{{regexHints.possibleException}}"
{{/if}}
{{#if regexHints.variationPattern}}
- Detected variation pattern: "{{regexHints.variationPattern}}"
{{/if}}
{{#if regexHints.detectedProducts}}
- Detected products: {{#each regexHints.detectedProducts}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if regexHints.detectedDate}}
- Detected date: "{{regexHints.detectedDate}}"
{{/if}}
These hints are from regex pre-processing. Use them as helpful context but make your own decisions based on the full input.
{{/if}}

VARIATIONS & EXCEPTIONS (IMPORTANT):
When the user mentions variations, exceptions, or different treatments for subsets, you MUST split them into MULTIPLE registrations:

**Trigger words (Nederlands):** "maar", "behalve", "uitgezonderd", "niet de", "alleen de", "halve dosering", "dubbele dosering", "ook nog", "extra", "zonder", "overgeslagen", "toch niet"

**Example 1: Extra product for a subset**
User: "Alle appels met Merpan, maar Kanzi ook Score"
→ registrations: [
    { plots: [all apple IDs EXCEPT Kanzi], products: [{Merpan}], label: "Appels (zonder Kanzi)", reason: "base" },
    { plots: [only Kanzi IDs], products: [{Merpan}, {Score}], label: "Kanzi", reason: "addition" }
  ]

**Example 2: Different dosage for subset**
User: "Peren met 1 kg Captan, Lucas halve dosering"
→ registrations: [
    { plots: [all pear IDs EXCEPT Lucas], products: [{Captan, dosage: 1, unit: "kg"}], label: "Peren (zonder Lucas)", reason: "base" },
    { plots: [only Lucas IDs], products: [{Captan, dosage: 0.5, unit: "kg"}], label: "Lucas", reason: "reduced_dosage" }
  ]

**Example 3: Excluding a variety**
User: "Alle fruit behalve Tessa met Score"
→ registrations: [
    { plots: [all fruit IDs EXCEPT Tessa], products: [{Score}], label: "Fruit (zonder Tessa)", reason: "base" }
  ]
(Note: Tessa is excluded entirely, so no registration for Tessa)

**Example 4: Simple input (no variations)**
User: "Alle appels met Merpan"
→ registrations: [
    { plots: [all apple IDs], products: [{Merpan}], label: "Appels" }
  ]

**Example 5: Non-standard word order (Punt 5 - handle flexible Dutch)**
User: "Captan overal op behalve Conference"
→ registrations: [
    { plots: [all IDs EXCEPT Conference], products: [{Captan}], label: "Alles (zonder Conference)", reason: "base" }
  ]

**Example 6: Past tense with skip**
User: "Peren gehad met Merpan, Conference overgeslagen"
→ registrations: [
    { plots: [all pear IDs EXCEPT Conference], products: [{Merpan}], label: "Peren (zonder Conference)", reason: "base" }
  ]

**Example 7: Block reference instead of variety**
User: "Alles behalve blok 3 met Score"
→ registrations: [
    { plots: [all IDs EXCEPT blok 3], products: [{Score}], label: "Alles (zonder blok 3)", reason: "base" }
  ]

**Example 8: Per-variety products**
User: "Fruit met Score, Lucas halve dosering"
→ registrations: [
    { plots: [all fruit IDs EXCEPT Lucas], products: [{Score}], label: "Fruit (zonder Lucas)", reason: "base" },
    { plots: [only Lucas IDs], products: [{Score, dosage halved}], label: "Lucas", reason: "reduced_dosage" }
  ]

Rules for parsing:
-   CONVERSATIONAL CONTEXT:
    -   If 'previousDraft' is provided, the user might be correcting it (e.g., "Nee, perceel 'thuis' niet").
    -   Use the 'previousDraft' as your base state and APPLY the changes from the 'naturalLanguageInput'.
    -   If the user says "nee, [X] niet", remove [X] from the existing plots/products.
    -   If the user adds information like "vandaag ook [Y]", add [Y] to the existing state.
-   Plots (Intelligent Grouping):
    -   Match per crop ('Appel', 'Peer') or variety ('Elstar', 'Conference', 'Kanzi').
    -   "alle appels" -> all IDs with crop 'Appel'.
    -   "alle elstar" -> all IDs with variety 'Elstar'.
    -   "alle kanzi" -> all IDs with variety 'Kanzi'.
    -   "overal" / "alles" -> all plot IDs.
-   Products: Match to the official list. Check userPreferences. ONLY include products the user explicitly mentioned.
-   Date: Parse mentions of 'today' (${new Date().toISOString().split('T')[0]}), 'yesterday', or specific dates.
-   Labels: Create short, descriptive Dutch labels. Use "(zonder X)" for exclusions.

Return the answer ONLY as a valid JSON object matching the provided schema.

Here is the user's input:
"{{{naturalLanguageInput}}}"

{{#if previousDraft}}
Here is the current state of the draft (to be updated):
{{{json previousDraft}}}
{{/if}}

Here is the list of available plots (parcels):
{{{plots}}}

Here is the list of official product names:
{{#each productNames}}
- {{{this}}}
{{/each}}
`
});

const parseSprayApplicationFlowV2 = ai.defineFlow(
  {
    name: 'parseSprayApplicationFlowV2',
    inputSchema: SprayApplicationInputSchema,
    outputSchema: SprayApplicationOutputSchemaV2,
  },
  async (input) => {
    const llmResponse = await promptV2(input);
    const output = llmResponse.output;
    if (!output) {
      throw new Error('AI did not return a valid output.');
    }
    return output;
  }
);
