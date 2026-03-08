/**
 * CTGB Validation Engine v2.0 - Deterministische Validator
 *
 * De 4-Laags Validatie:
 * 1. Max Dosering: input_dose <= authorized_dose
 * 2. Interval: (now - last_application_date) >= min_interval_days
 * 3. Frequentie: count(applications_this_year) < max_freq
 * 4. Stof-Cumulatie: Check op active_substance niveau, niet productnaam
 *
 * CRUCIAAL: Als ik 3x een middel met 'Captan' heb gespoten (ook al heetten ze anders),
 * en ik wil nu weer Captan spuiten, moet de validator alle voorgaande kilo's
 * werkzame stof optellen en checken tegen het wettelijk jaarmaximum.
 */

import type {
  CtgbProduct,
  CtgbGebruiksvoorschrift,
  ParcelHistoryEntry,
} from '../types';

// ============================================
// Types
// ============================================

export interface SprayTask {
  productId: string;
  productName: string;
  dosage: number;
  unit: string;
  applicationDate: Date;
  parcelIds: string[];
  targetOrganism?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning';
  details?: Record<string, unknown>;
}

export interface ValidationError {
  code: string;
  message: string;
  field: string;
  details?: Record<string, unknown>;
}

export interface CtgbValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
  substanceReport?: SubstanceReport[];
}

export interface SubstanceReport {
  substanceName: string;
  usedThisSeason: number;
  maxPerSeason: number | null;
  applicationsThisSeason: number;
  maxApplications: number | null;
  percentage: number | null;
}

export interface ActiveSubstance {
  code: string;
  name: string;
  maxKgPerYear?: number;
  maxApplicationsPerYear?: number;
}

// ============================================
// Helper Functions
// ============================================

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
 */
export function parseInterval(intervalStr: string): number | null {
  if (!intervalStr) return null;

  const dagenMatch = intervalStr.match(/(\d+)\s*dag/i);
  if (dagenMatch) return parseInt(dagenMatch[1], 10);

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

/**
 * Get current growing season (calendar year)
 */
function getCurrentSeasonRange(date: Date): { start: Date; end: Date } {
  const year = date.getFullYear();
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999)
  };
}

/**
 * Filter history entries for current season
 */
function filterSeasonHistory(
  history: ParcelHistoryEntry[],
  applicationDate: Date,
  parcelIds?: string[]
): ParcelHistoryEntry[] {
  const season = getCurrentSeasonRange(applicationDate);

  return history.filter(entry => {
    const entryDate = new Date(entry.date);
    const inSeason = entryDate >= season.start && entryDate <= season.end;
    const matchesParcel = !parcelIds || parcelIds.includes(entry.parcelId);
    return inSeason && matchesParcel;
  });
}

/**
 * Normaliseer werkzame stof naam voor vergelijking
 */
function normalizeSubstanceName(name: string): string {
  return name.toLowerCase().trim().replace(/[-\s]+/g, '');
}

/**
 * Check of twee werkzame stoffen overeenkomen
 */
function substancesMatch(substance1: string, substance2: string): boolean {
  return normalizeSubstanceName(substance1) === normalizeSubstanceName(substance2);
}

// ============================================
// Main Validation Function
// ============================================

/**
 * validateApplication - Hoofd validatie functie
 *
 * @param task - De geplande bespuiting
 * @param history - Alle historische bespuitingen
 * @param ctgbProducts - Lookup map van CTGB producten (key: product naam lowercase)
 * @param parcelCrops - Map van parcel ID naar gewas naam
 */
export function validateApplication(
  task: SprayTask,
  history: ParcelHistoryEntry[],
  ctgbProducts: Map<string, CtgbProduct>,
  parcelCrops: Map<string, string>
): CtgbValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const substanceReports: SubstanceReport[] = [];

  // 1. Find the CTGB product (with alias resolution and fuzzy matching)
  const searchName = task.productName.toLowerCase().trim();
  let product = ctgbProducts.get(searchName);

  if (!product) {
    // Try alias resolution
    const { resolveAlias } = require('./product-matcher');
    const aliasTarget = resolveAlias(searchName);
    if (aliasTarget) {
      product = ctgbProducts.get(aliasTarget.toLowerCase()) || undefined;
    }
  }

  if (!product) {
    // Fuzzy: prefix/contains match
    for (const [key, p] of ctgbProducts) {
      if (key.startsWith(searchName) || searchName.startsWith(key) ||
          key.includes(searchName) || searchName.includes(key)) {
        product = p;
        break;
      }
    }
  }

  if (!product) {
    errors.push({
      code: 'PRODUCT_NOT_FOUND',
      message: `Product "${task.productName}" niet gevonden in CTGB database.`,
      field: 'products',
    });
    return { valid: false, errors, warnings };
  }

  // 2. Filter history for current season
  const seasonHistory = filterSeasonHistory(history, task.applicationDate);

  // 3. Get unique crops from selected parcels
  const selectedCrops = new Set<string>();
  for (const parcelId of task.parcelIds) {
    const crop = parcelCrops.get(parcelId);
    if (crop && crop !== 'Onbekend') {
      selectedCrops.add(crop.toLowerCase());
    }
  }

  // 4. Find matching gebruiksvoorschrift for each crop
  const matchedVoorschriften: Array<{
    crop: string;
    voorschrift: CtgbGebruiksvoorschrift;
  }> = [];

  for (const crop of selectedCrops) {
    const voorschrift = findBestVoorschrift(product, crop, task.targetOrganism);
    if (voorschrift) {
      matchedVoorschriften.push({ crop, voorschrift });
    } else {
      errors.push({
        code: 'CROP_NOT_ALLOWED',
        message: `${product.naam} is niet toegelaten voor gewas "${crop}".`,
        field: 'products',
        details: { crop, productName: product.naam }
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 5. Run validation checks for each matched voorschrift
  for (const { crop, voorschrift } of matchedVoorschriften) {
    // Check 1: Max Dosering
    const dosageResult = checkMaxDosage(task, voorschrift);
    if (dosageResult.error) errors.push(dosageResult.error);
    if (dosageResult.warning) warnings.push(dosageResult.warning);

    // Check 2: Interval
    const intervalResult = checkInterval(
      task,
      product,
      seasonHistory,
      voorschrift,
      ctgbProducts
    );
    if (intervalResult.error) errors.push(intervalResult.error);
    if (intervalResult.warning) warnings.push(intervalResult.warning);

    // Check 3: Frequentie (per product)
    const freqResult = checkFrequency(task, product, seasonHistory, voorschrift);
    if (freqResult.error) errors.push(freqResult.error);
    if (freqResult.warning) warnings.push(freqResult.warning);
  }

  // Check 4: Stof-Cumulatie (CRUCIAAL - op werkzame stof niveau)
  const substanceResult = checkSubstanceCumulation(
    task,
    product,
    seasonHistory,
    ctgbProducts
  );
  errors.push(...substanceResult.errors);
  warnings.push(...substanceResult.warnings);
  substanceReports.push(...substanceResult.reports);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    substanceReport: substanceReports.length > 0 ? substanceReports : undefined,
  };
}

// ============================================
// Validation Checks
// ============================================

/**
 * Find best matching gebruiksvoorschrift for crop and optional target
 */
function findBestVoorschrift(
  product: CtgbProduct,
  crop: string,
  targetOrganism?: string
): CtgbGebruiksvoorschrift | null {
  if (!product.gebruiksvoorschriften?.length) return null;

  const normalizedCrop = crop.toLowerCase();

  // Crop hierarchy for fuzzy matching
  const cropVariants = getCropVariants(normalizedCrop);

  // Filter voorschriften that match the crop
  const cropMatches = product.gebruiksvoorschriften.filter(v => {
    if (!v.gewas) return false;
    const allowedCrops = v.gewas.toLowerCase();
    return cropVariants.some(variant => allowedCrops.includes(variant));
  });

  if (cropMatches.length === 0) return null;

  // If target specified, try to find exact match
  if (targetOrganism) {
    const targetMatch = cropMatches.find(v =>
      v.doelorganisme?.toLowerCase().includes(targetOrganism.toLowerCase())
    );
    if (targetMatch) return targetMatch;
  }

  // Return first match (or one with highest dosage as "default")
  return cropMatches[0];
}

/**
 * Get crop name variants for fuzzy matching
 */
function getCropVariants(crop: string): string[] {
  const variants = [crop];

  // Add common variants
  const mappings: Record<string, string[]> = {
    'appel': ['appel', 'appels', 'pitvruchten', 'pitfruit'],
    'peer': ['peer', 'peren', 'pitvruchten', 'pitfruit'],
    'kers': ['kers', 'kersen', 'steenvruchten', 'steenfruit'],
    'pruim': ['pruim', 'pruimen', 'steenvruchten', 'steenfruit'],
  };

  for (const [key, vals] of Object.entries(mappings)) {
    if (crop.includes(key)) {
      variants.push(...vals);
      break;
    }
  }

  return [...new Set(variants)];
}

/**
 * Check 1: Max Dosering
 */
function checkMaxDosage(
  task: SprayTask,
  voorschrift: CtgbGebruiksvoorschrift
): { error?: ValidationError; warning?: ValidationWarning } {
  const maxDosage = parseDosering(voorschrift.dosering || '');
  if (!maxDosage) return {};

  // Normalize units
  let inputDosage = task.dosage;
  let maxValue = maxDosage.value;
  const inputUnit = task.unit.toLowerCase().replace('/ha', '').trim();
  const maxUnit = maxDosage.unit;

  // Unit conversions
  if (inputUnit === 'l' && maxUnit === 'ml') inputDosage *= 1000;
  else if (inputUnit === 'ml' && maxUnit === 'l') maxValue *= 1000;
  else if (inputUnit === 'kg' && maxUnit === 'g') inputDosage *= 1000;
  else if (inputUnit === 'g' && maxUnit === 'kg') maxValue *= 1000;
  else if (inputUnit !== maxUnit) {
    // Units don't match and can't convert
    return {
      warning: {
        code: 'UNIT_MISMATCH',
        message: `Eenheid ${task.unit} komt niet overeen met toegelaten eenheid ${maxDosage.unit}.`,
        severity: 'warning',
      }
    };
  }

  if (inputDosage > maxValue) {
    return {
      error: {
        code: 'DOSAGE_EXCEEDED',
        message: `Dosering ${task.dosage} ${task.unit} overschrijdt maximum van ${voorschrift.dosering}.`,
        field: 'dosage',
        details: {
          requested: task.dosage,
          max: maxValue,
          unit: task.unit,
        }
      }
    };
  }

  // Warning at 90%+ of max
  if (inputDosage >= maxValue * 0.9) {
    return {
      warning: {
        code: 'DOSAGE_HIGH',
        message: `Dosering ${task.dosage} ${task.unit} nadert maximum (${Math.round(inputDosage / maxValue * 100)}%).`,
        severity: 'info',
      }
    };
  }

  return {};
}

/**
 * Check 2: Interval
 */
function checkInterval(
  task: SprayTask,
  product: CtgbProduct,
  seasonHistory: ParcelHistoryEntry[],
  voorschrift: CtgbGebruiksvoorschrift,
  ctgbProducts: Map<string, CtgbProduct>
): { error?: ValidationError; warning?: ValidationWarning } {
  const minIntervalDays = parseInterval(voorschrift.interval || '');
  if (!minIntervalDays) return {};

  // Find last application with this product OR same active substances
  const relevantHistory = seasonHistory.filter(entry => {
    // Same product
    if (entry.product.toLowerCase() === product.naam.toLowerCase()) return true;

    // Check for overlapping active substances
    const historicProduct = ctgbProducts.get(entry.product.toLowerCase());
    if (!historicProduct?.werkzameStoffen || !product.werkzameStoffen) return false;

    return historicProduct.werkzameStoffen.some(hs =>
      product.werkzameStoffen.some(ps => substancesMatch(hs, ps))
    );
  });

  if (relevantHistory.length === 0) return {};

  // Get most recent application on any of the target parcels
  const parcelRelevant = relevantHistory.filter(e =>
    task.parcelIds.includes(e.parcelId)
  );

  if (parcelRelevant.length === 0) return {};

  const mostRecent = parcelRelevant.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];

  const daysSinceLast = daysBetween(new Date(mostRecent.date), task.applicationDate);

  if (daysSinceLast < minIntervalDays) {
    return {
      error: {
        code: 'INTERVAL_VIOLATION',
        message: `Wettelijk interval niet gehaald. Minimaal ${minIntervalDays} dagen vereist, laatste toepassing was ${daysSinceLast} dag(en) geleden.`,
        field: 'date',
        details: {
          required: minIntervalDays,
          actual: daysSinceLast,
          lastDate: mostRecent.date,
          lastParcel: mostRecent.parcelName,
        }
      }
    };
  }

  return {};
}

/**
 * Check 3: Frequentie
 */
function checkFrequency(
  task: SprayTask,
  product: CtgbProduct,
  seasonHistory: ParcelHistoryEntry[],
  voorschrift: CtgbGebruiksvoorschrift
): { error?: ValidationError; warning?: ValidationWarning } {
  const maxApplications = voorschrift.maxToepassingenPerTeeltcyclus ||
    voorschrift.maxToepassingen;

  if (!maxApplications) return {};

  // Count applications of this product on target parcels
  const applicationCount = seasonHistory.filter(entry =>
    entry.product.toLowerCase() === product.naam.toLowerCase() &&
    task.parcelIds.includes(entry.parcelId)
  ).length;

  const totalAfter = applicationCount + 1;

  if (totalAfter > maxApplications) {
    return {
      error: {
        code: 'FREQUENCY_EXCEEDED',
        message: `Maximum aantal toepassingen bereikt: ${applicationCount}/${maxApplications} dit seizoen.`,
        field: 'products',
        details: {
          current: applicationCount,
          max: maxApplications,
          product: product.naam,
        }
      }
    };
  }

  if (totalAfter === maxApplications) {
    return {
      warning: {
        code: 'FREQUENCY_LIMIT_REACHED',
        message: `Na deze toepassing is het maximum bereikt (${totalAfter}/${maxApplications}).`,
        severity: 'warning',
      }
    };
  }

  return {};
}

/**
 * Check 4: Stof-Cumulatie (CRUCIAAL) - PER SUB-PERCEEL
 *
 * Dit checkt niet op productnaam maar op werkzame stof.
 * Als je 3x Merpan en 2x Captan 80 WDG hebt gespoten, beide met captan,
 * dan telt dat als 5 toepassingen van captan.
 *
 * BELANGRIJK: Validatie gebeurt PER SUB-PERCEEL, want:
 * - Elk sub-perceel heeft eigen bespuitingsgeschiedenis
 * - Sub-perceel A kan 5x captan hebben, sub-perceel B slechts 2x
 * - Wettelijke limieten gelden per teelt/perceel
 */
function checkSubstanceCumulation(
  task: SprayTask,
  product: CtgbProduct,
  seasonHistory: ParcelHistoryEntry[],
  ctgbProducts: Map<string, CtgbProduct>
): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  reports: SubstanceReport[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const reports: SubstanceReport[] = [];

  if (!product.werkzameStoffen?.length) {
    return { errors, warnings, reports };
  }

  // Find max applications for this substance from voorschriften
  const relevantVoorschrift = product.gebruiksvoorschriften?.find(v =>
    v.maxToepassingen || v.maxToepassingenPerTeeltcyclus
  );

  const maxApplications = relevantVoorschrift?.maxToepassingenPerTeeltcyclus ||
    relevantVoorschrift?.maxToepassingen ||
    null;

  const maxDoseringPerCyclus = relevantVoorschrift?.maxDoseringPerTeeltcyclus;
  const maxKgPerSeason = maxDoseringPerCyclus ?
    parseDosering(maxDoseringPerCyclus)?.value : null;

  // For each active substance in the new product
  for (const substance of product.werkzameStoffen) {

    // Track worst case per substance (across all sub-parcels)
    let worstParcelApplications = 0;
    let worstParcelName = '';
    let worstParcelKgUsed = 0;
    const allProductsWithSubstance: string[] = [];

    // ===== CHECK PER SUB-PERCEEL =====
    for (const parcelId of task.parcelIds) {
      // Filter history for THIS specific sub-parcel only
      const parcelHistory = seasonHistory.filter(entry => entry.parcelId === parcelId);

      let parcelApplications = 0;
      let parcelKgUsed = 0;
      const productsWithSubstance: string[] = [];

      for (const entry of parcelHistory) {
        const historicProduct = ctgbProducts.get(entry.product.toLowerCase());
        if (!historicProduct?.werkzameStoffen) continue;

        // Check if historic product contains this substance
        const hasSubstance = historicProduct.werkzameStoffen.some(s =>
          substancesMatch(s, substance)
        );

        if (hasSubstance) {
          parcelApplications++;

          // Calculate kg used
          if (entry.unit.toLowerCase().includes('kg')) {
            parcelKgUsed += entry.dosage;
          } else if (entry.unit.toLowerCase().includes('l')) {
            parcelKgUsed += entry.dosage;
          }

          if (!productsWithSubstance.includes(historicProduct.naam)) {
            productsWithSubstance.push(historicProduct.naam);
          }
          if (!allProductsWithSubstance.includes(historicProduct.naam)) {
            allProductsWithSubstance.push(historicProduct.naam);
          }
        }
      }

      // Track the worst case (highest application count)
      if (parcelApplications > worstParcelApplications) {
        worstParcelApplications = parcelApplications;
        worstParcelKgUsed = parcelKgUsed;

        // Try to get parcel name from history
        const parcelEntry = parcelHistory[0];
        worstParcelName = parcelEntry?.parcelName || parcelId;
      }

      // Check limits for THIS sub-parcel
      if (maxApplications) {
        const totalAfterApplication = parcelApplications + 1;

        if (totalAfterApplication > maxApplications) {
          const parcelEntry = parcelHistory[0];
          const parcelName = parcelEntry?.parcelName || parcelId;

          errors.push({
            code: 'SUBSTANCE_LIMIT_EXCEEDED',
            message: `Wettelijke limiet "${substance}" overschreden op ${parcelName}: al ${parcelApplications}x toegepast dit seizoen (max ${maxApplications}x). Eerdere middelen: ${productsWithSubstance.join(', ')}.`,
            field: 'products',
            details: {
              substance,
              parcelId,
              parcelName,
              currentCount: parcelApplications,
              max: maxApplications,
              previousProducts: productsWithSubstance,
            }
          });
        }
      }

      // Check cumulative kg for THIS sub-parcel
      if (maxKgPerSeason && parcelKgUsed + task.dosage > maxKgPerSeason) {
        const parcelEntry = parcelHistory[0];
        const parcelName = parcelEntry?.parcelName || parcelId;

        errors.push({
          code: 'SUBSTANCE_KG_EXCEEDED',
          message: `Maximale seizoensdosering "${substance}" overschreden op ${parcelName}: ${parcelKgUsed.toFixed(2)} + ${task.dosage} ${task.unit} > ${maxKgPerSeason} kg/ha.`,
          field: 'dosage',
          details: {
            substance,
            parcelId,
            parcelName,
            usedSoFar: parcelKgUsed,
            requested: task.dosage,
            max: maxKgPerSeason,
          }
        });
      }
    }

    // Build summary report (worst case across all sub-parcels)
    const report: SubstanceReport = {
      substanceName: substance,
      usedThisSeason: worstParcelKgUsed,
      maxPerSeason: maxKgPerSeason,
      applicationsThisSeason: worstParcelApplications,
      maxApplications,
      percentage: maxApplications ?
        Math.round((worstParcelApplications + 1) / maxApplications * 100) : null,
    };
    reports.push(report);

    // Add warnings for approaching limits (based on worst case)
    if (maxApplications && errors.length === 0) {
      const totalAfter = worstParcelApplications + 1;

      if (totalAfter === maxApplications) {
        warnings.push({
          code: 'SUBSTANCE_LIMIT_REACHED',
          message: `Let op: na deze toepassing is de limiet voor "${substance}" bereikt op ${worstParcelName} (${totalAfter}/${maxApplications}).`,
          severity: 'warning',
          details: { substance, countAfter: totalAfter, max: maxApplications, parcelName: worstParcelName },
        });
      } else if (worstParcelApplications >= maxApplications - 2) {
        warnings.push({
          code: 'SUBSTANCE_LIMIT_APPROACHING',
          message: `"${substance}" nadert limiet op ${worstParcelName}: ${totalAfter}/${maxApplications} toepassingen na deze bespuiting.`,
          severity: 'info',
          details: { substance, countAfter: totalAfter, max: maxApplications, parcelName: worstParcelName },
        });
      }
    }
  }

  return { errors, warnings, reports };
}


// ============================================
// Quick Validation (for real-time feedback)
// ============================================

/**
 * Quick validation for autocomplete/real-time feedback
 */
export function quickValidate(
  productName: string,
  dosage: number,
  unit: string,
  crop: string,
  ctgbProducts: Map<string, CtgbProduct>
): { valid: boolean; hint: string | null } {
  const searchName = productName.toLowerCase().trim();
  let product = ctgbProducts.get(searchName);

  if (!product) {
    // Try alias and fuzzy matching
    const { resolveAlias } = require('./product-matcher');
    const aliasTarget = resolveAlias(searchName);
    if (aliasTarget) product = ctgbProducts.get(aliasTarget.toLowerCase()) || undefined;
  }

  if (!product) {
    // Prefix match - prefer exact first-word match
    let bestPrefixMatch: CtgbProduct | undefined;
    let bestPrefixScore = Infinity;
    for (const [key, p] of ctgbProducts) {
      if (key.startsWith(searchName) || searchName.startsWith(key)) {
        const firstWord = key.split(/[\s-]/)[0];
        const score = firstWord === searchName ? 0 : (p.naam?.length || 999);
        if (score < bestPrefixScore) {
          bestPrefixScore = score;
          bestPrefixMatch = p;
        }
      }
    }
    product = bestPrefixMatch;
  }

  if (!product && searchName.length >= 5) {
    // Contains match - only for terms 5+ chars to prevent false positives
    let bestContainsMatch: CtgbProduct | undefined;
    let bestContainsScore = Infinity;
    for (const [key, p] of ctgbProducts) {
      if (key.includes(searchName) || searchName.includes(key)) {
        // Prefer word-start matches
        const words = key.split(/[\s-]/);
        const wordStart = words.some(w => w.startsWith(searchName)) ? 0 : 1000;
        const score = wordStart + (p.naam?.length || 999);
        if (score < bestContainsScore) {
          bestContainsScore = score;
          bestContainsMatch = p;
        }
      }
    }
    product = bestContainsMatch;
  }

  if (!product) {
    return { valid: false, hint: `Product "${productName}" niet gevonden` };
  }

  const voorschrift = findBestVoorschrift(product, crop);

  if (!voorschrift) {
    const allowedCrops = [...new Set(
      product.gebruiksvoorschriften?.map(v => v.gewas).filter(Boolean) || []
    )].join(', ');
    return {
      valid: false,
      hint: `${product.naam} niet toegelaten voor ${crop}. Wel voor: ${allowedCrops.substring(0, 100)}...`
    };
  }

  const maxDosage = parseDosering(voorschrift.dosering || '');
  if (maxDosage && dosage > maxDosage.value) {
    return {
      valid: false,
      hint: `Dosering te hoog: max ${voorschrift.dosering}`
    };
  }

  return { valid: true, hint: null };
}
