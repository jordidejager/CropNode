
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

Your goal is to identify which plots were sprayed and which products were used.
- For the products, you MUST match the user's input to the most likely official product name from the provided list. For example, if the user says "pyrus", you should match it to "Pyrus 400 SC" from the list.
- For the plots, identify which plots were sprayed based on their name or variety. A user might refer to 'all conference' which means all plots of the 'Conference' variety. You MUST use the ID of the plot in your output.

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

