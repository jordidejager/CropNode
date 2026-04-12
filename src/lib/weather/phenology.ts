/**
 * Phenology Module — GDD-based predictions for fruit farming events.
 *
 * Uses Growing Degree Days (base 5°C for fruit) to predict:
 * - Apple/pear bloom timing (first bloom, full bloom, petal fall)
 * - Codling moth (fruitmot) flight start + egg hatch + spray timing
 * - Apple scab ascospore maturity progress (supplements disease model)
 *
 * All thresholds are based on published research for NW-European fruit growing.
 *
 * Sources:
 * - Bloei: Wageningen UR, "Bloeivoorspelling fruitgewassen" (GDD base 5°C from Jan 1)
 * - Fruitmot: Trapman (2005), codling moth biofix + flight model
 * - Schurft: A-scab model (already in disease-models/apple-scab/)
 */

// ============================================================================
// Types
// ============================================================================

export interface PhenologyEvent {
  id: string;
  name: string;
  nameNL: string;
  crop: 'appel' | 'peer' | 'both';
  gddThreshold: number;    // cumulative GDD base5 from Jan 1
  gddBase: 5 | 10;
  category: 'bloei' | 'insect' | 'groei';
  icon: string;             // emoji
  description: string;
  sprayAdvice?: string;     // optional spray timing advice
}

export interface PhenologyStatus {
  event: PhenologyEvent;
  currentGDD: number;
  progress: number;         // 0-100%
  estimatedDate: string | null;  // YYYY-MM-DD when threshold will be reached
  reached: boolean;
}

// ============================================================================
// Event definitions (NW-Europe, coastal climate zone)
// ============================================================================

export const PHENOLOGY_EVENTS: PhenologyEvent[] = [
  // === BLOEI (flowering) ===
  {
    id: 'appel_knopbreking',
    name: 'Bud break (apple)',
    nameNL: 'Knopbreking appel',
    crop: 'appel',
    gddThreshold: 90,
    gddBase: 5,
    category: 'bloei',
    icon: '🌿',
    description: 'Knoppen beginnen open te breken. Eerste groen zichtbaar.',
  },
  {
    id: 'appel_muizenoor',
    name: 'Mouse ear (apple)',
    nameNL: 'Muizenoor appel',
    crop: 'appel',
    gddThreshold: 140,
    gddBase: 5,
    category: 'bloei',
    icon: '🌱',
    description: 'BBCH 10. Eerste bladpunten zichtbaar. Start schurftgevoeligheid.',
    sprayAdvice: 'Eerste contactbespuiting overwegen (preventief tegen schurft).',
  },
  {
    id: 'appel_eerste_bloei',
    name: 'First bloom (apple)',
    nameNL: 'Eerste bloei appel',
    crop: 'appel',
    gddThreshold: 230,
    gddBase: 5,
    category: 'bloei',
    icon: '🌸',
    description: 'BBCH 61. Eerste bloemen open. Nachtvorstgevaar kritiek.',
  },
  {
    id: 'appel_volle_bloei',
    name: 'Full bloom (apple)',
    nameNL: 'Volle bloei appel',
    crop: 'appel',
    gddThreshold: 280,
    gddBase: 5,
    category: 'bloei',
    icon: '🌺',
    description: 'BBCH 65. Meeste bloemen open. Bestuiving loopt. Geen spuiten!',
  },
  {
    id: 'appel_bloemeinde',
    name: 'Petal fall (apple)',
    nameNL: 'Bloemeinde appel',
    crop: 'appel',
    gddThreshold: 350,
    gddBase: 5,
    category: 'bloei',
    icon: '🍃',
    description: 'BBCH 67-69. Bloemblaadjes vallen. Herstart bespuitingen.',
    sprayAdvice: 'Herstart fungicideprogramma na bloei (schurft + meeldauw).',
  },
  {
    id: 'peer_eerste_bloei',
    name: 'First bloom (pear)',
    nameNL: 'Eerste bloei peer',
    crop: 'peer',
    gddThreshold: 190,
    gddBase: 5,
    category: 'bloei',
    icon: '🌸',
    description: 'BBCH 61. Peer bloeit ~2 weken eerder dan appel. Extra vorstgevoelig.',
  },
  {
    id: 'peer_volle_bloei',
    name: 'Full bloom (pear)',
    nameNL: 'Volle bloei peer',
    crop: 'peer',
    gddThreshold: 240,
    gddBase: 5,
    category: 'bloei',
    icon: '🌺',
    description: 'BBCH 65. Volle bloei peer. Geen spuiten, bestuiving loopt.',
  },

  // === INSECTEN ===
  {
    id: 'fruitmot_vlucht',
    name: 'Codling moth first flight',
    nameNL: 'Fruitmot eerste vlucht',
    crop: 'appel',
    gddThreshold: 100,
    gddBase: 10,
    category: 'insect',
    icon: '🦋',
    description: 'Eerste vlinders verschijnen. Feromoonvallen ophangen.',
  },
  {
    id: 'fruitmot_ei_uitkomst',
    name: 'Codling moth egg hatch',
    nameNL: 'Fruitmot ei-uitkomst',
    crop: 'appel',
    gddThreshold: 220,
    gddBase: 10,
    category: 'insect',
    icon: '🐛',
    description: 'Eitjes komen uit. Rupsen boren in vruchten.',
    sprayAdvice: 'Insecticidebespuiting (bijv. Madex, Coragen) binnen 7 dagen plannen.',
  },
  {
    id: 'perenbladvlo',
    name: 'Pear psylla activity',
    nameNL: 'Perenbladvlo activiteit',
    crop: 'peer',
    gddThreshold: 60,
    gddBase: 5,
    category: 'insect',
    icon: '🪲',
    description: 'Eerste activiteit. Eerstejaars nymphen verschijnen.',
    sprayAdvice: 'Oliebespuiting of kaoline bij hoge druk overwegen.',
  },

  // === GROEI ===
  {
    id: 'junirui',
    name: 'June drop',
    nameNL: 'Junirui',
    crop: 'appel',
    gddThreshold: 600,
    gddBase: 5,
    category: 'groei',
    icon: '🍎',
    description: 'Natuurlijke vruchtrui. Dunningsbeslissingen nemen.',
  },
];

// ============================================================================
// Calculation
// ============================================================================

/**
 * Calculate phenology status for all events based on current cumulative GDD.
 *
 * @param cumulativeGDD5 - Cumulative GDD base 5°C from Jan 1
 * @param cumulativeGDD10 - Cumulative GDD base 10°C from Jan 1
 * @param dailyForecasts - Upcoming daily data with gdd_base5/gdd_base10
 * @param crop - Filter events for specific crop (or 'both')
 */
export function calculatePhenologyStatus(
  cumulativeGDD5: number,
  cumulativeGDD10: number,
  dailyForecasts: Array<{ date: string; gddBase5: number; gddBase10: number }>,
  crop?: 'appel' | 'peer'
): PhenologyStatus[] {
  const events = crop
    ? PHENOLOGY_EVENTS.filter(e => e.crop === crop || e.crop === 'both')
    : PHENOLOGY_EVENTS;

  return events.map(event => {
    const currentGDD = event.gddBase === 5 ? cumulativeGDD5 : cumulativeGDD10;
    const progress = Math.min(100, (currentGDD / event.gddThreshold) * 100);
    const reached = currentGDD >= event.gddThreshold;

    // Estimate when the threshold will be reached (if not yet)
    let estimatedDate: string | null = null;
    if (!reached && dailyForecasts.length > 0) {
      let runningGDD = currentGDD;
      for (const day of dailyForecasts) {
        runningGDD += event.gddBase === 5 ? day.gddBase5 : day.gddBase10;
        if (runningGDD >= event.gddThreshold) {
          estimatedDate = day.date;
          break;
        }
      }
    }

    return {
      event,
      currentGDD,
      progress,
      estimatedDate,
      reached,
    };
  });
}

/**
 * Calculate cumulative GDD from Jan 1 to today using daily data.
 */
export function calculateSeasonGDD(
  dailyData: Array<{ date: string; gddBase5: number | null; gddBase10: number | null }>
): { gdd5: number; gdd10: number } {
  let gdd5 = 0;
  let gdd10 = 0;

  for (const day of dailyData) {
    if (day.gddBase5 !== null) gdd5 += day.gddBase5;
    if (day.gddBase10 !== null) gdd10 += day.gddBase10;
  }

  return { gdd5, gdd10 };
}
