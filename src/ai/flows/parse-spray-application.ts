
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
  product: z.string().describe('The name of the product used.'),
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
  products: z
    .string()
    .describe('A JSON string representing an array of available product names from the MiddelMatrix.'),
  preferences: z
    .string()
    .describe('A JSON string representing an array of user preferences for product names. If the user mentions a name from the "alias" field, prefer using the corresponding "preferred" product name in the output.')
});

const SprayApplicationOutputSchema = z.object({
  plots: z
    .array(z.string())
    .describe('An array of plot IDs that were sprayed. This MUST be an ID from the provided plots list.'),
  products: z
    .array(ProductEntrySchema)
    .describe('An array of products that were used in the spray application.'),
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
You will be provided with a sentence, a list of available plots (parcels), a list of available products from the user's "MiddelMatrix", and a list of user preferences for product names.

Your goal is to identify which plots were sprayed and which products were used, including their dosage and unit.

Here is the user's input:
"{{{naturalLanguageInput}}}"

Here is the list of available plots with their ID, name, crop, and variety. Pay close attention to names and varieties to correctly identify the plots. A user might refer to 'all conference' which means all plots of the 'Conference' variety. The user might also refer to a plot by its name. You MUST use the ID of the plot in your output.
{{{plots}}}

Here is the list of available products from the user's MiddelMatrix. You MUST use a name from this list. If the user mentions a product that is not on the list, you must select the closest match from this list. Do NOT invent new product names.
{{{products}}}

Here is a list of user preferences. The user has previously corrected a product name. If the user input contains an 'alias', you should strongly prefer to use the 'preferred' product name in your output.
{{{preferences}}}

Based on this information, extract the plots and products into a JSON object. The output MUST be a valid JSON object matching the provided schema.
- For 'plots', return an array of the IDs of the sprayed plots.
- For 'products', return an array of objects, where each object contains the product name (from the provided list), dosage, and unit.
- Always assume the current date if no date is specified.
- If a user says 'all X', it means all plots of variety 'X' or crop 'X'.
- The dosage must be a number.
`
});

const parseSprayApplicationFlow = ai.defineFlow(
  {
    name: 'parseSprayApplicationFlow',
    inputSchema: SprayApplicationInputSchema,
    outputSchema: SprayApplicationOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
