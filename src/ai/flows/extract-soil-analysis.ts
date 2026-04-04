/**
 * Genkit Flow: Extract Soil Analysis from Eurofins PDF
 * Uses Gemini multimodal to parse PDF → structured JSON
 */

import { ai } from '../genkit';
import { z } from 'zod';

// ============================================
// Schemas (flat om Gemini's nesting limiet te respecteren)
// ============================================

const ExtractInputSchema = z.object({
  pdfBase64: z.string(),
  filename: z.string().optional(),
});

const ExtractOutputSchema = z.object({
  // Metadata
  rapportIdentificatie: z.string().nullable().optional(),
  lab: z.string().nullable().optional(),
  datumMonstername: z.string().nullable().optional(),
  datumVerslag: z.string().nullable().optional(),
  geldigTot: z.number().nullable().optional(),
  bemonsterdeLaagCm: z.string().nullable().optional(),
  bemonsteringsmethode: z.string().nullable().optional(),
  grondsoortRapport: z.string().nullable().optional(),
  oppervlakteRapportHa: z.number().nullable().optional(),

  // Analyseresultaten
  nTotaalBodemvoorraadKgHa: z.number().nullable().optional(),
  nTotaalMgKg: z.number().nullable().optional(),
  cnRatio: z.number().nullable().optional(),
  nLeverendVermogenKgHa: z.number().nullable().optional(),
  pPlantbeschikbaarKgHa: z.number().nullable().optional(),
  pPlantbeschikbaarMgKg: z.number().nullable().optional(),
  pBodemvoorraadKgHa: z.number().nullable().optional(),
  pBodemvoorraadPAl: z.number().nullable().optional(),
  pBodemvoorraadP100g: z.number().nullable().optional(),
  pwGetal: z.number().nullable().optional(),
  cOrganischPct: z.number().nullable().optional(),
  organischeStofPct: z.number().nullable().optional(),
  kleiPercentage: z.number().nullable().optional(),
  bulkdichtheidKgM3: z.number().nullable().optional(),

  // Waarderingen als comma-separated (flat)
  waarderings: z.string().nullable().optional(), // "n_totaal:hoog:3140-4700,cn_ratio:laag:13-17,..."

  // Bemestingsadviezen als comma-separated (flat)
  bodemgerichtAdviezen: z.string().nullable().optional(), // "P2O5:0:4-jarig"
  gewasgerichtAdviezen: z.string().nullable().optional(), // "N:Appel:56,N:Peer:56,P2O5:Appel:10"
  opbrengstAannames: z.string().nullable().optional(), // "Appel:39.0,Peer:38.0"

  // RVO
  rvoPAlMgP2o5: z.number().nullable().optional(),
  rvoPCacl2MgKg: z.number().nullable().optional(),

  // Ruimtelijk (als comma-separated)
  hoekpuntenRdCsv: z.string().nullable().optional(), // "x1:y1,x2:y2,..."
  monsternamepuntenRdCsv: z.string().nullable().optional(),

  // Confidence
  confidence: z.number(),
});

// ============================================
// Prompt
// ============================================

const EXTRACTION_PROMPT = `Je bent een specialist in het extraheren van data uit Nederlandse bemestingsonderzoek-rapporten van laboratoria zoals Eurofins Agro.

Extraheer ALLE onderstaande velden uit het PDF-rapport. Geef waarden exact terug zoals in het rapport. Als een waarde niet in het rapport staat, gebruik null.

VELDEN om te extraheren:

METADATA:
- rapportIdentificatie: rapport nummer/ID
- lab: "eurofins_agro" of "koch_eurolab" of "overig"
- datumMonstername: YYYY-MM-DD formaat
- datumVerslag: YYYY-MM-DD formaat
- geldigTot: jaar (integer)
- bemonsterdeLaagCm: bijv. "0-25"
- bemonsteringsmethode: bijv. "Gestratificeerd"
- grondsoortRapport: zoals vermeld in rapport
- oppervlakteRapportHa: hectare (number)

ANALYSERESULTATEN:
- nTotaalBodemvoorraadKgHa: kg N/ha (berekende waarde pagina 1)
- nTotaalMgKg: mg N/kg (labwaarde pagina 3)
- cnRatio: C/N verhouding
- nLeverendVermogenKgHa: kg N/ha
- pPlantbeschikbaarKgHa: kg P/ha
- pPlantbeschikbaarMgKg: mg P/kg (CaCl2, labwaarde pagina 3)
- pBodemvoorraadKgHa: kg P/ha
- pBodemvoorraadPAl: mg P2O5/100g (P-Al getal)
- pBodemvoorraadP100g: mg P/100g
- pwGetal: mg P2O5/l (staat vaak in toelichting pagina 3)
- cOrganischPct: % C organisch
- organischeStofPct: % organische stof
- kleiPercentage: % < 2µm
- bulkdichtheidKgM3: kg/m³

WAARDERINGEN (uit de balkjes-tabel):
waarderings als komma-gescheiden string: "parameter:waardering:streeftraject"
Mogelijke waarderingen: laag, vrij_laag, goed, vrij_hoog, hoog
Voorbeeld: "n_totaal_bodemvoorraad:hoog:3140-4700,cn_ratio:laag:13-17,n_leverend_vermogen:goed:95-145"

BEMESTINGSADVIEZEN:
bodemgerichtAdviezen als: "nutrient:gift_kg_ha:periodiciteit" (komma-gescheiden)
gewasgerichtAdviezen als: "nutrient:gewas:gift_kg_ha" (komma-gescheiden)
opbrengstAannames als: "gewas:ton_ha" (komma-gescheiden)

RVO WAARDEN:
- rvoPAlMgP2o5: mg P2O5/100g (voor RVO doorgave)
- rvoPCacl2MgKg: mg P/kg (voor RVO doorgave)

RUIMTELIJK (optioneel):
hoekpuntenRdCsv: RD-coördinaten als "x1:y1,x2:y2,..."
monsternamepuntenRdCsv: idem

confidence: 0.0-1.0 gebaseerd op volledigheid/betrouwbaarheid van extractie

BELANGRIJK:
- Pagina 1 bevat BEREKENDE waarden (kg/ha). Pagina 3 bevat LABWAARDEN (mg/kg). Extraheer BEIDE.
- Waarderingen staan als visuele balkjes. Leid af uit positie: laag, vrij_laag, goed, vrij_hoog, hoog.
- Het Pw-getal staat vaak in de toelichting, niet in de hoofdtabel.
- De geldigheid staat als "kunt u t/m [jaar] gebruiken".`;

// ============================================
// Flow
// ============================================

export const extractSoilAnalysis = ai.defineFlow(
  {
    name: 'extractSoilAnalysis',
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

    return response.output;
  }
);

// ============================================
// Post-processing: unflatten CSV strings
// ============================================

export type ExtractionResult = {
  metadata: {
    rapportIdentificatie?: string | null;
    lab?: string | null;
    datumMonstername?: string | null;
    datumVerslag?: string | null;
    geldigTot?: number | null;
    bemonsterdeLaagCm?: string | null;
    bemonsteringsmethode?: string | null;
    grondsoortRapport?: string | null;
    oppervlakteRapportHa?: number | null;
  };
  analyseresultaten: {
    nTotaalBodemvoorraadKgHa?: number | null;
    nTotaalMgKg?: number | null;
    cnRatio?: number | null;
    nLeverendVermogenKgHa?: number | null;
    pPlantbeschikbaarKgHa?: number | null;
    pPlantbeschikbaarMgKg?: number | null;
    pBodemvoorraadKgHa?: number | null;
    pBodemvoorraadPAl?: number | null;
    pBodemvoorraadP100g?: number | null;
    pwGetal?: number | null;
    cOrganischPct?: number | null;
    organischeStofPct?: number | null;
    kleiPercentage?: number | null;
    bulkdichtheidKgM3?: number | null;
  };
  waarderingen?: Record<string, { waardering: string; streeftraject: string }>;
  bemestingsadviezen?: {
    bodemgericht?: { nutrient: string; giftKgHa: number; periodiciteit: string }[];
    gewasgericht?: { nutrient: string; gewas: string; giftKgHa: number }[];
    opbrengstAannameTonHa?: Record<string, number>;
  };
  rvo?: {
    pAlMgP2o5?: number | null;
    pCacl2MgKg?: number | null;
  };
  ruimtelijk?: {
    hoekpuntenRd?: number[][] | null;
    monsternamepuntenRd?: number[][] | null;
  };
  confidence: number;
  rawOutput: unknown;
};

/**
 * Wrapper die de flow aanroept en de platte output omzet naar gestructureerde data.
 */
export async function runSoilExtraction(input: { pdfBase64: string; filename?: string }): Promise<ExtractionResult> {
  const raw = await extractSoilAnalysis(input);

  // Parse waarderingen CSV
  const waarderingen: Record<string, { waardering: string; streeftraject: string }> = {};
  if (raw.waarderings) {
    for (const part of raw.waarderings.split(',')) {
      const [param, waardering, streef] = part.split(':');
      if (param && waardering) {
        waarderingen[param.trim()] = { waardering: waardering.trim(), streeftraject: streef?.trim() || '' };
      }
    }
  }

  // Parse bemestingsadviezen
  const bodemgericht: { nutrient: string; giftKgHa: number; periodiciteit: string }[] = [];
  if (raw.bodemgerichtAdviezen) {
    for (const part of raw.bodemgerichtAdviezen.split(',')) {
      const [nutrient, gift, period] = part.split(':');
      if (nutrient) bodemgericht.push({ nutrient: nutrient.trim(), giftKgHa: Number(gift) || 0, periodiciteit: period?.trim() || '' });
    }
  }

  const gewasgericht: { nutrient: string; gewas: string; giftKgHa: number }[] = [];
  if (raw.gewasgerichtAdviezen) {
    for (const part of raw.gewasgerichtAdviezen.split(',')) {
      const [nutrient, gewas, gift] = part.split(':');
      if (nutrient && gewas) gewasgericht.push({ nutrient: nutrient.trim(), gewas: gewas.trim(), giftKgHa: Number(gift) || 0 });
    }
  }

  const opbrengstAannames: Record<string, number> = {};
  if (raw.opbrengstAannames) {
    for (const part of raw.opbrengstAannames.split(',')) {
      const [gewas, ton] = part.split(':');
      if (gewas) opbrengstAannames[gewas.trim()] = Number(ton) || 0;
    }
  }

  // Parse RD coords
  const parseCoords = (csv: string | null | undefined): number[][] | null => {
    if (!csv) return null;
    return csv.split(',').map(p => {
      const [x, y] = p.split(':').map(Number);
      return [x, y];
    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  };

  return {
    metadata: {
      rapportIdentificatie: raw.rapportIdentificatie,
      lab: raw.lab,
      datumMonstername: raw.datumMonstername,
      datumVerslag: raw.datumVerslag,
      geldigTot: raw.geldigTot,
      bemonsterdeLaagCm: raw.bemonsterdeLaagCm,
      bemonsteringsmethode: raw.bemonsteringsmethode,
      grondsoortRapport: raw.grondsoortRapport,
      oppervlakteRapportHa: raw.oppervlakteRapportHa,
    },
    analyseresultaten: {
      nTotaalBodemvoorraadKgHa: raw.nTotaalBodemvoorraadKgHa,
      nTotaalMgKg: raw.nTotaalMgKg,
      cnRatio: raw.cnRatio,
      nLeverendVermogenKgHa: raw.nLeverendVermogenKgHa,
      pPlantbeschikbaarKgHa: raw.pPlantbeschikbaarKgHa,
      pPlantbeschikbaarMgKg: raw.pPlantbeschikbaarMgKg,
      pBodemvoorraadKgHa: raw.pBodemvoorraadKgHa,
      pBodemvoorraadPAl: raw.pBodemvoorraadPAl,
      pBodemvoorraadP100g: raw.pBodemvoorraadP100g,
      pwGetal: raw.pwGetal,
      cOrganischPct: raw.cOrganischPct,
      organischeStofPct: raw.organischeStofPct,
      kleiPercentage: raw.kleiPercentage,
      bulkdichtheidKgM3: raw.bulkdichtheidKgM3,
    },
    waarderingen: Object.keys(waarderingen).length > 0 ? waarderingen : undefined,
    bemestingsadviezen: (bodemgericht.length > 0 || gewasgericht.length > 0) ? {
      bodemgericht: bodemgericht.length > 0 ? bodemgericht : undefined,
      gewasgericht: gewasgericht.length > 0 ? gewasgericht : undefined,
      opbrengstAannameTonHa: Object.keys(opbrengstAannames).length > 0 ? opbrengstAannames : undefined,
    } : undefined,
    rvo: {
      pAlMgP2o5: raw.rvoPAlMgP2o5,
      pCacl2MgKg: raw.rvoPCacl2MgKg,
    },
    ruimtelijk: {
      hoekpuntenRd: parseCoords(raw.hoekpuntenRdCsv),
      monsternamepuntenRd: parseCoords(raw.monsternamepuntenRdCsv),
    },
    confidence: raw.confidence,
    rawOutput: raw,
  };
}
