/**
 * ValidationService voor CropNode - Slimme Invoer 2.0
 *
 * Valideert bespuitingen tegen CTGB-wetgeving met focus op:
 * 1. Cumulatieve werkzame stof limieten per seizoen
 * 2. Teelt-hiërarchie voor toelating
 * 3. Dosering checks
 * 4. Interval en veiligheidstermijn checks
 */

import type { Parcel, ParcelHistoryEntry, CtgbProduct, CtgbGebruiksvoorschrift } from './types';
import { resolveAlias } from './validation/product-matcher';

// ============================================
// Types
// ============================================

export type ValidationFlagType = 'error' | 'warning' | 'info';

export type ValidationFlag = {
  type: ValidationFlagType;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
};

export type ValidationResult = {
  isValid: boolean;
  flags: ValidationFlag[];
  matchedTargets?: Map<string, MatchedTarget>; // productName -> matched target info
};

export type MatchedTarget = {
  targetOrganism: string;
  isAssumed: boolean; // true = automatisch bepaald, false = uit gebruikersinvoer
  voorschrift: CtgbGebruiksvoorschrift;
};

type ValidationContext = {
  parcel: Parcel;
  crop: string; // Extracted crop (from parcel.crop or subParcels)
  product: CtgbProduct;
  dosage: number;
  unit: string;
  applicationDate: Date;
  seasonHistory: ParcelHistoryEntry[];
  ctgbProducts: Map<string, CtgbProduct>;
  targetReason?: string; // Doelorganisme uit gebruikersinvoer
  matchedTarget?: MatchedTarget; // Resultaat van target matching
};

type Season = {
  start: Date;
  end: Date;
};

// ============================================
// Crop Hierarchy
// ============================================

/**
 * Teelt hiërarchie mapping: specifiek gewas -> toegestane bredere groepen
 * CTGB gebruikt deze hiërarchie voor toelatingsbepaling
 */
const CROP_HIERARCHY: Record<string, string[]> = {
  // Pitvruchten
  'appel': ['appel', 'appels', 'pitvruchten', 'pitfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'peer': ['peer', 'peren', 'pitvruchten', 'pitfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'kweepeer': ['kweepeer', 'kwee', 'pitvruchten', 'vruchtbomen', 'fruitgewassen'],

  // Steenvruchten
  'kers': ['kers', 'kersen', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'pruim': ['pruim', 'pruimen', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen', 'fruit'],
  'abrikoos': ['abrikoos', 'abrikozen', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen'],
  'perzik': ['perzik', 'perziken', 'steenvruchten', 'steenfruit', 'vruchtbomen', 'fruitgewassen'],

  // Kleinfruit
  'aardbei': ['aardbei', 'aardbeien', 'kleinfruit', 'zachtfruit', 'fruitgewassen'],
  'framboos': ['framboos', 'frambozen', 'kleinfruit', 'zachtfruit', 'fruitgewassen'],
  'blauwe bes': ['blauwe bes', 'blauwe bessen', 'kleinfruit', 'zachtfruit', 'fruitgewassen'],
  'braam': ['braam', 'bramen', 'kleinfruit', 'zachtfruit', 'fruitgewassen'],

  // Druiven
  'druif': ['druif', 'druiven', 'wijnbouw', 'fruitgewassen'],

  // Groenten
  'aardappel': ['aardappel', 'aardappelen', 'knolgewassen', 'akkerbouw'],
  'ui': ['ui', 'uien', 'bolgewassen', 'groenten', 'akkerbouw'],
  'prei': ['prei', 'preien', 'bolgewassen', 'groenten'],
  'kool': ['kool', 'kolen', 'koolgewassen', 'groenten'],
  'sla': ['sla', 'bladgroenten', 'groenten'],
  'spinazie': ['spinazie', 'bladgroenten', 'groenten'],
  'wortel': ['wortel', 'wortelen', 'wortelgewassen', 'groenten'],
  'tomaat': ['tomaat', 'tomaten', 'vruchtgroenten', 'groenten'],
  'paprika': ['paprika', 'paprika\'s', 'vruchtgroenten', 'groenten'],
  'komkommer': ['komkommer', 'komkommers', 'vruchtgroenten', 'groenten'],

  // Granen
  'tarwe': ['tarwe', 'granen', 'akkerbouw'],
  'gerst': ['gerst', 'granen', 'akkerbouw'],
  'haver': ['haver', 'granen', 'akkerbouw'],
  'mais': ['mais', 'granen', 'akkerbouw'],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Normaliseer gewasnaam voor fuzzy matching
 * Strip meervoudsvormen ('s', 'en') en maak lowercase
 */
function normalizeGewasNaam(naam: string): string[] {
  const normalized = naam.toLowerCase().trim();
  const variants: string[] = [normalized];

  // Strip Nederlandse meervoudsvormen
  if (normalized.endsWith('en')) {
    // 'appelen' -> 'appel', 'tomaten' -> 'tomaat', etc.
    variants.push(normalized.slice(0, -2));
    // Sommige woorden hebben 'en' als meervoud na wegval van letter: 'aardappelen' -> 'aardappel'
    variants.push(normalized.slice(0, -1)); // 'appelen' -> 'appele' (voor edge cases)
  }
  if (normalized.endsWith('s') && !normalized.endsWith('es')) {
    // 'appels' -> 'appel', 'peren' -> 'per' (already handled above)
    variants.push(normalized.slice(0, -1));
  }
  if (normalized.endsWith("'s")) {
    // "paprika's" -> "paprika"
    variants.push(normalized.slice(0, -2));
  }

  // Voeg ook meervoud toe voor enkelvoud input
  variants.push(normalized + 's');
  variants.push(normalized + 'en');

  return [...new Set(variants)]; // Unieke waardes
}

/**
 * Fuzzy match voor gewasnamen
 * Matcht 'Appels' met 'Appel', case-insensitive
 */
function fuzzyMatchGewas(parcelCrop: string, allowedCrop: string): boolean {
  const parcelVariants = normalizeGewasNaam(parcelCrop);
  const allowedVariants = normalizeGewasNaam(allowedCrop);

  // Check of een van de varianten matcht
  for (const pv of parcelVariants) {
    for (const av of allowedVariants) {
      if (pv === av) return true;
      if (pv.includes(av) || av.includes(pv)) return true;
    }
  }

  return false;
}

/**
 * Bepaal het huidige seizoen (kalenderjaar)
 */
export function getCurrentSeason(date: Date): Season {
  const year = date.getFullYear();
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),     // 1 januari 00:00
    end: new Date(year, 11, 31, 23, 59, 59, 999) // 31 december 23:59
  };
}

/**
 * Vind het juiste gebruiksvoorschrift voor een gewas
 * Houdt rekening met de teelt-hiërarchie en fuzzy matching
 */
export function findGebruiksvoorschrift(
  product: CtgbProduct,
  parcelCrop: string | undefined
): CtgbGebruiksvoorschrift | null {
  // Defensive check: return null if no crop
  if (!parcelCrop) {
    return null;
  }

  if (!product.gebruiksvoorschriften || product.gebruiksvoorschriften.length === 0) {
    return null;
  }

  const normalizedCrop = parcelCrop.toLowerCase().trim();

  // Probeer eerst de crop hiërarchie met genormaliseerde variant
  const parcelVariants = normalizeGewasNaam(normalizedCrop);
  let cropHierarchy: string[] = [normalizedCrop];

  // Zoek de hiërarchie voor elke variant van het gewas
  for (const variant of parcelVariants) {
    if (CROP_HIERARCHY[variant]) {
      cropHierarchy = CROP_HIERARCHY[variant];
      break;
    }
  }

  // Zoek naar een match in de gebruiksvoorschriften
  for (const voorschrift of product.gebruiksvoorschriften) {
    if (!voorschrift.gewas) continue;

    const allowedCrops = voorschrift.gewas.toLowerCase();

    // Check directe match of hiërarchie match
    for (const cropVariant of cropHierarchy) {
      if (allowedCrops.includes(cropVariant)) {
        return voorschrift;
      }
    }

    // Fuzzy match: check of parcelCrop fuzzy matcht met gewas
    if (fuzzyMatchGewas(parcelCrop, voorschrift.gewas)) {
      return voorschrift;
    }
  }

  return null;
}

/**
 * Fuzzy match voor doelorganisme
 * Vergelijkt gebruikersinvoer (bijv. "luis") met toegelaten doelen (bijv. "Groene appelbladluis")
 */
function fuzzyMatchTarget(userInput: string, allowedTarget: string): boolean {
  const normalizedInput = userInput.toLowerCase().trim();
  const normalizedTarget = allowedTarget.toLowerCase();

  // Direct match
  if (normalizedTarget.includes(normalizedInput)) return true;

  // Common synonyms/abbreviations mapping
  const synonyms: Record<string, string[]> = {
    'luis': ['bladluis', 'appelbladluis', 'pereluis', 'bloedluis', 'wollige luis'],
    'bladluis': ['luis', 'appelbladluis', 'groene appelbladluis', 'roze appelbladluis'],
    'schurft': ['appelschurft', 'pereschurft', 'venturia'],
    'meeldauw': ['echte meeldauw', 'valse meeldauw', 'witziekte'],
    'mot': ['vruchtmot', 'fruitmot', 'appelmot'],
    'spint': ['fruitspint', 'rode spin', 'spintmijt'],
    'roest': ['roestschimmel'],
    'trips': ['tripsen'],
  };

  // Check synonyms
  const inputSynonyms = synonyms[normalizedInput] || [];
  for (const syn of inputSynonyms) {
    if (normalizedTarget.includes(syn)) return true;
  }

  // Reverse check: if target contains a base form that matches input
  for (const [base, syns] of Object.entries(synonyms)) {
    if (normalizedTarget.includes(base) && syns.some(s => normalizedInput.includes(s))) {
      return true;
    }
  }

  return false;
}

/**
 * Vind het juiste gebruiksvoorschrift met doelorganisme matching
 * Scenario A: Gebruiker geeft targetReason -> fuzzy match met toegelaten doelen
 * Scenario B: Geen targetReason -> selecteer "hoofddoel" (meest voorkomend/breedste toelating)
 */
export function findGebruiksvoorschriftWithTarget(
  product: CtgbProduct,
  parcelCrop: string | undefined,
  targetReason?: string
): { voorschrift: CtgbGebruiksvoorschrift; matchedTarget: MatchedTarget } | null {
  // Defensive check: return null if no crop or no product data
  if (!parcelCrop) {
    console.log(`[findGebruiksvoorschriftWithTarget] No parcelCrop provided for product ${product?.naam}`);
    return null;
  }

  if (!product.gebruiksvoorschriften || product.gebruiksvoorschriften.length === 0) {
    return null;
  }

  const normalizedCrop = parcelCrop.toLowerCase().trim();
  console.log(`[findGebruiksvoorschriftWithTarget] Checking: gewas="${normalizedCrop}" for product="${product.naam}", targetReason="${targetReason || 'none'}"`);

  // Probeer de crop hiërarchie met genormaliseerde varianten
  const parcelVariants = normalizeGewasNaam(normalizedCrop);
  let cropHierarchy: string[] = [normalizedCrop];

  for (const variant of parcelVariants) {
    if (CROP_HIERARCHY[variant]) {
      cropHierarchy = CROP_HIERARCHY[variant];
      break;
    }
  }

  // Filter voorschriften die matchen met het gewas (incl. fuzzy matching)
  const cropMatchedVoorschriften = product.gebruiksvoorschriften.filter(voorschrift => {
    if (!voorschrift.gewas) return false;
    const allowedCrops = voorschrift.gewas.toLowerCase();

    // Check hiërarchie match
    if (cropHierarchy.some(crop => allowedCrops.includes(crop))) {
      return true;
    }

    // Check fuzzy match
    return fuzzyMatchGewas(parcelCrop, voorschrift.gewas);
  });

  if (cropMatchedVoorschriften.length === 0) {
    return null;
  }

  // Scenario A: Gebruiker geeft targetReason
  if (targetReason) {
    for (const voorschrift of cropMatchedVoorschriften) {
      const doelOrganisme = voorschrift.doelorganisme;
      if (doelOrganisme && fuzzyMatchTarget(targetReason, doelOrganisme)) {
        return {
          voorschrift,
          matchedTarget: {
            targetOrganism: doelOrganisme,
            isAssumed: false,
            voorschrift,
          },
        };
      }
    }
    // Geen exacte match gevonden - val terug op eerste match met warning
  }

  // Scenario B: Auto-detect "hoofddoel"
  // Strategie: Kies het doel met de hoogste max dosering (breedste toelating)
  // of het eerste voorschrift als er geen dosering info is
  let bestVoorschrift = cropMatchedVoorschriften[0];
  let highestDosage = 0;

  for (const voorschrift of cropMatchedVoorschriften) {
    if (voorschrift.dosering) {
      const parsed = parseDosering(voorschrift.dosering);
      if (parsed && parsed.value > highestDosage) {
        highestDosage = parsed.value;
        bestVoorschrift = voorschrift;
      }
    }
  }

  const targetName = bestVoorschrift.doelorganisme || 'Algemeen';
  return {
    voorschrift: bestVoorschrift,
    matchedTarget: {
      targetOrganism: `${targetName} (automatisch bepaald)`,
      isAssumed: true,
      voorschrift: bestVoorschrift,
    },
  };
}

/**
 * Check of een gewas toegelaten is voor een product (met hiërarchie)
 */
export function isCropAllowed(parcelCrop: string, allowedCropsString: string): boolean {
  const normalizedParcelCrop = parcelCrop.toLowerCase().trim();
  const allowedList = allowedCropsString.toLowerCase().split(',').map(c => c.trim());

  // Direct match
  if (allowedList.some(allowed => allowed.includes(normalizedParcelCrop))) {
    return true;
  }

  // Hiërarchie match
  const hierarchy = CROP_HIERARCHY[normalizedParcelCrop] || [];
  return hierarchy.some(h => allowedList.some(a => a.includes(h)));
}

/**
 * Parse dosering string naar nummer en eenheid
 * Ondersteunt: "1,5 l/ha", "2.0 kg/ha", "500 ml/ha", "0.5-1.0 l/ha"
 */
export function parseDosering(doseringStr: string): { value: number; unit: string } | null {
  if (!doseringStr) return null;

  // Range pattern: "0.5-1.0 l/ha" -> neem maximum
  const rangeMatch = doseringStr.match(/(\d+[,.]?\d*)\s*[-–]\s*(\d+[,.]?\d*)\s*(l|kg|ml|g)/i);
  if (rangeMatch) {
    return {
      value: parseFloat(rangeMatch[2].replace(',', '.')),
      unit: rangeMatch[3].toLowerCase()
    };
  }

  // Simple pattern: "1,5 l/ha" or "2 kg/ha"
  const simpleMatch = doseringStr.match(/(\d+[,.]?\d*)\s*(l|kg|ml|g)/i);
  if (simpleMatch) {
    return {
      value: parseFloat(simpleMatch[1].replace(',', '.')),
      unit: simpleMatch[2].toLowerCase()
    };
  }

  return null;
}

/**
 * Parse interval string naar aantal dagen
 * Ondersteunt: "min. 7 dagen", "14 dagen", "2 weken"
 */
export function parseInterval(intervalStr: string): number | null {
  if (!intervalStr) return null;

  // Dagen pattern
  const dagenMatch = intervalStr.match(/(\d+)\s*dag/i);
  if (dagenMatch) return parseInt(dagenMatch[1], 10);

  // Weken pattern
  const wekenMatch = intervalStr.match(/(\d+)\s*we/i);
  if (wekenMatch) return parseInt(wekenMatch[1], 10) * 7;

  return null;
}

/**
 * Bereken dagen tussen twee datums
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(date2.getTime() - date1.getTime()) / oneDay);
}

// ============================================
// Validation Checks
// ============================================

/**
 * PRIORITEIT 1: Check cumulatieve werkzame stof limieten
 * Dit is de cruciale check die de som van ALLE middelen met dezelfde werkzame stof telt
 */
async function checkActiveSubstanceCumulation(ctx: ValidationContext): Promise<ValidationFlag[]> {
  const flags: ValidationFlag[] = [];
  const newProductSubstances = ctx.product.werkzameStoffen || [];

  if (newProductSubstances.length === 0) {
    return flags;
  }

  // Tel toepassingen per werkzame stof dit seizoen
  const substanceCount: Map<string, { count: number; products: string[] }> = new Map();

  for (const historyEntry of ctx.seasonHistory) {
    // Zoek het CTGB product voor deze historische entry
    const historicProduct = ctx.ctgbProducts.get(historyEntry.product.toLowerCase());

    // Keuze: negeren als CTGB product niet gevonden (veiligste optie)
    if (!historicProduct || !historicProduct.werkzameStoffen) continue;

    // Check welke werkzame stoffen overlappen met het nieuwe middel
    for (const substance of historicProduct.werkzameStoffen) {
      const normalizedSubstance = substance.toLowerCase();

      if (newProductSubstances.some(s => s.toLowerCase() === normalizedSubstance)) {
        const current = substanceCount.get(normalizedSubstance) || { count: 0, products: [] };
        current.count += 1;
        if (!current.products.includes(historicProduct.naam)) {
          current.products.push(historicProduct.naam);
        }
        substanceCount.set(normalizedSubstance, current);
      }
    }
  }

  // Vind het gebruiksvoorschrift voor maxToepassingen
  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.crop);
  const maxToepassingen = voorschrift?.maxToepassingen;

  if (maxToepassingen) {
    for (const [substance, data] of substanceCount) {
      // +1 omdat we de nieuwe toepassing ook meetellen
      const totalAfterApplication = data.count + 1;

      if (totalAfterApplication > maxToepassingen) {
        flags.push({
          type: 'error',
          message: `Wettelijke limiet ${substance} overschreden: al ${data.count}x toegepast dit seizoen (max ${maxToepassingen}x toegestaan). Eerdere middelen: ${data.products.join(', ')}.`,
          field: 'products',
          details: {
            substance,
            currentCount: data.count,
            max: maxToepassingen,
            previousProducts: data.products
          }
        });
      } else if (totalAfterApplication === maxToepassingen) {
        flags.push({
          type: 'warning',
          message: `Let op: na deze toepassing is de limiet voor ${substance} bereikt (${totalAfterApplication}/${maxToepassingen} toepassingen).`,
          field: 'products',
          details: { substance, countAfter: totalAfterApplication, max: maxToepassingen }
        });
      } else if (data.count >= maxToepassingen - 2) {
        flags.push({
          type: 'info',
          message: `${substance} nadert limiet: ${data.count + 1}/${maxToepassingen} toepassingen na deze bespuiting.`,
          field: 'products',
          details: { substance, countAfter: data.count + 1, max: maxToepassingen }
        });
      }
    }
  }

  return flags;
}

/**
 * Verzamel en formatteer alle toegelaten gewassen voor een product
 * - Dedupliceer: elke naam komt maar 1x voor
 * - Sorteer: alfabetische volgorde
 * - Formatteer: nette comma-separated string
 */
function formatAllowedCropsList(voorschriften: CtgbGebruiksvoorschrift[]): string {
  // Verzamel alle gewasnamen
  const allCrops: string[] = [];
  for (const v of voorschriften) {
    if (v.gewas) {
      // Split op comma's als er meerdere gewassen in een string staan
      const crops = v.gewas.split(',').map(c => c.trim()).filter(c => c.length > 0);
      allCrops.push(...crops);
    }
  }

  if (allCrops.length === 0) {
    return 'onbekend';
  }

  // Dedupliceer (case-insensitive, maar behoud originele casing van eerste voorkomen)
  const seen = new Map<string, string>();
  for (const crop of allCrops) {
    const key = crop.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, crop);
    }
  }

  // Sorteer alfabetisch en join
  const uniqueCrops = Array.from(seen.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase(), 'nl')
  );

  return uniqueCrops.join(', ');
}

/**
 * PRIORITEIT 2: Check of het middel toegelaten is voor dit gewas
 * Gebruikt fuzzy matching voor enkelvoud/meervoud (bijv. 'Appels' matcht met 'Appel')
 */
function checkCropAllowed(ctx: ValidationContext): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  if (!ctx.product.gebruiksvoorschriften || ctx.product.gebruiksvoorschriften.length === 0) {
    flags.push({
      type: 'warning',
      message: `Geen gebruiksvoorschriften gevonden voor ${ctx.product.naam}. Kan toelating niet controleren.`,
      field: 'products'
    });
    return flags;
  }

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.crop);

  if (!voorschrift) {
    // Verzamel en formatteer alle toegelaten gewassen (gedepliceerd en gesorteerd)
    const allowedCropsFormatted = formatAllowedCropsList(ctx.product.gebruiksvoorschriften);

    flags.push({
      type: 'error',
      message: `Het gewas '${ctx.crop}' wordt niet ondersteund door ${ctx.product.naam}. Dit middel is toegelaten voor: ${allowedCropsFormatted}.`,
      field: 'products',
      details: {
        crop: ctx.crop,
        allowedCrops: allowedCropsFormatted
      }
    });
  }

  return flags;
}

/**
 * PRIORITEIT 3: Check dosering tegen alle relevante voorschriften voor dit gewas
 * Evalueert of de dosering past binnen EEN van de toegelaten doelen.
 */
function checkDosage(ctx: ValidationContext): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  // Skip validation when dosage is 0 (not yet specified by user)
  if (ctx.dosage === 0) {
    return flags;
  }

  if (!ctx.product.gebruiksvoorschriften || ctx.product.gebruiksvoorschriften.length === 0) {
    return flags;
  }

  // Vind ALLE voorschriften voor dit gewas
  const cropVoorschriften = ctx.product.gebruiksvoorschriften.filter(v =>
    v.gewas && isCropAllowed(ctx.crop, v.gewas)
  );

  if (cropVoorschriften.length === 0) return flags;

  // Normaliseer input unit
  const inputUnit = ctx.unit.toLowerCase().replace('/ha', '').trim();

  const results = cropVoorschriften.map(v => {
    const max = parseDosering(v.dosering || '');
    if (!max) return { voorschrift: v, isOk: true }; // Geen dosering info = OK

    let normalizedInput = ctx.dosage;
    let normalizedMax = max.value;

    // Unit conversie
    if (inputUnit === 'l' && max.unit === 'ml') normalizedInput *= 1000;
    else if (inputUnit === 'ml' && max.unit === 'l') normalizedMax *= 1000;
    else if (inputUnit === 'kg' && max.unit === 'g') normalizedInput *= 1000;
    else if (inputUnit === 'g' && max.unit === 'kg') normalizedMax *= 1000;
    else if (inputUnit !== max.unit) return { voorschrift: v, isOk: false, overLimit: true };

    return { voorschrift: v, isOk: normalizedInput <= normalizedMax, overLimit: normalizedInput > normalizedMax, maxAllowed: v.dosering };
  });

  const exactMatch = ctx.matchedTarget ? results.find(r => r.voorschrift === ctx.matchedTarget?.voorschrift) : null;
  const anyOk = results.some(r => r.isOk);

  if (!anyOk) {
    // Geen enkel voorschrift staat deze dosering toe
    // Show per-target maximums for clarity
    const targetMaxes = results
      .map(r => {
        const max = parseDosering(r.voorschrift.dosering || '');
        return { target: r.voorschrift.doelorganisme || 'Onbekend doel', max: max?.value || 0, unit: inputUnit };
      })
      .filter(t => t.max > 0)
      .sort((a, b) => b.max - a.max);
    const absoluteMax = targetMaxes.length > 0 ? targetMaxes[0].max : 0;
    const highestTarget = targetMaxes.length > 0 ? targetMaxes[0].target : '';

    let dosageMessage: string;
    if (targetMaxes.length === 1) {
      dosageMessage = `Dosering ${ctx.dosage} ${ctx.unit} overschrijdt het maximum van ${absoluteMax} ${inputUnit} voor '${highestTarget}' in ${ctx.crop}.`;
    } else if (targetMaxes.length > 1) {
      // Show the highest allowed target for context
      dosageMessage = `Dosering ${ctx.dosage} ${ctx.unit} overschrijdt het maximum voor alle toegelaten doelen in ${ctx.crop}. Hoogste maximum: ${absoluteMax} ${inputUnit} (${highestTarget}).`;
    } else {
      dosageMessage = `Dosering ${ctx.dosage} ${ctx.unit} is te hoog voor ${ctx.crop}. Controleer de voorschriften.`;
    }
    flags.push({
      type: 'error',
      message: dosageMessage,
      field: 'dosage'
    });
  } else if (exactMatch && !exactMatch.isOk) {
    // De specifieke reden (target) matcht niet, maar een ander doel wel
    const alternative = results.find(r => r.isOk);
    flags.push({
      type: 'warning',
      message: `Dosering ${ctx.dosage} ${ctx.unit} is te hoog voor '${ctx.matchedTarget?.targetOrganism}' (max ${exactMatch.maxAllowed}), maar wel toegestaan voor '${alternative?.voorschrift.doelorganisme}'.`,
      field: 'dosage'
    });
  } else if (!ctx.matchedTarget && results.length > 1) {
    // Geen target opgegeven, dosage is ok voor sommige maar niet voor alle
    const failedOnes = results.filter(r => !r.isOk);
    if (failedOnes.length > 0) {
      flags.push({
        type: 'info',
        message: `Let op: deze dosering is toegestaan voor ${results.find(r => r.isOk)?.voorschrift.doelorganisme}, maar te hoog voor ${failedOnes[0].voorschrift.doelorganisme}.`,
        field: 'dosage'
      });
    }
  }

  return flags;
}

/**
 * PRIORITEIT 4: Check interval tussen toepassingen
 */
function checkInterval(ctx: ValidationContext): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const voorschrift = ctx.matchedTarget?.voorschrift || findGebruiksvoorschrift(ctx.product, ctx.crop);
  const minIntervalDays = parseInterval(voorschrift?.interval || '');

  if (!minIntervalDays) return flags;

  // Zoek laatste toepassing op DIT perceel met DIT middel of ZELFDE werkzame stoffen
  const lastEntry = ctx.seasonHistory
    .filter(h => {
      if (h.parcelId !== ctx.parcel.id) return false;
      const historicProduct = ctx.ctgbProducts.get(h.product.toLowerCase());
      if (h.product.toLowerCase() === ctx.product.naam.toLowerCase()) return true;

      // Check overlap in werkzame stoffen
      if (historicProduct && historicProduct.werkzameStoffen && ctx.product.werkzameStoffen) {
        return historicProduct.werkzameStoffen.some(s => ctx.product.werkzameStoffen?.includes(s));
      }
      return false;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (lastEntry) {
    const lastDate = new Date(lastEntry.date);
    const diff = daysBetween(lastDate, ctx.applicationDate);
    if (diff < minIntervalDays) {
      flags.push({
        type: 'error',
        message: `Wettelijk interval overtreding voor ${ctx.product.naam}. Minimaal ${minIntervalDays} dagen vereist, laatste was ${diff} dag(en) geleden (${lastDate.toLocaleDateString('nl-NL')}).`,
        field: 'date'
      });
    }
  }

  return flags;
}

/**
 * PRIORITEIT 5: Check seizoens maxima (Dosering & Aantal)
 */
function checkSeasonalMaxima(ctx: ValidationContext): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.crop);
  if (!voorschrift) return flags;

  const maxFreq = voorschrift.maxToepassingenPerTeeltcyclus || voorschrift.maxToepassingen; // Fallback to older field if needed
  const maxDoseSeasonStr = voorschrift.maxDoseringPerTeeltcyclus;

  // Tel historie voor DIT perceel en DIT gewas (teeltcyclus)
  const relevantHistory = ctx.seasonHistory.filter(h =>
    h.parcelId === ctx.parcel.id &&
    h.product.toLowerCase() === ctx.product.naam.toLowerCase()
  );

  // Aantal toepassingen
  if (maxFreq && (relevantHistory.length + 1) > maxFreq) {
    flags.push({
      type: 'error',
      message: `Maximum aantal toepassingen bereikt voor ${ctx.product.naam} op dit perceel (${relevantHistory.length + 1}/${maxFreq}x per teelt).`,
      field: 'products'
    });
  }

  // Cumulatieve dosering
  if (maxDoseSeasonStr) {
    const maxDoseSeason = parseDosering(maxDoseSeasonStr);
    if (maxDoseSeason) {
      let totalDose = ctx.dosage;
      relevantHistory.forEach(h => {
        // Simplificatie: we gaan ervan uit dat eenheid consistent is of converteren
        totalDose += h.dosage; // TODO: unit conversion if needed
      });

      if (totalDose > maxDoseSeason.value) {
        flags.push({
          type: 'error',
          message: `Maximale seizoensdosering overschreden voor ${ctx.product.naam}: totaal ${totalDose} ${ctx.unit} (max ${maxDoseSeasonStr} per teelt).`,
          field: 'dosage'
        });
      }
    }
  }

  return flags;
}

/**
 * Check veiligheidstermijn (Pre-Harvest Interval)
 */
function checkVeiligheidstermijn(
  ctx: ValidationContext,
  expectedHarvestDate?: Date
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  if (!expectedHarvestDate) return flags;

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.crop);
  const phiDays = parseInterval(voorschrift?.veiligheidstermijn || '');

  if (phiDays) {
    const daysUntilHarvest = daysBetween(ctx.applicationDate, expectedHarvestDate);
    if (daysUntilHarvest < phiDays) {
      flags.push({
        type: 'error',
        message: `Oogst over ${daysUntilHarvest} dagen is te vroeg. Veiligheidstermijn voor ${ctx.product.naam} is ${phiDays} dagen.`,
        field: 'date'
      });
    }
  }

  return flags;
}

// ============================================
// Main Validation Function
// ============================================

/**
 * Helper: bepaal het gewas van een perceel
 * Probeert eerst parcel.crop, dan subParcels[0].crop
 */
function getParcelCrop(parcel: Parcel): string | undefined {
  // Direct crop field
  if (parcel.crop) {
    return parcel.crop;
  }

  // Try first sub-parcel
  if (parcel.subParcels && parcel.subParcels.length > 0) {
    const firstSubParcel = parcel.subParcels[0];
    if (firstSubParcel.crop) {
      return firstSubParcel.crop;
    }
    // Some sub-parcels might use 'cropType' instead
    if ((firstSubParcel as any).cropType) {
      return (firstSubParcel as any).cropType;
    }
  }

  console.warn(`[getParcelCrop] No crop found for parcel ${parcel.name || parcel.id}`);
  return undefined;
}

/**
 * Hoofdfunctie voor validatie van een bespuiting
 */
export async function validateSprayApplication(
  parcel: Parcel,
  product: CtgbProduct,
  dosage: number,
  unit: string,
  applicationDate: Date,
  seasonHistory: ParcelHistoryEntry[],
  allCtgbProducts: CtgbProduct[],
  expectedHarvestDate?: Date,
  targetReason?: string // Doelorganisme uit gebruikersinvoer
): Promise<ValidationResult> {
  const flags: ValidationFlag[] = [];
  const matchedTargets = new Map<string, MatchedTarget>();

  // Determine the crop from parcel or sub-parcels
  const parcelCrop = getParcelCrop(parcel);

  if (!parcelCrop) {
    flags.push({
      type: 'warning',
      message: `Perceel "${parcel.name || parcel.id}" heeft geen gewas geconfigureerd. Kan toelating niet valideren.`,
      field: 'plots'
    });
    return { isValid: true, flags, matchedTargets }; // Skip validation but don't block
  }

  console.log(`[validateSprayApplication] Validating: product="${product.naam}", parcel="${parcel.name}", crop="${parcelCrop}"`);

  // Build lookup map
  const ctgbMap = new Map<string, CtgbProduct>();
  allCtgbProducts.forEach(p => {
    if (p.naam) {
      ctgbMap.set(p.naam.toLowerCase(), p);
    }
    if (p.toelatingsnummer) {
      ctgbMap.set(p.toelatingsnummer.toLowerCase(), p);
    }
  });

  // Match target
  const targetMatch = findGebruiksvoorschriftWithTarget(product, parcelCrop, targetReason);
  let matchedTarget: MatchedTarget | undefined;

  if (targetMatch) {
    matchedTarget = targetMatch.matchedTarget;
    matchedTargets.set(product.naam, matchedTarget);

    const label = matchedTarget.isAssumed ? `${matchedTarget.targetOrganism}` : `Doel: ${matchedTarget.targetOrganism}`;
    flags.push({ type: 'info', message: label, field: 'targetOrganism' });
  } else if (targetReason) {
    // Gebruiker gaf target, maar geen match gevonden
    flags.push({
      type: 'warning',
      message: `Doelorganisme "${targetReason}" niet gevonden in toegelaten doelen voor ${product.naam}. Controleer of dit middel hiervoor is toegelaten.`,
      field: 'targetOrganism',
      details: { userInput: targetReason }
    });
  }

  const ctx: ValidationContext = {
    parcel, crop: parcelCrop, product, dosage, unit, applicationDate,
    seasonHistory, ctgbProducts: ctgbMap,
    targetReason, matchedTarget
  };

  // Voer alle checks uit
  flags.push(...checkCropAllowed(ctx));
  if (flags.some(f => f.type === 'error' && f.field === 'products')) {
    return { isValid: false, flags, matchedTargets };
  }

  flags.push(...checkDosage(ctx));
  flags.push(...checkInterval(ctx));
  flags.push(...checkSeasonalMaxima(ctx));
  flags.push(...await checkActiveSubstanceCumulation(ctx));
  flags.push(...checkVeiligheidstermijn(ctx, expectedHarvestDate));

  const isValid = !flags.some(f => f.type === 'error');

  return { isValid, flags, matchedTargets };
}

/**
 * Hulpfunctie voor de API om parsed data in één keer te valideren.
 *
 * GROUPING LOGIC:
 * - Crop authorization errors: Grouped by crop (not per parcel)
 * - Dosage errors: Grouped by product
 * - Interval/substance limits: Per subparcel (more specific)
 */
export async function validateParsedSprayData(
  parsedData: { plots: string[]; products: any[]; date?: string },
  allParcels: Parcel[],
  allCtgbProducts: CtgbProduct[],
  parcelHistory: ParcelHistoryEntry[]
): Promise<{
  isValid: boolean;
  validationMessage: string | null;
  errorCount: number;
  warningCount: number;
}> {
  const selectedParcels = allParcels.filter(p => parsedData.plots.includes(p.id));
  const applicationDate = parsedData.date ? new Date(parsedData.date) : new Date();

  // Group errors by type for smarter deduplication
  const cropAuthErrors = new Map<string, Set<string>>(); // product -> Set<crop>
  const dosageErrors = new Map<string, string>(); // product -> message
  const intervalErrors = new Map<string, string>(); // product+parcel -> message
  const substanceErrors = new Map<string, string>(); // substance -> message
  const otherMessages: string[] = [];
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const productEntry of parsedData.products) {
    const searchName = productEntry.product.toLowerCase().trim();
    const aliasResolved = resolveAlias(searchName);

    // Try: exact match, then alias match, then prefix/contains match
    let matchingProduct = allCtgbProducts.find(m =>
      m.naam?.toLowerCase() === searchName ||
      m.toelatingsnummer === productEntry.product
    );

    if (!matchingProduct && aliasResolved) {
      matchingProduct = allCtgbProducts.find(m =>
        m.naam?.toLowerCase() === aliasResolved.toLowerCase()
      );
    }

    if (!matchingProduct) {
      // Fuzzy: prefix match - prefer shortest name (closest match)
      const prefixMatches = allCtgbProducts.filter(m =>
        m.naam?.toLowerCase().startsWith(searchName) || searchName.startsWith(m.naam?.toLowerCase() || '')
      );
      if (prefixMatches.length === 1) {
        matchingProduct = prefixMatches[0];
      } else if (prefixMatches.length > 1) {
        // Prefer exact first-word match, then shortest name
        matchingProduct = prefixMatches.sort((a, b) => {
          const aFirstWord = a.naam?.toLowerCase().split(/[\s-]/)[0] || '';
          const bFirstWord = b.naam?.toLowerCase().split(/[\s-]/)[0] || '';
          const aExact = aFirstWord === searchName ? 0 : 1;
          const bExact = bFirstWord === searchName ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          return (a.naam?.length || 999) - (b.naam?.length || 999);
        })[0];
      }
    }

    if (!matchingProduct && searchName.length >= 5) {
      // Fuzzy: contains match - only for search terms of 5+ characters to prevent false positives
      // (short terms like "top", "pro", "gold" would match too many products)
      const containsMatches = allCtgbProducts.filter(m =>
        m.naam?.toLowerCase().includes(searchName) || searchName.includes(m.naam?.toLowerCase() || '')
      );
      if (containsMatches.length === 1) {
        matchingProduct = containsMatches[0];
      } else if (containsMatches.length > 1) {
        // Prefer the product where search term matches the start of a word
        matchingProduct = containsMatches.sort((a, b) => {
          const aName = a.naam?.toLowerCase() || '';
          const bName = b.naam?.toLowerCase() || '';
          // Prefer word-start matches (e.g., "score" at start of "Score 250 EC")
          const aWordStart = aName.split(/[\s-]/).some(w => w.startsWith(searchName)) ? 0 : 1;
          const bWordStart = bName.split(/[\s-]/).some(w => w.startsWith(searchName)) ? 0 : 1;
          if (aWordStart !== bWordStart) return aWordStart - bWordStart;
          return (a.naam?.length || 999) - (b.naam?.length || 999);
        })[0];
      }
    }

    if (!matchingProduct) {
      otherMessages.push(`⚠️ Product "${productEntry.product}" niet gevonden in CTGB database.`);
      warningCount++;
      continue;
    }

    for (const parcel of selectedParcels) {
      const history = parcelHistory.filter(h => h.parcelId === parcel.id);
      const crop = getParcelCrop(parcel) || 'Onbekend';

      const result = await validateSprayApplication(
        parcel,
        matchingProduct,
        productEntry.dosage,
        productEntry.unit,
        applicationDate,
        history,
        allCtgbProducts,
        undefined,
        productEntry.targetReason
      );

      for (const flag of result.flags) {
        // Group crop authorization errors by crop
        if (flag.details?.allowedCrops || flag.message.includes('wordt niet ondersteund')) {
          if (!cropAuthErrors.has(matchingProduct.naam)) {
            cropAuthErrors.set(matchingProduct.naam, new Set());
          }
          cropAuthErrors.get(matchingProduct.naam)!.add(crop);
          if (flag.type === 'error') errorCount++;
        }
        // Group dosage errors by product (same message for all parcels)
        else if (flag.field === 'dosage' && flag.type === 'error') {
          if (!dosageErrors.has(matchingProduct.naam)) {
            dosageErrors.set(matchingProduct.naam, flag.message);
            errorCount++;
          }
        }
        // Interval errors are per parcel (keep specific)
        else if (flag.message.includes('interval') || flag.message.includes('Interval')) {
          const key = `${matchingProduct.naam}-${parcel.id}`;
          if (!intervalErrors.has(key)) {
            intervalErrors.set(key, `${parcel.name}: ${flag.message}`);
            if (flag.type === 'error') errorCount++;
            else if (flag.type === 'warning') warningCount++;
          }
        }
        // Substance cumulation errors
        else if (flag.details?.substance) {
          const substance = flag.details.substance as string;
          if (!substanceErrors.has(substance)) {
            substanceErrors.set(substance, flag.message);
            if (flag.type === 'error') errorCount++;
            else if (flag.type === 'warning') warningCount++;
          }
        }
        // Other messages (deduplicate)
        else {
          const prefix = flag.type === 'error' ? '❌' : flag.type === 'warning' ? '⚠️' : 'ℹ️';
          const msg = `${prefix} ${flag.message}`;
          if (!otherMessages.includes(msg)) {
            otherMessages.push(msg);
            if (flag.type === 'error') errorCount++;
            else if (flag.type === 'warning') warningCount++;
            else infoCount++;
          }
        }
      }
    }
  }

  // Build final message with grouped errors
  const validationMessages: string[] = [];

  // Crop authorization errors - ONE message per product per crop
  for (const [product, crops] of cropAuthErrors) {
    const cropList = [...crops].sort().join(', ');
    validationMessages.push(`❌ ${product} is niet toegelaten op: ${cropList}`);
  }

  // Dosage errors
  for (const [product, message] of dosageErrors) {
    validationMessages.push(`❌ ${message}`);
  }

  // Substance cumulation errors
  for (const [substance, message] of substanceErrors) {
    validationMessages.push(`❌ ${message}`);
  }

  // Interval errors (per parcel)
  for (const [key, message] of intervalErrors) {
    validationMessages.push(`⚠️ ${message}`);
  }

  // Other messages
  validationMessages.push(...otherMessages);

  return {
    isValid: errorCount === 0,
    validationMessage: validationMessages.length > 0 ? validationMessages.join('\n') : null,
    errorCount,
    warningCount
  };
}
