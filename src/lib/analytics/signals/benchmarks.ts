/**
 * Sector-benchmarks voor Nederlandse hardfruitteelt (appel/peer).
 *
 * Bronnen (indicatief, worden in UI expliciet als "indicatief" getoond):
 * - Fruitconsult bedrijfsvergelijkingen 2022-2024
 * - CBS Landbouwtelling fruit
 * - RVO Gebruiksnormen N/P
 * - NFO/GroentenFruit Huis rapporten
 *
 * Benchmarks zijn grove orde-van-grootte schattingen, geen harde targets.
 */

export interface SectorBenchmark {
  /** Gem. inputkosten per ha (spuitmiddelen + bladvoeding + strooi), € */
  inputCostPerHa: number;
  /** Gem. aantal bespuitingen per seizoen (maart-oktober) */
  spraysPerSeason: number;
  /** Gem. oogst in kg/ha */
  yieldKgPerHa: number;
  /** Gem. % Klasse I van totale oogst */
  classOnePct: number;
  /** Gem. organische stof bodem % */
  soilOrganicMatterPct: number;
  /** Gem. N-leverend vermogen kg/ha */
  nSupplyKgPerHa: number;
}

export const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  // Appel, professioneel, gemiddeld bedrijf (~5-15 ha)
  appel: {
    inputCostPerHa: 2400,
    spraysPerSeason: 22,
    yieldKgPerHa: 45000,
    classOnePct: 72,
    soilOrganicMatterPct: 3.2,
    nSupplyKgPerHa: 150,
  },
  // Peer, professioneel (Conference dominant)
  peer: {
    inputCostPerHa: 2100,
    spraysPerSeason: 18,
    yieldKgPerHa: 38000,
    classOnePct: 74,
    soilOrganicMatterPct: 3.0,
    nSupplyKgPerHa: 140,
  },
  // Fallback
  default: {
    inputCostPerHa: 2200,
    spraysPerSeason: 20,
    yieldKgPerHa: 40000,
    classOnePct: 72,
    soilOrganicMatterPct: 3.1,
    nSupplyKgPerHa: 145,
  },
};

/**
 * Streefwaarden voor bodemparameters (Nederlandse fruitteeltgronden).
 */
export const SOIL_TARGETS = {
  organicMatterPct: { min: 3.0, optimal: 4.0, max: 8.0 },
  pH: { min: 5.5, optimal: 6.3, max: 7.2 },
  pAl: { min: 25, optimal: 40, max: 80 },
  nSupplyKgPerHa: { min: 120, optimal: 160, max: 220 },
  clayPct: { min: 10, optimal: 25, max: 40 },
};

/**
 * Haal de juiste benchmark op basis van gewas (case-insensitief).
 */
export function getBenchmark(crop: string | null | undefined): SectorBenchmark {
  if (!crop) return SECTOR_BENCHMARKS.default;
  const c = crop.toLowerCase();
  if (c.includes('appel')) return SECTOR_BENCHMARKS.appel;
  if (c.includes('peer')) return SECTOR_BENCHMARKS.peer;
  return SECTOR_BENCHMARKS.default;
}

/**
 * Bepaal dominante gewas op basis van subpercelen (gewogen op hectares).
 */
export function getDominantCrop(
  subParcels: Array<{ crop: string; area: number }>
): string {
  const cropArea = new Map<string, number>();
  subParcels.forEach((sp) => {
    const c = (sp.crop || 'onbekend').toLowerCase();
    cropArea.set(c, (cropArea.get(c) || 0) + (sp.area || 0));
  });
  let max = 0;
  let dominant = 'default';
  cropArea.forEach((area, crop) => {
    if (area > max) {
      max = area;
      dominant = crop;
    }
  });
  return dominant;
}
