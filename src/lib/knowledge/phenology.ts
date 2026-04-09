/**
 * Phenology helper — port of phenology.py
 *
 * Maps a publication date to a phenological phase based on Conference pear
 * full bloom dates (F2 stage) at proeftuin Randwijk.
 *
 * Used by transform.ts to populate season_phases and relevant_months metadata.
 */

import type { SeasonPhase } from './types';

// ============================================
// Conference peer full bloom dates (Randwijk)
// ============================================
// Fallback constants — used when the phenology_reference table is unavailable
// (e.g. during bulk backfill or in standalone scripts). The runtime UI reads
// from the DB via phenology-service.ts, which can be updated without a deploy.

export const BLOOM_DATES: Record<number, string> = {
  2021: '2021-04-26',
  2022: '2022-04-12',
  2023: '2023-04-24',
  2024: '2024-04-03',
  2025: '2025-04-11',
  2026: '2026-04-08', // volle bloei 8 april 2026 (bevestigd)
};

// ============================================
// Detail-rich phase ranges (intern, voor relevant_months mapping)
// ============================================

interface PhaseRange {
  low: number;
  high: number;
  detail: string;        // detail-rich label (winterrust/snoeiperiode, oogst/plukperiode, etc.)
  base: SeasonPhase;     // mapping naar de DB enum (rust|knopstadium|bloei|...)
}

const PHASE_RANGES: PhaseRange[] = [
  { low: -999, high: -60, detail: 'winterrust', base: 'rust' },
  { low: -60,  high: -30, detail: 'knopzwelling', base: 'knopstadium' },
  { low: -30,  high: -15, detail: 'groen-puntje', base: 'knopstadium' },
  { low: -15,  high:  -5, detail: 'muizenoor', base: 'knopstadium' },
  { low:  -5,  high:   5, detail: 'volle-bloei', base: 'bloei' },
  { low:   5,  high:  15, detail: 'bloembladval', base: 'bloei' },
  { low:  15,  high:  35, detail: 'vruchtzetting', base: 'vruchtzetting' },
  { low:  35,  high:  65, detail: 'junirui', base: 'groei' },
  { low:  65,  high: 130, detail: 'celstrekking', base: 'groei' },
  { low: 130,  high: 170, detail: 'oogst', base: 'oogst' },
  { low: 170,  high: 220, detail: 'bladval', base: 'nabloei' },
  { low: 220,  high: 999, detail: 'winterrust', base: 'rust' },
];

const KEYWORD_REFINEMENTS: Record<string, { keywords: string[]; refined: string }> = {
  winterrust: {
    keywords: ['snoei', 'snoeien', 'wintersnoei'],
    refined: 'winterrust/snoeiperiode',
  },
  knopzwelling: {
    keywords: ['koperbespuiting', 'koper', 'schurft preventie'],
    refined: 'knopzwelling/preventie',
  },
  'volle-bloei': {
    keywords: ['bestuiving', 'bestuivers', 'bijen'],
    refined: 'volle-bloei/bestuiving',
  },
  oogst: {
    keywords: ['pluk', 'pluktijdstip', 'streeflading', 'oogstklaar'],
    refined: 'oogst/plukperiode',
  },
};

const NL_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, maart: 3,
  apr: 4, mei: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

// ============================================
// Public API
// ============================================

/** Parse Dutch / numeric date strings into ISO YYYY-MM-DD */
export function parseDate(input: string | undefined | null): Date | null {
  if (!input || input.toLowerCase() === 'onbekend') return null;
  const trimmed = input.trim();

  // ISO YYYY-MM-DD
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // YYYY/MM/DD
  m = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Dutch month name: "26 feb 2026"
  m = trimmed.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
  if (m) {
    const monthKey = m[2].slice(0, 3).toLowerCase();
    const month = NL_MONTHS[monthKey];
    if (month) {
      const d = new Date(Date.UTC(+m[3], month - 1, +m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

export interface PhenologyResult {
  bloomYear: number | null;
  daysRelativeToBloom: number | null;
  /** Detail-rich phase label (e.g. "groen-puntje", "oogst/plukperiode") */
  phenologicalPhase: string;
  /** Mapped to the DB season_phases enum */
  seasonPhase: SeasonPhase | null;
  /** Months this article is most relevant for */
  relevantMonths: number[];
}

/**
 * Compute phenology metadata for an article.
 *
 * @param publicationDate The article's publication date (any common format)
 * @param textForRefinement Title + first chunk of body text for keyword refinement
 */
export function computePhenology(
  publicationDate: string | undefined | null,
  textForRefinement = '',
): PhenologyResult {
  const pubDate = parseDate(publicationDate);
  if (!pubDate) {
    return {
      bloomYear: null,
      daysRelativeToBloom: null,
      phenologicalPhase: 'onbekend',
      seasonPhase: null,
      relevantMonths: [],
    };
  }

  const year = pubDate.getUTCFullYear();
  const bloomIso = BLOOM_DATES[year];
  if (!bloomIso) {
    return {
      bloomYear: year,
      daysRelativeToBloom: null,
      phenologicalPhase: 'onbekend',
      seasonPhase: null,
      relevantMonths: [pubDate.getUTCMonth() + 1],
    };
  }

  const bloomDate = new Date(bloomIso);
  const daysRel = Math.floor(
    (pubDate.getTime() - bloomDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Find base phase
  const range = PHASE_RANGES.find((r) => daysRel >= r.low && daysRel < r.high);
  if (!range) {
    return {
      bloomYear: year,
      daysRelativeToBloom: daysRel,
      phenologicalPhase: 'onbekend',
      seasonPhase: null,
      relevantMonths: [pubDate.getUTCMonth() + 1],
    };
  }

  // Keyword refinement
  let detailLabel = range.detail;
  const refinement = KEYWORD_REFINEMENTS[range.detail];
  if (refinement) {
    const haystack = textForRefinement.toLowerCase().slice(0, 1000);
    if (refinement.keywords.some((kw) => haystack.includes(kw))) {
      detailLabel = refinement.refined;
    }
  }

  return {
    bloomYear: year,
    daysRelativeToBloom: daysRel,
    phenologicalPhase: detailLabel,
    seasonPhase: range.base,
    relevantMonths: relevantMonthsFromDays(daysRel, bloomDate),
  };
}

/**
 * Compute the months this article is relevant for.
 * Use a ±2 week window around the publication date as a baseline,
 * expanded to multiple months for evergreen-ish phases.
 */
function relevantMonthsFromDays(daysRel: number, bloomDate: Date): number[] {
  // Reconstruct the publication date
  const pub = new Date(bloomDate.getTime() + daysRel * 24 * 60 * 60 * 1000);
  const month = pub.getUTCMonth() + 1;

  // Most articles: relevant for current month + adjacent ones
  const months = new Set<number>([month]);
  if (daysRel < 0) {
    // Pre-bloom: also include the next month
    months.add(((month) % 12) + 1);
  } else if (daysRel > 60) {
    // Post-bloom growth: keep current + previous month
    months.add(((month + 10) % 12) + 1);
  }
  return Array.from(months).sort((a, b) => a - b);
}
