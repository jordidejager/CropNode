'use server';

/**
 * @fileOverview Parses spray application details from natural language input.
 *
 * - parseSprayApplication - A function that parses the spray application details.
 * - ParseSprayApplicationInput - The input type for the parseSprayApplication function.
 * - ParseSprayApplicationOutput - The return type for the parseSprayApplication function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseSprayApplicationInputSchema = z.object({
  naturalLanguageInput: z
    .string()
    .describe('Natural language input describing the spray application.'),
  plots: z.string().describe('A JSON string of available plots with their id, name, crop and variety.'),
  products: z.string().describe('A JSON string of available product names.'),
});
export type ParseSprayApplicationInput = z.infer<typeof ParseSprayApplicationInputSchema>;

const ProductEntrySchema = z.object({
    product: z.string().describe('The product used in the spray application.'),
    dosage: z.number().describe('The dosage of the product used.'),
    unit: z.string().describe('The unit of measurement for the dosage.'),
});

const ParseSprayApplicationOutputSchema = z.object({
  plots: z.array(z.string()).describe('List of plot IDs identified in the input.'),
  products: z.array(ProductEntrySchema).describe('A list of products, dosages, and units.'),
});
export type ParseSprayApplicationOutput = z.infer<typeof ParseSprayApplicationOutputSchema>;

export async function parseSprayApplication(input: ParseSprayApplicationInput): Promise<ParseSprayApplicationOutput> {
  return parseSprayApplicationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseSprayApplicationPrompt',
  input: {schema: ParseSprayApplicationInputSchema},
  output: {schema: ParseSprayApplicationOutputSchema},
  prompt: `You are an AI assistant designed to parse spray application details from natural language input.

  The user will provide:
  1. A natural language input describing a spray application.
  2. A JSON string of available plots. Each plot has a single variety.
  3. A JSON string of available products.

  You must extract the following information:
  - plots: An array of plot IDs identified from the user input.
    - If the input refers to all plots of a certain type (e.g., 'alle conference'), you must resolve these to their specific plot IDs using the provided plots data.
    - If the input refers to a location (e.g., 'alle thuis'), you must resolve this to all plot IDs where the name starts with 'thuis' (e.g. 'Thuis Conference', 'Thuis Lucas'). Match case-insensitively.
  - products: An array of objects for each spray material. For each product, find the best match from the available products list, correcting for case and spelling mistakes. The product name in the output MUST EXACTLY match a name from the provided products list.

  Example Input 1:
  Natural Language Input: "Vandaag alle conference gespoten met 1,5 kg captan"
  Plots: "[{\\"id\\":\\"P-1001\\",\\"name\\":\\"Thuis peer\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Conference\\"},{\\"id\\":\\"P-1002\\",\\"name\\":\\"Achter huis\\",\\"crop\\":\\"Appel\\",\\"variety\\":\\"Elstar\\"},{\\"id\\":\\"P-1003\\",\\"name\\":\\"Conference blok 1\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Conference\\"}]"
  Products: "[\\"Captan\\", \\"Regalis Plus\\", \\"Ureum\\"]"

  Example Output 1:
  {
    "plots": ["P-1001", "P-1003"],
    "products": [
      { "product": "Captan", "dosage": 1.5, "unit": "kg" }
    ]
  }
  
  Example Input 2:
  Natural Language Input: "Vandaag alle thuis met 2 kg ureum en 1,5 kg captan"
  Plots: "[{\\"id\\":\\"P-1001\\",\\"name\\":\\"Thuis Conference\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Conference\\"},{\\"id\\":\\"P-1002\\",\\"name\\":\\"Achter huis\\",\\"crop\\":\\"Appel\\",\\"variety\\":\\"Elstar\\"}, {\\"id\\":\\"P-1004\\",\\"name\\":\\"Thuis Lucas\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Lucas\\"}]"
  Products: "[\\"Captan\\", \\"Regalis Plus\\", \\"Ureum\\"]"

  Example Output 2:
  {
    "plots": ["P-1001", "P-1004"],
    "products": [
      { "product": "Ureum", "dosage": 2, "unit": "kg" },
      { "product": "Captan", "dosage": 1.5, "unit": "kg" }
    ]
  }

  Here is the information for the current spray application:
  Natural Language Input: {{{naturalLanguageInput}}}
  Plots: {{{plots}}}
  Products: {{{products}}}

  Output:
  `,
});

const parseSprayApplicationFlow = ai.defineFlow(
  {
    name: 'parseSprayApplicationFlow',
    inputSchema: ParseSprayApplicationInputSchema,
    outputSchema: ParseSprayApplicationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
