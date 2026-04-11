/**
 * Transform pipeline — Gemini herformulering van scraped content
 *
 * Receives raw ScrapedContent and produces 1+ KnowledgeArticleDraft objects.
 * Uses a strict CropNode tone-of-voice prompt: facts (products, dosages) verbatim,
 * everything else rewritten in our own words. NEVER stores source URLs/names.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';
import {
  KnowledgeArticleDraftSchema,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_TYPES,
  type KnowledgeArticleDraft,
  type ScrapedContent,
} from './types';
import { computePhenology } from './phenology';

const TRANSFORM_MODEL = 'googleai/gemini-2.5-flash-lite';

// ============================================
// System prompt
// ============================================

const TRANSFORM_SYSTEM_PROMPT = `Je bent een kennisredacteur voor CropNode, een platform voor Nederlandse fruittelers.

Je taak: transformeer de aangeleverde ruwe tekst naar één of meerdere CropNode-kennisartikelen.

== SKIP-REGELS (zeer belangrijk) ==
Retourneer EEN LEGE array { "articles": [] } als de brontekst GEEN teeltkennis is. Skip specifiek:
- Personeelsmededelingen (nieuwe medewerker, afscheid, jubileum, stagiaires)
- Evenementen-aankondigingen (open dag, boomgaardwandeling, lezing, studiereis, kerstborrel, excursie, bijeenkomst)
- Feestdagen-berichten (kerst, oud & nieuw, vakantie, zomerreces)
- Meta-berichten over het platform zelf (nieuwe functionaliteit, app-update, abonnement)
- Pure nieuwsberichten zonder teeltadvies (vergader-verslagen, persberichten, onderscheidingen)
- Reclame / commerciële aanbiedingen zonder kennis-inhoud

Als de tekst hoofdzakelijk zo'n meta-bericht is, retourneer { "articles": [] }. Twijfel niet.

== INHOUDELIJKE REGELS ==
1. Extraheer ALLEEN feitelijke teeltkennis: welk middel, welke dosering, welke timing, waarom, bij welk gewas
2. Herformuleer ALLES in je eigen woorden — kopieer NOOIT zinnen of alinea's uit de brontekst
3. Gebruik de CropNode tone of voice: praktisch, direct, helder, als een ervaren collega die meedenkt
4. Structureer elk artikel volgens dit template:
   - Korte inleiding (1-2 zinnen: wat is het probleem/onderwerp)
   - Aanpak (wat moet de teler doen)
   - Middelen & doseringen (exact overnemen — doseringen zijn feitelijk, niet auteursrechtelijk)
   - Timing (wanneer uitvoeren, bij welke omstandigheden)
   - Aandachtspunten (veiligheidstermijnen, resistentiemanagement, weersgevoeligheid)
5. Productnamen en werkzame stoffen EXACT overnemen — deze zijn feitelijk
6. Doseringen EXACT overnemen — deze zijn feitelijk
7. Verwijder alle meningen, marketingtaal, en stilistische elementen van de oorspronkelijke tekst
8. Schrijf in het Nederlands
9. Als de brontekst meerdere onderwerpen bevat, maak dan MEERDERE aparte artikelen (één per onderwerp)
10. Vermeld NOOIT de bron, organisatie, datum van origineel artikel, adviseursnamen, of website-URLs
11. Vermeld NOOIT woorden als "FruitConsult", adviseursnamen, of de naam van enige commerciële kennisbron

== METADATA ==
- title: beschrijvende titel (5-300 tekens), GEEN persoonsnamen of organisatienamen
- summary: korte samenvatting voor zoekresultaten (10-500 tekens)
- category: één van [${KNOWLEDGE_CATEGORIES.join(' | ')}]
  • ziekte = schimmelziektes (schurft, meeldauw, vruchtrot, stemphylium, etc.)
  • plaag = insecten/mijten/slakken/vogels/knaagdieren (fruitmot, bladvlo, wants, hazen, etc.)
  • abiotisch = vorst, hagel, droogte, zonnebrand, wind, zoutschade, bodemverdichting
  • bemesting = stikstof, kalium, bladbemesting, fertigatie, bodemleven
  • snoei = snoeitechniek per ras/fase
  • dunning = hand + chemisch dunnen
  • bewaring = koelcel, ULO, bewaarziektes (Scald, Gloeosporium), condities
  • certificering = wetgeving, Global GAP, Planet Proof, mestregels
  • algemeen = klimaat-breed teeltnieuws dat niet elders past
  • rassenkeuze = nieuwe rassen, raseigenschappen
  • bodem = bodemanalyse, grondwater, structuur
  • watermanagement = beregening, drainage, capillair
- subcategory: vrije tekst, specifiek onderwerp (bv "schurft", "meeldauw", "perenbladvlo", "vorstschade", "koelcel-gloeosporium")
- knowledge_type: één van [${KNOWLEDGE_TYPES.join(' | ')}]
- crops: lijst, één of meerdere van [appel, peer, kers, pruim, blauwe_bes]
- varieties: optioneel, specifieke rassen als relevant (Conference, Elstar, Jonagold, etc.)
- season_phases: één of meerdere van [rust, knopstadium, bloei, vruchtzetting, groei, oogst, nabloei]
- relevant_months: lijst van maandnummers (1-12) waarin de kennis bruikbaar is
- products_mentioned: alle genoemde productnamen
- is_evergreen: true bij tijdloze kennis (raseigenschappen, biologie), false bij seizoensgebonden advies
- valid_from: YYYY-MM-DD vanaf wanneer dit advies relevant is (bv "2026-03-01" voor voorjaarsadvies). Null als niet seizoensgebonden.
- valid_until: YYYY-MM-DD tot wanneer dit advies relevant is (bv "2026-10-31" voor seizoensadvies). Na deze datum is het advies verouderd. Null als tijdloos (is_evergreen=true). Vuistregel: seizoensadvies = geldig tot einde van dat seizoen (bv oogstadvies 2025 → valid_until "2025-12-31").
- harvest_year: het jaar waarop het advies gericht is (of het jaar van publicatie)

OUTPUT: JSON object met "articles" array. Bij meta-content: "articles": [].`;

// ============================================
// Output schema (Zod, used by Genkit)
// ============================================

const TransformOutputSchema = z.object({
  articles: z.array(KnowledgeArticleDraftSchema),
});

// ============================================
// Pre-filter: skip obvious non-knowledge content
// ============================================

/**
 * Keywords that indicate a scraped item contains no teeltadvies and should
 * be skipped before calling Gemini (saves cost + time).
 */
const SKIP_PATTERNS: RegExp[] = [
  // Personeel
  /\bnieuwe (office manager|medewerk|collega|adviseur|stagiair)/i,
  /\bafscheid (van|nemen)\b/i,
  /\bjubileum\b/i,
  /\b(begint|in dienst|start).+\b(bij|als)\b.+(fruitconsult|dlv|delphy|wur)/i,
  // Events
  /\bopen dag(en)?\b/i,
  /\bboomgaardwandeling/i,
  /\bstudiereis/i,
  /\bbijeenkomst(en)?\b.*\b(aankondig|inschrijv|uitnodig|aanmeld)/i,
  /\bexcursie/i,
  /\bkerstborrel\b/i,
  /\blezing (op|in|van)\b/i,
  /\bdemodag/i,
  /\bworkshop aanmeld/i,
  // Feestdagen
  /\bfijne (kerst|feestdagen|vakantie)/i,
  /\bprettige feestdagen/i,
  /\bzomerreces/i,
  /\bkerstwens/i,
  // Meta / platform
  /\bnieuwe functionaliteit (in|op) de app\b/i,
  /\babonnement vernieuw/i,
  // Nieuwsberichten zonder teeltkennis
  /\bontvangt koninklijke onderscheiding/i,
  /\boverlijdensbericht/i,
];

export interface PreFilterResult {
  skip: boolean;
  reason?: string;
}

/**
 * Check the scraped content's title + first 500 chars for obvious non-knowledge markers.
 * Returns { skip: true, reason } if the item should be skipped before the transform call.
 */
export function preFilterScrapedContent(content: ScrapedContent): PreFilterResult {
  const title = content.metadata.title ?? '';
  const body = content.rawText.slice(0, 500);
  const haystack = `${title}\n${body}`;

  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(haystack)) {
      return { skip: true, reason: `pre-filter: ${pattern.source}` };
    }
  }
  return { skip: false };
}

// ============================================
// Public API
// ============================================

export interface TransformInput {
  content: ScrapedContent;
}

export interface TransformResult {
  articles: KnowledgeArticleDraft[];
  /** Diagnostic data, never sent to DB */
  meta: {
    sourceCode: string;
    sourceIdentifier: string;
    publicationDate: string | null;
  };
}

/**
 * Run the transform pipeline on a single ScrapedContent item.
 * Returns an array of KnowledgeArticleDrafts (1 or more) with phenology metadata
 * pre-filled where possible.
 */
export async function transformContent(
  input: TransformInput,
): Promise<TransformResult> {
  const { content } = input;

  // Compute phenology hints to seed the prompt
  const phenology = computePhenology(
    content.metadata.date,
    `${content.metadata.title ?? ''} ${content.rawText.slice(0, 1500)}`,
  );

  const userPrompt = buildUserPrompt(content, phenology);

  const result = await callWithRetry(async () => {
    return ai.generate({
      model: TRANSFORM_MODEL,
      system: TRANSFORM_SYSTEM_PROMPT,
      prompt: userPrompt,
      output: {
        schema: TransformOutputSchema,
        format: 'json',
      },
      config: {
        temperature: 0.2,
      },
    });
  });

  const output = (result as { output?: unknown }).output;
  if (!output) {
    throw new Error('Transform: geen output van Gemini ontvangen');
  }

  const parsed = TransformOutputSchema.parse(output);

  // Post-process: enrich with phenology defaults + public source info
  const isPublic = content.metadata.isPublicSource === true;
  const publicRef = (content.metadata.publicSourceRef as string) ?? null;

  const enriched = parsed.articles.map((article) => {
    const next = { ...article };
    if (next.relevant_months.length === 0 && phenology.relevantMonths.length > 0) {
      next.relevant_months = phenology.relevantMonths;
    }
    if (next.season_phases.length === 0 && phenology.seasonPhase) {
      next.season_phases = [phenology.seasonPhase];
    }
    if (!next.harvest_year && phenology.bloomYear) {
      next.harvest_year = phenology.bloomYear;
    }
    // Final fallback for harvest_year
    if (!next.harvest_year) {
      const parsedDate = content.metadata.date ? new Date(content.metadata.date) : null;
      next.harvest_year =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.getUTCFullYear()
          : new Date().getUTCFullYear();
    }
    // Public source marking (WUR/Groen Kennisnet = public, bronvermelding toegestaan)
    if (isPublic) {
      next.is_public_source = true;
      next.public_source_ref = publicRef;
    }
    // Evergreen: GKN content is mostly timeless (biology, lifecycle)
    if (content.internalSourceCode === 'gkn') {
      next.is_evergreen = true;
    }
    return next;
  });

  return {
    articles: enriched,
    meta: {
      sourceCode: content.internalSourceCode,
      sourceIdentifier: content.sourceIdentifier,
      publicationDate: content.metadata.date ?? null,
    },
  };
}

// ============================================
// Helpers
// ============================================

function buildUserPrompt(
  content: ScrapedContent,
  phenology: ReturnType<typeof computePhenology>,
): string {
  const phenologyHint = phenology.phenologicalPhase !== 'onbekend'
    ? `Fenologische fase op publicatiedatum: ${phenology.phenologicalPhase}`
    : '';
  const monthsHint = phenology.relevantMonths.length > 0
    ? `Vermoedelijke relevante maand(en): ${phenology.relevantMonths.join(', ')}`
    : '';
  const titleHint = content.metadata.title
    ? `Onderwerp van bron: ${content.metadata.title}`
    : '';

  return [
    'Transformeer onderstaande ruwe tekst naar één of meerdere CropNode-kennisartikelen volgens de regels.',
    '',
    titleHint,
    phenologyHint,
    monthsHint,
    '',
    '--- RUWE TEKST ---',
    content.rawText.slice(0, 16000), // safety cap
    '--- EINDE RUWE TEKST ---',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = /429|rate|quota|RESOURCE_EXHAUSTED/i.test(message);
      if (attempt < maxAttempts && isRateLimit) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[transform] Rate limited (poging ${attempt}/${maxAttempts}), wacht ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (attempt < maxAttempts) {
        console.warn(
          `[transform] Fout (poging ${attempt}/${maxAttempts}): ${message}`,
        );
        await new Promise((r) => setTimeout(r, baseDelayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
