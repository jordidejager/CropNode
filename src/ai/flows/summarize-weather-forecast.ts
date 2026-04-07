/**
 * @fileoverview Weather Forecast Summary Flow
 *
 * Single Gemini call that turns aggregated 14-day multi-model forecast metrics
 * into a short Dutch summary tailored for a fruit grower. Highlights:
 * - Notable changes (warming, cooling, fronts)
 * - Rain risks and dry windows (good spray windows)
 * - Model uncertainty where relevant
 *
 * The caller pre-aggregates the raw hourly multi-model data into compact
 * day-level metrics so the prompt stays small and predictable.
 */

import { ai, DEFAULT_MODEL, withTimeout, AI_TIMEOUT_MS } from '@/ai/genkit';
import { z } from 'genkit';

// ============================================
// Types
// ============================================

export interface DaySummaryInput {
  date: string;        // YYYY-MM-DD
  weekday: string;     // "ma", "di", ...
  tmin: number;        // °C, model average
  tmax: number;        // °C, model average
  precipMm: number;    // mm/day, model average
  precipModelStdev: number; // mm spread between models (uncertainty)
  windMaxMs: number;   // m/s, daily max
}

export interface ForecastSummaryInput {
  stationName: string;
  days: DaySummaryInput[];
  metrics: {
    week1AvgTemp: number;
    week2AvgTemp: number;
    totalPrecipWeek1: number;
    totalPrecipWeek2: number;
    longestDryWindowDays: number;
    highUncertaintyDates: string[]; // dates where model spread is large
  };
}

// ============================================
// Schemas
// ============================================

const DaySchema = z.object({
  date: z.string(),
  weekday: z.string(),
  tmin: z.number(),
  tmax: z.number(),
  precipMm: z.number(),
  precipModelStdev: z.number(),
  windMaxMs: z.number(),
});

const InputSchema = z.object({
  stationName: z.string(),
  days: z.array(DaySchema),
  metrics: z.object({
    week1AvgTemp: z.number(),
    week2AvgTemp: z.number(),
    totalPrecipWeek1: z.number(),
    totalPrecipWeek2: z.number(),
    longestDryWindowDays: z.number(),
    highUncertaintyDates: z.array(z.string()),
  }),
});

const OutputSchema = z.object({
  summary: z
    .string()
    .describe(
      'Korte Nederlandse weersamenvatting (4-6 zinnen) voor een fruitteler. Lees als een meteoroloog die kort en concreet vertelt wat je kunt verwachten.'
    ),
});

// ============================================
// Flow
// ============================================

export const summarizeWeatherForecastFlow = ai.defineFlow(
  {
    name: 'summarizeWeatherForecast',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  },
  async (input) => {
    const daysText = input.days
      .map(
        (d) =>
          `${d.weekday} ${d.date}: ${Math.round(d.tmin)}/${Math.round(d.tmax)}°C, ${d.precipMm.toFixed(1)}mm regen (spread ±${d.precipModelStdev.toFixed(1)}mm), wind max ${d.windMaxMs.toFixed(0)}m/s`
      )
      .join('\n');

    const m = input.metrics;
    const metricsText = [
      `Week 1 gem. temp: ${m.week1AvgTemp.toFixed(1)}°C, totaal regen: ${m.totalPrecipWeek1.toFixed(0)}mm`,
      `Week 2 gem. temp: ${m.week2AvgTemp.toFixed(1)}°C, totaal regen: ${m.totalPrecipWeek2.toFixed(0)}mm`,
      `Langste droge venster: ${m.longestDryWindowDays} dagen`,
      m.highUncertaintyDates.length > 0
        ? `Modellen oneens op: ${m.highUncertaintyDates.join(', ')}`
        : `Modellen redelijk eens over de hele periode`,
    ].join('\n');

    const prompt = `Je bent een meteoroloog die een fruitteler in Nederland kort op de hoogte houdt van de 14-daagse weersverwachting.

Locatie: ${input.stationName}

DAGELIJKSE DATA (gemiddeld over 4-5 weermodellen):
${daysText}

KERNCIJFERS:
${metricsText}

Schrijf een korte, vlotte Nederlandse samenvatting van 4 tot 6 zinnen. Focus op:
- Wat valt op of verandert (koeler/warmer wordend, fronten, omslag)
- Regenrisico's en droge vensters (relevant voor spuitvensters)
- Model-onzekerheid alleen noemen als die groot is op belangrijke dagen
- Vermijd opsommingen — schrijf in lopende zinnen
- Geen kopjes, geen markdown — gewone tekst die je in WhatsApp kunt lezen
- Begin direct met de inhoud (geen "Hierbij..." of "Hallo")
- Gebruik realistische taal: "lijkt", "wordt verwacht", "kans op"`;

    const result = await withTimeout(
      ai.generate({
        model: DEFAULT_MODEL,
        prompt,
        output: { schema: OutputSchema },
        config: { temperature: 0.5 },
      }),
      AI_TIMEOUT_MS,
      'summarizeWeatherForecast'
    );

    const out = result.output;
    if (!out?.summary) {
      throw new Error('Gemini returned no summary');
    }
    return out;
  }
);

/** Convenience wrapper for callers that don't want to deal with the flow object. */
export async function summarizeWeatherForecast(
  input: ForecastSummaryInput
): Promise<string> {
  const out = await summarizeWeatherForecastFlow(input);
  return out.summary;
}
