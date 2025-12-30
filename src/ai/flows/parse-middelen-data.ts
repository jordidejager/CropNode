'use server';

/**
 * @fileOverview Parses CTGB JSON data for pesticides/fungicides.
 *
 * - parseMiddelenData - A function that parses the JSON data.
 * - ParseMiddelenDataInput - The input type for the function.
 * - ParseMiddelenDataOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseMiddelenDataInputSchema = z.object({
  jsonData: z.string().describe("A JSON string representing rows from the CTGB export file."),
});
export type ParseMiddelenDataInput = z.infer<typeof ParseMiddelenDataInputSchema>;

const MiddelSchema = z.object({
  product: z.string().describe('The name of the product (Middelnaam).'),
  crop: z.string().describe('The crop it applies to (must be either "Appel" or "Peer").'),
  disease: z.string().optional().describe('The disease or pest it targets (Toepassing).'),
  maxDosage: z.number().describe('The maximum dosage per application (Maximale dosering per toepassing).'),
  unit: z.string().describe('The unit of measurement for the dosage (Eenheid maximale dosering per toepassing).'),
  safetyPeriodDays: z.number().optional().describe('The safety period in days (Wachttijd (dagen) voor de oogst).'),
  maxApplicationsPerYear: z.number().optional().describe('The maximum number of applications per year (Maximaal aantal toepassingen per 12 maanden).'),
  minIntervalDays: z.number().optional().describe('The minimum interval in days between applications (Minimale interval tussen toepassingen in dagen).'),
});

const ParseMiddelenDataOutputSchema = z.object({
    middelen: z.array(MiddelSchema),
});

export type ParseMiddelenDataOutput = z.infer<typeof ParseMiddelenDataOutputSchema>;

export async function parseMiddelenData(input: ParseMiddelenDataInput): Promise<ParseMiddelenDataOutput> {
  return parseMiddelenDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseMiddelenDataPrompt',
  input: { schema: ParseMiddelenDataInputSchema },
  output: { schema: ParseMiddelenDataOutputSchema },
  prompt: `You are an expert in interpreting Dutch CTGB data for agricultural pesticides.
Your task is to extract very specific information from the provided JSON data (from an official CTGB export) and structure it as a JSON object.

The user has provided a JSON string representing rows from the file. You are interested in the following specific JSON keys to extract the application rules:
- 'Middelnaam'
- 'Toepassing' (This is the target disease/pest)
- 'Gewas' (This is the crop)
- 'Maximale dosering per toepassing'
- 'Eenheid maximale dosering per toepassing'
- 'Wachttijd (dagen) voor de oogst'
- 'Maximaal aantal toepassingen per 12 maanden'
- 'Minimale interval tussen toepassingen in dagen'

IMPORTANT: You must only extract information for the crops "Appel" (apple) and "Peer" (pear). Ignore all other crops mentioned in the file.
For each relevant object in the JSON data that applies to "Appel" or "Peer", create a separate object in the 'middelen' array.

From the JSON data, extract the following fields for each "Peer" or "Appel" application:
- product: The name of the product from the 'Middelnaam' field.
- crop: The crop, which must be either "Peer" or "Appel".
- disease: The target disease or pest from the 'Toepassing' field.
- maxDosage: The maximum dosage per application from the 'Maximale dosering per toepassing' field.
- unit: The unit for the dosage from the 'Eenheid maximale dosering per toepassing' field.
- safetyPeriodDays: The safety period from the 'Wachttijd (dagen) voor de oogst' field.
- maxApplicationsPerYear: The maximum number of applications from the 'Maximaal aantal toepassingen per 12 maanden' field.
- minIntervalDays: The minimum interval in days from the 'Minimale interval tussen toepassingen in dagen' field.

If a numeric value is missing, cannot be parsed from a field that should be a number (like dosage or days), or is not a valid number, omit the field from the output for that entry. Do not default to 0.

Now, parse the following JSON data:
{{{jsonData}}}
`,
});

const parseMiddelenDataFlow = ai.defineFlow(
  {
    name: 'parseMiddelenDataFlow',
    inputSchema: ParseMiddelenDataInputSchema,
    outputSchema: ParseMiddelenDataOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error('AI returned no output. The input might be too large or malformed.');
    }
    return output;
  }
);
