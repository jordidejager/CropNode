'use server';

/**
 * @fileOverview Parses a CTGB JSON file for pesticides/fungicides.
 *
 * - parseCtgbJson - A function that parses the JSON data.
 * - ParseCtgbJsonInput - The input type for the function.
 * - ParseCtgbJsonOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseCtgbJsonInputSchema = z.object({
  jsonData: z.string().describe("A JSON string representing an array of objects, where each object is a row from the original file."),
});
export type ParseCtgbJsonInput = z.infer<typeof ParseCtgbJsonInputSchema>;

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

const ParseCtgbJsonOutputSchema = z.object({
    middelen: z.array(MiddelSchema),
});

export type ParseCtgbJsonOutput = z.infer<typeof ParseCtgbJsonOutputSchema>;

export async function parseCtgbJson(input: ParseCtgbJsonInput): Promise<ParseCtgbJsonOutput> {
  return parseCtgbJsonFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseCtgbJsonPrompt',
  input: { schema: ParseCtgbJsonInputSchema },
  output: { schema: ParseCtgbJsonOutputSchema },
  prompt: `You are an expert in interpreting Dutch CTGB data for agricultural pesticides.
Your task is to extract very specific information from the provided JSON data and structure it as a JSON object.

The user has provided a JSON string representing an array of data objects. The keys in these objects might not be consistently named (e.g., 'Middelnaam', 'column-1', etc.).
You must first identify the correct columns based on their content. The relevant data points are:
- The product name (e.g., "Captan", "Serenade").
- The crop, which will be in a column named "Gewas" or similar.
- The target disease/pest (e.g., "Schurft (Venturia spp.)"), often in a column named "Toepassing".
- The maximum dosage per application (a numeric value).
- The unit for the dosage (e.g., "kg/ha", "l/ha").
- The safety period in days (a numeric value).
- The maximum number of applications per year (a numeric value).
- The minimum interval between applications in days (a numeric value).

IMPORTANT: You must only extract information for the crops "Appel" (apple) and "Peer" (pear). Ignore all other crops.
For each relevant entry in the JSON data that applies to "Appel" or "Peer", create a separate object in the 'middelen' array.

From the JSON data, extract the following fields for each "Peer" or "Appel" application:
- product: The name of the product.
- crop: The crop, which must be either "Peer" or "Appel".
- disease: The target disease or pest.
- maxDosage: The maximum dosage per application.
- unit: The unit for the dosage.
- safetyPeriodDays: The safety period (wachttermijn).
- maxApplicationsPerYear: The maximum number of applications per year.
- minIntervalDays: The minimum interval in days between applications.

If a numeric value is missing, cannot be parsed from a field that should be a number (like dosage or days), or is not a valid number, omit the field from the output for that entry. Do not default to 0.

Now, parse the following JSON data, smartly identifying the columns regardless of their keys:
{{{jsonData}}}
`,
});

const parseCtgbJsonFlow = ai.defineFlow(
  {
    name: 'parseCtgbJsonFlow',
    inputSchema: ParseCtgbJsonInputSchema,
    outputSchema: ParseCtgbJsonOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
