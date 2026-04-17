/**
 * Genkit Flow: Extract Sorteerrapport (sorting report) from PDF
 *
 * Accepts a PDF from any sorter (Fruitmasters, CNB, The Greenery, ...)
 * and returns structured data:
 *   - partij metadata (variety, parcel hint, pick number, harvest year)
 *   - sortering_extern event (cost + per-size breakdown with prices)
 *   - afzet event (revenue + average price)
 *
 * Flat output schema to respect Gemini's nesting limit — post-processed
 * by `runSorteerrapportExtraction` into structured objects.
 */

import { ai } from '../genkit';
import { z } from 'zod';

// ============================================
// Input / Output schemas
// ============================================

const ExtractInputSchema = z.object({
  pdfBase64: z.string(),
  filename: z.string().optional(),
});

// Flat schema — Gemini has a 5-level nesting limit.
// Per-size rows are encoded as a pipe-separated CSV string.
const ExtractOutputSchema = z.object({
  // Sorter metadata
  sorter_name: z.string().nullable().optional(),
  order_date: z.string().nullable().optional(), // ISO YYYY-MM-DD
  order_number: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  supplier_reference: z.string().nullable().optional(),

  // Batch metadata
  variety: z.string().nullable().optional(),
  parcel_hint: z.string().nullable().optional(),
  sub_parcel_hint: z.string().nullable().optional(),
  plantation_year: z.number().nullable().optional(),
  pick_number: z.number().nullable().optional(), // 1-5
  pick_label_raw: z.string().nullable().optional(), // original text like "Tweede"

  // Totals
  total_kg: z.number().nullable().optional(),
  sort_cost_eur: z.number().nullable().optional(),
  total_revenue_eur: z.number().nullable().optional(),
  net_revenue_eur: z.number().nullable().optional(),
  avg_price_per_kg: z.number().nullable().optional(),

  // Buyer info (for afzet event)
  buyer_name: z.string().nullable().optional(),
  payment_date: z.string().nullable().optional(),

  // Per-size rows as CSV — each row: "size|class|kg|percentage|price_per_kg|revenue_eur"
  // Empty fields allowed. Rows separated by ";"
  sizes_csv: z.string().nullable().optional(),

  // Meta
  confidence: z.number(), // 0.0 - 1.0
  notes_for_user: z.string().nullable().optional(), // anything AI wants to flag
});

// ============================================
// Prompt
// ============================================

const EXTRACTION_PROMPT = `Je bent een specialist in het extraheren van data uit Nederlandse sorteerrapporten van fruitveilingen en sorteerders (bv. Fruitmasters, CNB, BZV, The Greenery).

Extraheer ALLE onderstaande velden uit het PDF-rapport. Als een veld niet aanwezig is, gebruik null.

SORTEERDER METADATA:
- sorter_name: naam van de sorteerder/veiling (bv. "Fruitmasters Veiling B.V.")
- order_date: datum van sortering/order in YYYY-MM-DD formaat
- order_number: order- of voorsorteerordernummer (bv. "49106")
- invoice_number: factuurnummer (bv. "2317342")
- supplier_reference: telernummer of klantnummer bij de sorteerder (bv. "80016")

PARTIJ METADATA (meestal in "Aangevoerd" / "Notitie" sectie):
- variety: ras (bv. "Fengapi", "Conference", "Elstar")
- parcel_hint: perceelnaam zoals genoemd in rapport (bv. "Vierwegen")
- sub_parcel_hint: subperceelnaam of blok (bv. "Fengapi")
- plantation_year: aanplantjaar als integer (bv. 2019). Kan staan als "Plantation: Fengapi 2019"
- pick_number: plukvolgnummer als integer (1-5)
- pick_label_raw: de originele tekst voor pluk (bv. "Tweede", "Eerste pluk")

PLUK-NAAR-NUMMER CONVERSIE:
  "Eerste"/"1e"/"eerste pluk" → 1
  "Tweede"/"2e"/"tweede pluk" → 2
  "Derde"/"3e" → 3
  "Vierde"/"4e" → 4
  "Vijfde"/"5e" → 5

TOTALEN (financieel):
- total_kg: totaal gesorteerd/aangevoerd in kg
- sort_cost_eur: totale sorteerkosten in euro (positief getal)
- total_revenue_eur: totale opbrengst in euro (positief getal)
- net_revenue_eur: netto opbrengst (opbrengst minus sorteerkosten)
- avg_price_per_kg: gemiddelde prijs per kg (middenprijs)

AFNEMER:
- buyer_name: naam afnemer, veiling of coöperatie (vaak hetzelfde als sorter_name)
- payment_date: uitbetaaldatum in YYYY-MM-DD, indien vermeld

SORTEERVERDELING (belangrijkste deel):
sizes_csv als één string met rijen gescheiden door ";". Elke rij heeft 6 velden gescheiden door "|":
  "size|class|kg|percentage|price_per_kg|revenue_eur"

  - size: maatklasse zoals "60-70 mm" of "70-75 mm"
  - class: "Klasse I", "Klasse II", "Klasse III" of "Industrie"
  - kg: hoeveelheid in kg (decimaal met punt, geen komma)
  - percentage: percentage van totaal (decimaal, zonder % teken)
  - price_per_kg: prijs per kg in euro (decimaal met punt)
  - revenue_eur: totale opbrengst voor deze rij in euro

VOORBEELD sizes_csv:
"60-70 mm|Klasse I|3439.1|67.24|0.66|2269.81;70-75 mm|Klasse I|723.7|14.15|0.81|586.20;65-95 mm|Klasse III|913.9|17.87|0.21|191.92"

Als een veld niet beschikbaar is binnen een rij, laat het leeg tussen de | tekens.
Gebruik bij voorkeur de "Aangekocht" / "Samenvatting aangekocht" tabel voor prijzen en opbrengst per regel.
Combineer meerdere prijsregels voor dezelfde maat+klasse tot één rij door te wegen.

META:
- confidence: jouw inschatting 0.0-1.0 hoe betrouwbaar de extractie is
- notes_for_user: korte opmerking (max 1 zin) als er iets opviel (bv. "meerdere partijen in één rapport gevonden", "sorteerkosten niet expliciet vermeld")

BELANGRIJK:
- Nederlandse getallen hebben komma als decimaal (3.439,1) — converteer naar 3439.1
- Duizendtallen-punt weghalen: "5.114,4" → 5114.4
- Percentages: "67,24 %" → 67.24
- Als pluk-info ontbreekt, laat pick_number null
- Als perceel-info ontbreekt, laat parcel_hint null
- Verzin GEEN waarden — als iets ontbreekt, geef null`;

// ============================================
// Flow
// ============================================

export const extractSorteerrapport = ai.defineFlow(
  {
    name: 'extractSorteerrapport',
    inputSchema: ExtractInputSchema,
    outputSchema: ExtractOutputSchema,
  },
  async (input) => {
    const response = await ai.generate({
      model: 'googleai/gemini-2.5-flash-lite',
      prompt: [
        { text: EXTRACTION_PROMPT },
        {
          media: {
            contentType: 'application/pdf',
            url: `data:application/pdf;base64,${input.pdfBase64}`,
          },
        },
      ],
      output: { schema: ExtractOutputSchema },
    });

    return response.output!;
  }
);

// ============================================
// Post-processing: unflatten CSV → structured object
// ============================================

export type ExtractedSorteerSize = {
  size?: string;
  class?: string;
  kg?: number;
  percentage?: number;
  price_per_kg?: number;
  revenue_eur?: number;
};

export type SorteerrapportExtraction = {
  sorter: {
    name?: string | null;
    order_date?: string | null;
    order_number?: string | null;
    invoice_number?: string | null;
    supplier_reference?: string | null;
  };
  batch: {
    variety?: string | null;
    parcel_hint?: string | null;
    sub_parcel_hint?: string | null;
    plantation_year?: number | null;
    pick_number?: number | null;
    pick_label_raw?: string | null;
  };
  financials: {
    total_kg?: number | null;
    sort_cost_eur?: number | null;
    total_revenue_eur?: number | null;
    net_revenue_eur?: number | null;
    avg_price_per_kg?: number | null;
  };
  buyer: {
    name?: string | null;
    payment_date?: string | null;
  };
  sizes: ExtractedSorteerSize[];
  confidence: number;
  notes_for_user?: string | null;
  rawOutput: unknown;
};

function parseSizeRow(row: string): ExtractedSorteerSize | null {
  const parts = row.split('|');
  if (parts.length < 2) return null;
  const num = (v: string | undefined): number | undefined => {
    if (!v) return undefined;
    const n = parseFloat(v.replace(',', '.').trim());
    return Number.isFinite(n) ? n : undefined;
  };
  const txt = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  return {
    size: txt(parts[0]),
    class: txt(parts[1]),
    kg: num(parts[2]),
    percentage: num(parts[3]),
    price_per_kg: num(parts[4]),
    revenue_eur: num(parts[5]),
  };
}

export async function runSorteerrapportExtraction(
  input: { pdfBase64: string; filename?: string }
): Promise<SorteerrapportExtraction> {
  const raw = await extractSorteerrapport(input);

  const sizes: ExtractedSorteerSize[] = [];
  if (raw.sizes_csv) {
    for (const rowStr of raw.sizes_csv.split(';')) {
      if (!rowStr.trim()) continue;
      const row = parseSizeRow(rowStr);
      if (row && (row.size || row.class || row.kg)) {
        sizes.push(row);
      }
    }
  }

  return {
    sorter: {
      name: raw.sorter_name,
      order_date: raw.order_date,
      order_number: raw.order_number,
      invoice_number: raw.invoice_number,
      supplier_reference: raw.supplier_reference,
    },
    batch: {
      variety: raw.variety,
      parcel_hint: raw.parcel_hint,
      sub_parcel_hint: raw.sub_parcel_hint,
      plantation_year: raw.plantation_year,
      pick_number: raw.pick_number,
      pick_label_raw: raw.pick_label_raw,
    },
    financials: {
      total_kg: raw.total_kg,
      sort_cost_eur: raw.sort_cost_eur,
      total_revenue_eur: raw.total_revenue_eur,
      net_revenue_eur: raw.net_revenue_eur,
      avg_price_per_kg: raw.avg_price_per_kg,
    },
    buyer: {
      name: raw.buyer_name,
      payment_date: raw.payment_date,
    },
    sizes,
    confidence: raw.confidence,
    notes_for_user: raw.notes_for_user ?? null,
    rawOutput: raw,
  };
}
