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
});
export type ParseSprayApplicationInput = z.infer<typeof ParseSprayApplicationInputSchema>;

const ParseSprayApplicationOutputSchema = z.object({
  plots: z.array(z.string()).describe('List of plot IDs identified in the input.'),
  product: z.string().describe('The product used in the spray application.'),
  dosage: z.number().describe('The dosage of the product used.'),
  unit: z.string().describe('The unit of measurement for the dosage.'),
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

  The user will provide a natural language input describing a spray application and a JSON string of available plots.
  You must extract the following information from the input and return ONLY the plot IDs.

  - plots: An array of plot IDs identified from the user input. If the input refers to all plots of a certain type (e.g., 'alle conference'), you must resolve these to their specific plot IDs using the provided plots data.
  - product: The product used in the spray application.
  - dosage: The dosage of the product used.
  - unit: The unit of measurement for the dosage.

  Example Input:
  Natural Language Input: "Vandaag alle conference gespoten met 1,5 kg captan"
  Plots: "[{\\"id\\":\\"P-1001\\",\\"name\\":\\"Thuis peer\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Conference\\"},{\\"id\\":\\"P-1002\\",\\"name\\":\\"Achter huis\\",\\"crop\\":\\"Appel\\",\\"variety\\":\\"Elstar\\"},{\\"id\\":\\"P-1003\\",\\"name\\":\\"Conference blok 1\\",\\"crop\\":\\"Peer\\",\\"variety\\":\\"Conference\\"}]"

  Example Output:
  {
    "plots": ["P-1001", "P-1003"],
    "product": "captan",
    "dosage": 1.5,
    "unit": "kg"
  }

  Here is the information for the current spray application:
  Natural Language Input: {{{naturalLanguageInput}}}
  Plots: {{{plots}}}

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
