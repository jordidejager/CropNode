'use server';

/**
 * @fileOverview Parses pesticide/fungicide usage instructions.
 *
 * - parseMiddelVoorschrift - A function that parses the usage instructions.
 * - ParseMiddelVoorschriftInput - The input type for the function.
 * - ParseMiddelVoorschriftOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { Middel } from '@/lib/types';

const ParseMiddelVoorschriftInputSchema = z.object({
  voorschrift: z.string().describe('The full text of the usage instructions (gebruikersvoorschrift).'),
});
export type ParseMiddelVoorschriftInput = z.infer<typeof ParseMiddelVoorschriftInputSchema>;

const MiddelSchema = z.object({
  product: z.string().describe('The name of the product.'),
  crop: z.string().describe('The crop it applies to (must be either "Appel" or "Peer").'),
  disease: z.string().optional().describe('The disease or pest it targets.'),
  maxDosage: z.number().describe('The maximum dosage per application.'),
  unit: z.string().describe('The unit of measurement for the dosage (e.g., "kg", "l", "g").'),
  safetyPeriodDays: z.number().optional().describe('The safety period (termijn) in days before harvest.'),
  maxApplicationsPerYear: z.number().optional().describe('The maximum number of applications per year.'),
  maxDosePerYear: z.number().optional().describe('The maximum total dose per year in the specified unit.'),
  minIntervalDays: z.number().optional().describe('The minimum interval in days between applications.'),
});

const ParseMiddelVoorschriftOutputSchema = z.array(MiddelSchema);
export type ParseMiddelVoorschriftOutput = z.infer<typeof ParseMiddelVoorschriftOutputSchema>;

export async function parseMiddelVoorschrift(input: ParseMiddelVoorschriftInput): Promise<ParseMiddelVoorschriftOutput> {
  return parseMiddelVoorschriftFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseMiddelVoorschriftPrompt',
  input: { schema: ParseMiddelVoorschriftInputSchema },
  output: { schema: ParseMiddelVoorschriftOutputSchema },
  prompt: `You are an expert in reading and interpreting Dutch usage instructions (WGGA/gebruiksvoorschriften) for agricultural pesticides and fungicides, specifically for fruit cultivation.
Your task is to extract very specific information from the provided text and structure it as a JSON array.

You must only extract information for the crops "Peer" (pear) and "Appel" (apple). Ignore all other crops.
For each relevant crop mentioned in the text, create a separate object in the output array.

From the text, extract the following fields for each "Peer" or "Appel" application:
- product: The name of the product. This should be consistent across all objects in the array.
- crop: The crop ("Peer" or "Appel").
- disease: The target disease or pest (e.g., "Schurft", "Meeldauw", "Fruitmot"). If not specified for a particular dosage, leave it out.
- maxDosage: The maximum dosage per application. Find the value and its unit. This is often per hectare (ha).
- unit: The unit for the dosage (e.g., "kg", "l", "g").
- safetyPeriodDays: The safety period or "wachttermijn" in days. This is the time between the last application and harvest.
- maxApplicationsPerYear: The maximum number of times the product can be applied per year.
- maxDosePerYear: The maximum total amount of the product that can be used per year, in the specified unit.
- minIntervalDays: The minimum number of days between two consecutive applications.

Pay close attention to tables and lists in the text, as they often contain the structured data you need. If information is different for Apple and Pear, create two separate objects.

Example Input:
"GEBRUIKSVOORSCHRIFT
Het middel Captan 80 WDG is een contactfungicide.

Toepassingen in Appel en Peer:
Tegen Schurft (Venturia spp.)
Dosering: 1,9 kg/ha. Maximaal 8 toepassingen per 12 maanden, met een interval van 7-10 dagen.
Veiligheidstermijn: 21 dagen.
Maximale totale dosis per 12 maanden: 15,2 kg/ha."

Example Output:
[
  {
    "product": "Captan 80 WDG",
    "crop": "Appel",
    "disease": "Schurft (Venturia spp.)",
    "maxDosage": 1.9,
    "unit": "kg",
    "safetyPeriodDays": 21,
    "maxApplicationsPerYear": 8,
    "maxDosePerYear": 15.2,
    "minIntervalDays": 7
  },
  {
    "product": "Captan 80 WDG",
    "crop": "Peer",
    "disease": "Schurft (Venturia spp.)",
    "maxDosage": 1.9,
    "unit": "kg",
    "safetyPeriodDays": 21,
    "maxApplicationsPerYear": 8,
    "maxDosePerYear": 15.2,
    "minIntervalDays": 7
  }
]

Now, parse the following instruction text:
{{{voorschrift}}}
`,
});

const parseMiddelVoorschriftFlow = ai.defineFlow(
  {
    name: 'parseMiddelVoorschriftFlow',
    inputSchema: ParseMiddelVoorschriftInputSchema,
    outputSchema: ParseMiddelVoorschriftOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
