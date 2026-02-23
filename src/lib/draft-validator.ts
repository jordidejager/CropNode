/**
 * Draft Validator - Server-side business validation layer
 *
 * Validates EVERY draft before it goes to the UI, regardless of whether
 * it came from the pipeline or the agent. This is a hard, deterministic check.
 *
 * Validations:
 * 1. Parcel consistency - every parcel ID must exist in UserContext
 * 2. No duplicates - a parcel can't be in two units simultaneously (unless products differ)
 * 3. Date logic - no future dates, no dates older than 14 days
 * 4. Product presence - each unit must have at least 1 product
 * 5. Dosage range - dosage must be > 0 and < max CTGB dosage
 * 6. Total check - area × dosage = total usage - is this realistic?
 *
 * If validation fails, we DON'T block the draft but mark invalid fields
 * and show a warning in the UI. The farmer can choose to continue or adjust.
 */

import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from './types';
import type { SmartInputUserContext, CtgbProductSlim } from './types-v2';

// ============================================================================
// TYPES
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface DraftValidationIssue {
    severity: ValidationSeverity;
    code: string;
    message: string;
    field?: string;        // Which field has the issue (e.g., 'plots', 'dosage', 'date')
    unitId?: string;       // Which unit has the issue
    productIndex?: number; // Which product in the unit
    parcelId?: string;     // Which parcel has the issue
    suggestion?: string;   // Suggested fix
}

export interface DraftValidationResult {
    isValid: boolean;           // true if no errors (warnings are OK)
    issues: DraftValidationIssue[];
    errorCount: number;
    warningCount: number;
    infoCount: number;
}

interface ParcelInfo {
    id: string;
    name: string;
    crop: string;
    variety: string | null;
    area: number | null;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export function validateDraft(
    draft: SprayRegistrationGroup,
    userContext: SmartInputUserContext
): DraftValidationResult {
    const issues: DraftValidationIssue[] = [];

    // Run all validations
    validateParcelConsistency(draft, userContext.parcels, issues);
    validateNoDuplicateParcels(draft, issues);
    validateDateLogic(draft, issues);
    validateProductPresence(draft, issues);
    validateDosageRange(draft, userContext.products, issues);
    validateTotalUsage(draft, userContext.parcels, issues);

    // Count by severity
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    return {
        isValid: errorCount === 0,
        issues,
        errorCount,
        warningCount,
        infoCount,
    };
}

// ============================================================================
// VALIDATION 1: PARCEL CONSISTENCY
// ============================================================================

function validateParcelConsistency(
    draft: SprayRegistrationGroup,
    parcels: ParcelInfo[],
    issues: DraftValidationIssue[]
): void {
    const parcelIds = new Set(parcels.map(p => p.id));

    for (const unit of draft.units) {
        for (const plotId of unit.plots) {
            if (!parcelIds.has(plotId)) {
                issues.push({
                    severity: 'error',
                    code: 'UNKNOWN_PARCEL',
                    message: `Onbekend perceel ID: ${plotId.substring(0, 8)}...`,
                    field: 'plots',
                    unitId: unit.id,
                    parcelId: plotId,
                    suggestion: 'Verwijder dit perceel of kies een ander perceel.',
                });
            }
        }
    }
}

// ============================================================================
// VALIDATION 2: NO DUPLICATE PARCELS
// ============================================================================

function validateNoDuplicateParcels(
    draft: SprayRegistrationGroup,
    issues: DraftValidationIssue[]
): void {
    // Track which parcels are in which units with which products
    const parcelUsage = new Map<string, Array<{ unitId: string; products: string[] }>>();

    for (const unit of draft.units) {
        const productNames = unit.products.map(p => p.product).sort().join(',');

        for (const plotId of unit.plots) {
            const existing = parcelUsage.get(plotId) || [];

            // Check if this parcel is already used with the SAME products
            const duplicateWithSameProducts = existing.find(e => e.products.join(',') === productNames);

            if (duplicateWithSameProducts) {
                issues.push({
                    severity: 'warning',
                    code: 'DUPLICATE_PARCEL',
                    message: `Perceel komt in meerdere units voor met dezelfde producten`,
                    field: 'plots',
                    unitId: unit.id,
                    parcelId: plotId,
                    suggestion: 'Controleer of dit correct is - mogelijk dubbele registratie.',
                });
            }

            existing.push({ unitId: unit.id, products: productNames.split(',') });
            parcelUsage.set(plotId, existing);
        }
    }
}

// ============================================================================
// VALIDATION 3: DATE LOGIC
// ============================================================================

function validateDateLogic(
    draft: SprayRegistrationGroup,
    issues: DraftValidationIssue[]
): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check main draft date
    const draftDate = draft.date instanceof Date ? draft.date : new Date(draft.date);
    const draftDateOnly = new Date(draftDate.getFullYear(), draftDate.getMonth(), draftDate.getDate());

    if (draftDateOnly >= tomorrow) {
        issues.push({
            severity: 'warning',
            code: 'FUTURE_DATE',
            message: `Datum ligt in de toekomst: ${formatDate(draftDate)}`,
            field: 'date',
            suggestion: 'Registraties zijn meestal voor vandaag of het verleden.',
        });
    }

    if (draftDateOnly < ninetyDaysAgo) {
        issues.push({
            severity: 'error',
            code: 'TOO_OLD_DATE',
            message: `Datum is ouder dan 90 dagen: ${formatDate(draftDate)}`,
            field: 'date',
            suggestion: 'Registraties ouder dan 90 dagen zijn niet toegestaan.',
        });
    }

    // Check unit-specific dates if they differ
    for (const unit of draft.units) {
        if (unit.date) {
            const unitDate = unit.date instanceof Date ? unit.date : new Date(unit.date);
            const unitDateOnly = new Date(unitDate.getFullYear(), unitDate.getMonth(), unitDate.getDate());

            if (unitDateOnly >= tomorrow) {
                issues.push({
                    severity: 'warning',
                    code: 'FUTURE_DATE',
                    message: `Unit datum ligt in de toekomst: ${formatDate(unitDate)}`,
                    field: 'date',
                    unitId: unit.id,
                    suggestion: 'Registraties zijn meestal voor vandaag of het verleden.',
                });
            }

            if (unitDateOnly < ninetyDaysAgo) {
                issues.push({
                    severity: 'error',
                    code: 'TOO_OLD_DATE',
                    message: `Unit datum is ouder dan 90 dagen: ${formatDate(unitDate)}`,
                    field: 'date',
                    unitId: unit.id,
                    suggestion: 'Registraties ouder dan 90 dagen zijn niet toegestaan.',
                });
            }
        }
    }
}

// ============================================================================
// VALIDATION 4: PRODUCT PRESENCE
// ============================================================================

function validateProductPresence(
    draft: SprayRegistrationGroup,
    issues: DraftValidationIssue[]
): void {
    for (const unit of draft.units) {
        if (unit.products.length === 0) {
            issues.push({
                severity: 'error',
                code: 'NO_PRODUCTS',
                message: 'Unit heeft geen producten',
                field: 'products',
                unitId: unit.id,
                suggestion: 'Voeg minimaal één product toe aan deze unit.',
            });
        }
    }
}

// ============================================================================
// VALIDATION 5: DOSAGE RANGE
// ============================================================================

function validateDosageRange(
    draft: SprayRegistrationGroup,
    products: CtgbProductSlim[],
    issues: DraftValidationIssue[]
): void {
    for (const unit of draft.units) {
        for (let i = 0; i < unit.products.length; i++) {
            const product = unit.products[i];

            // Check for zero dosage (not specified yet)
            if (product.dosage === 0) {
                issues.push({
                    severity: 'info',
                    code: 'ZERO_DOSAGE',
                    message: `Dosering voor ${product.product} is nog niet ingevuld`,
                    field: 'dosage',
                    unitId: unit.id,
                    productIndex: i,
                    suggestion: 'Vul de dosering in.',
                });
                continue;
            }

            // Check for negative dosage
            if (product.dosage < 0) {
                issues.push({
                    severity: 'error',
                    code: 'NEGATIVE_DOSAGE',
                    message: `Negatieve dosering voor ${product.product}: ${product.dosage}`,
                    field: 'dosage',
                    unitId: unit.id,
                    productIndex: i,
                    suggestion: 'Dosering moet positief zijn.',
                });
                continue;
            }

            // Find CTGB product for max dosage check
            const ctgbProduct = products.find(p =>
                p.naam.toLowerCase() === product.product.toLowerCase() ||
                p.naam.toLowerCase().includes(product.product.toLowerCase())
            );

            if (ctgbProduct?.gebruiksvoorschriften?.length) {
                const maxDosage = getMaxDosageFromProduct(ctgbProduct, product.unit);

                if (maxDosage && product.dosage > maxDosage.value * 1.1) {
                    // Allow 10% tolerance
                    issues.push({
                        severity: 'warning',
                        code: 'HIGH_DOSAGE',
                        message: `Dosering ${product.dosage} ${product.unit} voor ${product.product} is hoger dan maximum ${maxDosage.value} ${maxDosage.unit}`,
                        field: 'dosage',
                        unitId: unit.id,
                        productIndex: i,
                        suggestion: `Maximum toegestane dosering is ${maxDosage.value} ${maxDosage.unit}.`,
                    });
                }
            }

            // Check for unrealistically high dosages
            const unitLower = product.unit.toLowerCase();
            if (unitLower.includes('l') && product.dosage > 50) {
                issues.push({
                    severity: 'warning',
                    code: 'VERY_HIGH_DOSAGE',
                    message: `Dosering ${product.dosage} ${product.unit} lijkt erg hoog`,
                    field: 'dosage',
                    unitId: unit.id,
                    productIndex: i,
                    suggestion: 'Controleer of de dosering correct is.',
                });
            }
            if (unitLower.includes('kg') && product.dosage > 100) {
                issues.push({
                    severity: 'warning',
                    code: 'VERY_HIGH_DOSAGE',
                    message: `Dosering ${product.dosage} ${product.unit} lijkt erg hoog`,
                    field: 'dosage',
                    unitId: unit.id,
                    productIndex: i,
                    suggestion: 'Controleer of de dosering correct is.',
                });
            }
        }
    }
}

// ============================================================================
// VALIDATION 6: TOTAL USAGE CHECK
// ============================================================================

function validateTotalUsage(
    draft: SprayRegistrationGroup,
    parcels: ParcelInfo[],
    issues: DraftValidationIssue[]
): void {
    for (const unit of draft.units) {
        // Calculate total area for this unit
        let totalArea = 0;
        for (const plotId of unit.plots) {
            const parcel = parcels.find(p => p.id === plotId);
            if (parcel?.area) {
                totalArea += parcel.area;
            }
        }

        if (totalArea === 0) {
            continue; // Can't validate without area data
        }

        // Check each product's total usage
        for (let i = 0; i < unit.products.length; i++) {
            const product = unit.products[i];
            if (product.dosage === 0) continue;

            const totalUsage = totalArea * product.dosage;
            const unitLower = product.unit.toLowerCase();

            // Sanity checks for total usage
            if (unitLower.includes('l')) {
                // For liquids: warn if total > 500L (very large operation)
                if (totalUsage > 500) {
                    issues.push({
                        severity: 'info',
                        code: 'HIGH_TOTAL_USAGE',
                        message: `Totaal verbruik ${product.product}: ${totalUsage.toFixed(1)} L over ${totalArea.toFixed(2)} ha`,
                        field: 'dosage',
                        unitId: unit.id,
                        productIndex: i,
                    });
                }
            } else if (unitLower.includes('kg')) {
                // For solids: warn if total > 500kg
                if (totalUsage > 500) {
                    issues.push({
                        severity: 'info',
                        code: 'HIGH_TOTAL_USAGE',
                        message: `Totaal verbruik ${product.product}: ${totalUsage.toFixed(1)} kg over ${totalArea.toFixed(2)} ha`,
                        field: 'dosage',
                        unitId: unit.id,
                        productIndex: i,
                    });
                }
            }
        }
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(date: Date): string {
    return date.toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

interface ParsedDosage {
    value: number;
    unit: string;
}

function getMaxDosageFromProduct(
    product: CtgbProductSlim,
    requestedUnit: string
): ParsedDosage | null {
    if (!product.gebruiksvoorschriften?.length) return null;

    let maxValue = 0;
    let maxUnit = '';

    for (const voorschrift of product.gebruiksvoorschriften) {
        const parsed = parseDosering(voorschrift.dosering || '');
        if (parsed && parsed.value > maxValue) {
            maxValue = parsed.value;
            maxUnit = parsed.unit;
        }
    }

    if (maxValue === 0) return null;

    return { value: maxValue, unit: maxUnit };
}

function parseDosering(dosering: string): ParsedDosage | null {
    if (!dosering) return null;

    // Match patterns like "2,5 kg/ha", "1.5 l/ha", "30 l", "2,5 kg"
    const match = dosering.match(/(\d+[,.]?\d*)\s*(kg|g|l|ml|liter)/i);
    if (!match) return null;

    const value = parseFloat(match[1].replace(',', '.'));
    let unit = match[2].toLowerCase();

    // Normalize units
    if (unit === 'liter') unit = 'l';
    if (unit === 'ml') {
        return { value: value / 1000, unit: 'l' };
    }
    if (unit === 'g') {
        return { value: value / 1000, unit: 'kg' };
    }

    return { value, unit };
}

// ============================================================================
// UTILITY: Format validation result for logging
// ============================================================================

export function formatValidationResult(result: DraftValidationResult): string {
    if (result.issues.length === 0) {
        return '✓ Draft validation passed';
    }

    const lines = [
        `Draft validation: ${result.errorCount} errors, ${result.warningCount} warnings, ${result.infoCount} info`,
    ];

    for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        lines.push(`  ${icon} [${issue.code}] ${issue.message}`);
    }

    return lines.join('\n');
}
