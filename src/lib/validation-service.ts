/**
 * ValidationService voor AgriSprayer Pro - Slimme Invoer 2.0
 *
 * Valideert bespuitingen tegen CTGB-wetgeving met focus op:
 * 1. Cumulatieve werkzame stof limieten per seizoen
 * 2. Teelt-hiërarchie voor toelating
 * 3. Dosering checks
 * 4. Interval en veiligheidstermijn checks
 */

import type { Parcel, ParcelHistoryEntry, CtgbProduct, CtgbGebruiksvoorschrift } from './types';

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
};

type ValidationContext = {
  parcel: Parcel;
  product: CtgbProduct;
  dosage: number;
  unit: string;
  applicationDate: Date;
  seasonHistory: ParcelHistoryEntry[];
  ctgbProducts: Map<string, CtgbProduct>;
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
 * Houdt rekening met de teelt-hiërarchie
 */
export function findGebruiksvoorschrift(
  product: CtgbProduct,
  parcelCrop: string
): CtgbGebruiksvoorschrift | null {
  if (!product.gebruiksvoorschriften || product.gebruiksvoorschriften.length === 0) {
    return null;
  }

  const normalizedCrop = parcelCrop.toLowerCase().trim();
  const cropHierarchy = CROP_HIERARCHY[normalizedCrop] || [normalizedCrop];

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
  }

  return null;
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
  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.parcel.crop);
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
 * PRIORITEIT 2: Check of het middel toegelaten is voor dit gewas
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

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.parcel.crop);

  if (!voorschrift) {
    // Verzamel alle toegelaten gewassen voor suggestie
    const allowedCrops = ctx.product.gebruiksvoorschriften
      .map(v => v.gewas)
      .filter(Boolean)
      .join(', ');

    flags.push({
      type: 'error',
      message: `${ctx.product.naam} is niet toegelaten voor gewas '${ctx.parcel.crop}'. Toegelaten voor: ${allowedCrops || 'onbekend'}.`,
      field: 'products',
      details: {
        crop: ctx.parcel.crop,
        allowedCrops: allowedCrops
      }
    });
  }

  return flags;
}

/**
 * PRIORITEIT 3: Check dosering tegen maximum
 */
function checkDosage(ctx: ValidationContext): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.parcel.crop);
  if (!voorschrift?.dosering) {
    return flags;
  }

  const maxDosering = parseDosering(voorschrift.dosering);
  if (!maxDosering) {
    return flags;
  }

  // Normaliseer input unit (verwijder /ha suffix)
  const inputUnit = ctx.unit.toLowerCase().replace('/ha', '').trim();

  // Check of units vergelijkbaar zijn
  if (inputUnit !== maxDosering.unit) {
    // Probeer eenheden te converteren (l <-> ml, kg <-> g)
    let normalizedInput = ctx.dosage;
    let normalizedMax = maxDosering.value;

    if (inputUnit === 'l' && maxDosering.unit === 'ml') {
      normalizedInput = ctx.dosage * 1000;
    } else if (inputUnit === 'ml' && maxDosering.unit === 'l') {
      normalizedMax = maxDosering.value * 1000;
    } else if (inputUnit === 'kg' && maxDosering.unit === 'g') {
      normalizedInput = ctx.dosage * 1000;
    } else if (inputUnit === 'g' && maxDosering.unit === 'kg') {
      normalizedMax = maxDosering.value * 1000;
    } else {
      // Kan niet vergelijken
      return flags;
    }

    if (normalizedInput > normalizedMax) {
      flags.push({
        type: 'warning',
        message: `Dosering ${ctx.dosage} ${ctx.unit} overschrijdt maximum van ${voorschrift.dosering}.`,
        field: 'dosage',
        details: { input: ctx.dosage, unit: ctx.unit, max: voorschrift.dosering }
      });
    }
  } else {
    // Zelfde eenheid, directe vergelijking
    if (ctx.dosage > maxDosering.value) {
      flags.push({
        type: 'warning',
        message: `Dosering ${ctx.dosage} ${ctx.unit} overschrijdt maximum van ${voorschrift.dosering}.`,
        field: 'dosage',
        details: { input: ctx.dosage, unit: ctx.unit, max: voorschrift.dosering }
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

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.parcel.crop);
  if (!voorschrift?.interval) {
    return flags;
  }

  const minIntervalDays = parseInterval(voorschrift.interval);
  if (!minIntervalDays) {
    return flags;
  }

  // Vind laatste toepassing met dezelfde werkzame stof
  const newProductSubstances = ctx.product.werkzameStoffen || [];

  const relevantHistory = ctx.seasonHistory
    .filter(h => {
      const p = ctx.ctgbProducts.get(h.product.toLowerCase());
      if (!p || !p.werkzameStoffen) return false;
      return p.werkzameStoffen.some(s =>
        newProductSubstances.some(ns => ns.toLowerCase() === s.toLowerCase())
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastApplication = relevantHistory[0];

  if (lastApplication) {
    const lastDate = new Date(lastApplication.date);
    const daysSince = daysBetween(lastDate, ctx.applicationDate);

    if (daysSince < minIntervalDays) {
      flags.push({
        type: 'warning',
        message: `Interval te kort: ${daysSince} dagen sinds laatste toepassing op ${lastDate.toLocaleDateString('nl-NL')} (minimaal ${minIntervalDays} dagen vereist).`,
        field: 'date',
        details: {
          daysSince,
          minRequired: minIntervalDays,
          lastApplicationDate: lastDate.toISOString(),
          lastProduct: lastApplication.product
        }
      });
    }
  }

  return flags;
}

/**
 * Check veiligheidstermijn (Pre-Harvest Interval)
 * Dit is optioneel - vereist een verwachte oogstdatum
 */
function checkVeiligheidstermijn(
  ctx: ValidationContext,
  expectedHarvestDate?: Date
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  if (!expectedHarvestDate) {
    return flags;
  }

  const voorschrift = findGebruiksvoorschrift(ctx.product, ctx.parcel.crop);
  if (!voorschrift?.veiligheidstermijn) {
    return flags;
  }

  const phiDays = parseInterval(voorschrift.veiligheidstermijn);
  if (!phiDays) {
    return flags;
  }

  const daysUntilHarvest = daysBetween(ctx.applicationDate, expectedHarvestDate);

  if (daysUntilHarvest < phiDays) {
    flags.push({
      type: 'error',
      message: `Veiligheidstermijn niet gehaald: ${daysUntilHarvest} dagen tot oogst, maar ${phiDays} dagen vereist.`,
      field: 'date',
      details: {
        daysUntilHarvest,
        requiredDays: phiDays,
        harvestDate: expectedHarvestDate.toISOString()
      }
    });
  }

  return flags;
}

// ============================================
// Main Validation Function
// ============================================

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
  expectedHarvestDate?: Date
): Promise<ValidationResult> {
  const flags: ValidationFlag[] = [];

  // Build lookup map voor snelle CTGB product zoekacties
  const ctgbMap = new Map<string, CtgbProduct>();
  for (const p of allCtgbProducts) {
    ctgbMap.set(p.naam.toLowerCase(), p);
    // Ook toevoegen op basis van toelatingsnummer voor extra lookup mogelijkheid
    if (p.toelatingsnummer) {
      ctgbMap.set(p.toelatingsnummer.toLowerCase(), p);
    }
  }

  const ctx: ValidationContext = {
    parcel,
    product,
    dosage,
    unit,
    applicationDate,
    seasonHistory,
    ctgbProducts: ctgbMap
  };

  // Run alle checks in prioriteitsvolgorde
  flags.push(...await checkActiveSubstanceCumulation(ctx));
  flags.push(...checkCropAllowed(ctx));
  flags.push(...checkDosage(ctx));
  flags.push(...checkInterval(ctx));
  flags.push(...checkVeiligheidstermijn(ctx, expectedHarvestDate));

  return {
    isValid: !flags.some(f => f.type === 'error'),
    flags
  };
}

/**
 * Batch validatie voor meerdere producten op meerdere percelen
 */
export async function validateBatchSprayApplication(
  parcels: Parcel[],
  products: Array<{ product: CtgbProduct; dosage: number; unit: string }>,
  applicationDate: Date,
  seasonHistoryByParcel: Map<string, ParcelHistoryEntry[]>,
  allCtgbProducts: CtgbProduct[]
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  for (const parcel of parcels) {
    const parcelHistory = seasonHistoryByParcel.get(parcel.id) || [];
    const combinedFlags: ValidationFlag[] = [];

    for (const { product, dosage, unit } of products) {
      const result = await validateSprayApplication(
        parcel,
        product,
        dosage,
        unit,
        applicationDate,
        parcelHistory,
        allCtgbProducts
      );
      combinedFlags.push(...result.flags);
    }

    results.set(parcel.id, {
      isValid: !combinedFlags.some(f => f.type === 'error'),
      flags: combinedFlags
    });
  }

  return results;
}
