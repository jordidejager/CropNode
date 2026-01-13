
'use server';

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
  dosage: z.number().describe('The dosage of the product.'),
  unit: z.string().describe('The unit of measurement for the dosage (e.g., "kg", "l").'),
  targetReason: z.string().optional().describe('The target pest, disease, or reason for spraying this product if mentioned (e.g., "schurft", "luis", "bladluis", "vruchtmot"). Extract keywords like "tegen [X]", "voor [X]", "bestrijding van [X]".'),
});

const SprayApplicationInputSchema = z.object({
  naturalLanguageInput: z
    .string()
    .describe('The natural language input from the user describing the spray application.'),
  plots: z
    .string()
    .describe('A JSON string representing an array of available plots with their id, name, crop and variety.'),
  productNames: z.array(z.string()).describe('An array of all available official product names.')
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

export type SprayApplicationInput = z.infer<typeof SprayApplicationInputSchema>;
export type SprayApplicationOutput = z.infer<typeof SprayApplicationOutputSchema>;

export async function parseSprayApplication(input: SprayApplicationInput): Promise<SprayApplicationOutput> {
  return parseSprayApplicationFlow(input);
}


const prompt = ai.definePrompt({
  name: 'sprayApplicationPrompt',
  input: { schema: SprayApplicationInputSchema },
  output: { schema: SprayApplicationOutputSchema },
  prompt: `You are an expert in agriculture and your task is to parse a user's natural language input about a spray application.
You will be provided with a sentence, a list of available plots (parcels), and a list of official product names.

Your goal is to identify:
1.  Which plots were sprayed.
2.  Which products were used, including their dosage and unit.
3.  The date of the application if mentioned.
4.  The target organism/reason for spraying each product (if mentioned).

Rules for parsing:
-   Plots: Identify which plots were sprayed based on their name or variety. A user might refer to 'all conference' which means all plots of the 'Conference' variety. If the user says 'alles' (everything) or 'alle percelen' (all plots), you MUST select all plot IDs from the provided list. You MUST use the ID of the plot in your output.
-   Products: You MUST match the user's input to the most likely official product name from the provided list. For example, if the user says "pyrus", you should match it to "Pyrus 400 SC" from the list.
-   Date: If the user mentions a specific date, 'today', or 'yesterday', determine the date and provide it in 'YYYY-MM-DD' format. If no date is mentioned, do not include the date field in the output. Today's date is ${new Date().toISOString().split('T')[0]}.
-   Target Reason (targetReason): Extract the pest, disease, or reason for spraying if mentioned. Look for patterns like:
    - "tegen [X]" (against X) - e.g., "tegen schurft" -> targetReason: "schurft"
    - "voor [X]" (for X) - e.g., "voor luis" -> targetReason: "luis"
    - "bestrijding [X]" (control of X) - e.g., "bestrijding bladluis" -> targetReason: "bladluis"
    - Direct mentions of pests/diseases near product names - e.g., "captan voor schurft" -> targetReason: "schurft"
    Common Dutch pest/disease names: schurft, luis, bladluis, vruchtmot, meeldauw, roest, trips, spint, appelbloesemkever.
    If no target is mentioned for a product, omit the targetReason field for that product.

Return the answer ONLY as a valid JSON object matching the provided schema.

Here is the user's input:
"{{{naturalLanguageInput}}}"

Here is the list of available plots. Use the 'id' for your output.
{{{plots}}}

Here is the list of official product names to match against:
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


