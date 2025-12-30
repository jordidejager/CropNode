'use server';

/**
 * @fileOverview Parses a CTGB Excel file for pesticides/fungicides.
 *
 * - parseCtgbExcel - A function that parses the Excel data.
 * - ParseCtgbExcelInput - The input type for the function.
 * - ParseCtgbExcelOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParseCtgbExcelInputSchema = z.object({
  excelData: z.string().describe("A Base64 encoded string of the Excel file (.xlsx or .csv)."),
});
export type ParseCtgbExcelInput = z.infer<typeof ParseCtgbExcelInputSchema>;

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

const ParseCtgbExcelOutputSchema = z.object({
    middelen: z.array(MiddelSchema),
});

export type ParseCtgbExcelOutput = z.infer<typeof ParseCtgbExcelOutputSchema>;

export async function parseCtgbExcel(input: ParseCtgbExcelInput): Promise<ParseCtgbExcelOutput> {
  return parseCtgbExcelFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseCtgbExcelPrompt',
  input: { schema: ParseCtgbExcelInputSchema },
  output: { schema: ParseCtgbExcelOutputSchema },
  prompt: `You are an expert in interpreting Dutch CTGB Excel files for agricultural pesticides.
Your task is to extract very specific information from the provided file data and structure it as a JSON object.

The user has provided an Excel file (as a Base64 string). You must parse this file.
The file contains many columns. You are interested in the following columns to extract the application rules:
- 'Middelnaam'
- 'Toepassing' (This is the target disease/pest)
- 'Gewas' (This is the crop)
- 'Maximale dosering per toepassing'
- 'Eenheid maximale dosering per toepassing'
- 'Wachttijd (dagen) voor de oogst'
- 'Maximaal aantal toepassingen per 12 maanden'
- 'Minimale interval tussen toepassingen in dagen'

You must only extract information for the crops "Appel" (apple) and "Peer" (pear). Ignore all other crops mentioned in the file.
For each relevant row in the Excel file that applies to "Appel" or "Peer", create a separate object in the 'middelen' array.

From the Excel data, extract the following fields for each "Peer" or "Appel" application:
- product: The name of the product from the 'Middelnaam' column.
- crop: The crop, which must be either "Peer" or "Appel".
- disease: The target disease or pest from the 'Toepassing' column.
- maxDosage: The maximum dosage per application from the 'Maximale dosering per toepassing' column.
- unit: The unit for the dosage from the 'Eenheid maximale dosering per toepassing' column.
- safetyPeriodDays: The safety period from the 'Wachttijd (dagen) voor de oogst' column.
- maxApplicationsPerYear: The maximum number of applications from the 'Maximaal aantal toepassingen per 12 maanden' column.
- minIntervalDays: The minimum interval in days from the 'Minimale interval tussen toepassingen in dagen' column.

If a numeric value is missing or cannot be parsed from a field that should be a number (like dosage or days), omit the field from the output for that entry. Do not default to 0.

Now, parse the following Excel file data:
{{{media url=excelData}}}
`,
});

const parseCtgbExcelFlow = ai.defineFlow(
  {
    name: 'parseCtgbExcelFlow',
    inputSchema: ParseCtgbExcelInputSchema,
    outputSchema: ParseCtgbExcelOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
