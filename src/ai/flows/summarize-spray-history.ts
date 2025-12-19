'use server';

/**
 * @fileOverview Summarizes spray history for a given period or parcel using AI.
 *
 * - summarizeSprayHistory - A function that takes spray history data and returns a summarized analysis.
 * - SummarizeSprayHistoryInput - The input type for the summarizeSprayHistory function.
 * - SummarizeSprayHistoryOutput - The return type for the summarizeSprayHistory function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeSprayHistoryInputSchema = z.object({
  sprayHistory: z.string().describe('A string containing the spray history data.'),
  period: z.string().optional().describe('The time period to summarize (e.g., last month, last year).'),
  parcel: z.string().optional().describe('The specific parcel to summarize.'),
});
export type SummarizeSprayHistoryInput = z.infer<typeof SummarizeSprayHistoryInputSchema>;

const SummarizeSprayHistoryOutputSchema = z.object({
  summary: z.string().describe('A summary of the spray history, highlighting key trends and potential issues.'),
});
export type SummarizeSprayHistoryOutput = z.infer<typeof SummarizeSprayHistoryOutputSchema>;

export async function summarizeSprayHistory(input: SummarizeSprayHistoryInput): Promise<SummarizeSprayHistoryOutput> {
  return summarizeSprayHistoryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeSprayHistoryPrompt',
  input: {schema: SummarizeSprayHistoryInputSchema},
  output: {schema: SummarizeSprayHistoryOutputSchema},
  prompt: `You are an expert agricultural advisor.

You are provided with the spray history data for a farm, optionally filtered by a specific period or parcel.
Your task is to summarize the data, highlighting key trends, potential issues, and any recommendations based on the spray history.

Spray History: {{{sprayHistory}}}
Period: {{{period}}}
Parcel: {{{parcel}}}

Summary:`,
});

const summarizeSprayHistoryFlow = ai.defineFlow(
  {
    name: 'summarizeSprayHistoryFlow',
    inputSchema: SummarizeSprayHistoryInputSchema,
    outputSchema: SummarizeSprayHistoryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
