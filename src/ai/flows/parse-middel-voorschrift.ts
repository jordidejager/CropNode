
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

const ParseMiddelVoorschriftInputSchema = z.object({
  voorschrift: z.string().describe('The full text of the usage instructions (gebruikersvoorschrift).'),
});
export type ParseMiddelVoorschriftInput = z.infer<typeof ParseMiddelVoorschriftInputSchema>;

const MiddelSchema = z.object({
  product: z.string().describe('The name of the product.'),
  crop: z.string().describe('The crop it applies to (e.g., "Appel", "Peer", "Kers").'),
  disease: z.string().optional().describe('The disease or pest it targets.'),
  maxDosage: z.number().describe('The maximum dosage per application.'),
  unit: z.string().describe('The unit of measurement for the dosage (e.g., "kg", "l", "g").'),
  safetyPeriodDays: z.number().optional().describe('The safety period (termijn) in days before harvest.'),
  maxApplicationsPerYear: z.number().optional().describe('The maximum number of applications per year.'),
  maxDosePerYear: z.number().optional().describe('The maximum total dose per year in the specified unit.'),
  minIntervalDays: z.number().optional().describe('The minimum interval in days between applications.'),
});

const ParseMiddelVoorschriftOutputSchema = z.object({
    middelen: z.array(MiddelSchema),
    admissionNumber: z.string().optional().describe('The admission number (toelatingsnummer), usually a 5-digit number followed by N.'),
    labelVersion: z.string().optional().describe('The version of the label (WG/W-number), e.g., "W.5" or "WGA W.1".'),
    prescriptionDate: z.string().optional().describe('The date of the prescription document.'),
    activeSubstances: z.string().describe('The active substances (werkzame stoffen) and their concentrations, as a single string.'),
});

export type ParseMiddelVoorschriftOutput = z.infer<typeof ParseMiddelVoorschriftOutputSchema>;

export async function parseMiddelVoorschrift(input: ParseMiddelVoorschriftInput): Promise<ParseMiddelVoorschriftOutput> {
  return parseMiddelVoorschriftFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseMiddelVoorschriftPrompt',
  input: { schema: ParseMiddelVoorschriftInputSchema },
  output: { schema: ParseMiddelVoorschriftOutputSchema },
  prompt: `You are an expert in reading and interpreting Dutch usage instructions (WGGA/gebruiksvoorschriften) for agricultural pesticides and fungicides, whether from a PDF document or a text representation of an Excel sheet.
Your task is to extract very specific information from the provided text and structure it as a JSON object. You must extract ALL crop applications mentioned.

First, extract the following general information from the document if available:
- admissionNumber: The admission number (toelatingsnummer), usually a 5-digit number followed by "N".
- labelVersion: The version of the label, often indicated by "W." or "WGA", e.g., "W.5".
- prescriptionDate: The date the document was issued or is valid from.
- activeSubstances: The list of active substances (werkzame stoffen) and their concentrations. This is a mandatory field. Format this as a single string, e.g., "Captan 800 g/kg". If not found, indicate that.

Next, extract the application rules. For each crop application mentioned in the text, create a separate object in the 'middelen' array.
If a rule applies to multiple crops (e.g., 'Appel en Peer', 'Pitvruchten', 'Fruitgewassen: Groot fruit: Pitvruchten: Appel, Peer'), create a separate entry for each individual crop mentioned. For 'Pitvruchten', create entries for both 'Appel' and 'Peer'. For 'Groot fruit', create entries for 'Appel' and 'Peer' if they are mentioned or implied.

From the text, extract the following fields for each application:
- product: The name of the product. This should be consistent across all objects.
- crop: The specific crop (e.g., "Appel", "Peer", "Kers").
- disease: The target disease or pest (e.g., "Schurft", "Meeldauw", "Fruitmot"). If not specified for a particular dosage, leave it out.
- maxDosage: The maximum dosage per application. Find the value and its unit. This is often per hectare (ha).
- unit: The unit for the dosage (e.g., "kg", "l", "g").
- safetyPeriodDays: The safety period or "wachttermijn" in days. This is the time between the last application and harvest.
- maxApplicationsPerYear: The maximum number of times the product can be applied per year.
- maxDosePerYear: The maximum total amount of the product that can be used per year, in the specified unit.
- minIntervalDays: The minimum number of days between two consecutive applications.

Pay close attention to tables and lists in the text, as they often contain the structured data you need. The text might be a CSV or tab-separated representation of an Excel file, so parse the columns and rows accordingly.
If any piece of information cannot be found in the text, leave the corresponding field out of the JSON output, except for activeSubstances which is mandatory.

Example Input (from PDF):
"WETTELIJK GEBRUIKSVOORSCHRIFT
Toelatingsnummer: 12345 N
Toegestaan is uitsluitend het professionele gebruik als schimmelbestrijdingsmiddel...
Werkzame stoffen: captan 800 g/kg
Datum: 15-05-2023
Versie: W.3

Toepassingen in Pitvruchten (Appel, Peer):
Tegen Schurft (Venturia spp.)
Dosering: 1,9 kg/ha. Maximaal 8 toepassingen per 12 maanden, met een interval van 7-10 dagen.
Veiligheidstermijn: 21 dagen.
Maximale totale dosis per 12 maanden: 15,2 kg/ha."

Example Output:
{
  "middelen": [
    {
      "product": "Unknown Product Name",
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
      "product": "Unknown Product Name",
      "crop": "Peer",
      "disease": "Schurft (Venturia spp.)",
      "maxDosage": 1.9,
      "unit": "kg",
      "safetyPeriodDays": 21,
      "maxApplicationsPerYear": 8,
      "maxDosePerYear": 15.2,
      "minIntervalDays": 7
    }
  ],
  "admissionNumber": "12345 N",
  "labelVersion": "W.3",
  "prescriptionDate": "15-05-2023",
  "activeSubstances": "captan 800 g/kg"
}

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

