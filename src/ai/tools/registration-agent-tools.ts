/**
 * Registration Agent Tools
 *
 * Tools voor de Slimme Invoer 2.0 Registration Agent.
 * Deze tools worden door de agent aangeroepen tijdens multi-turn conversaties.
 *
 * Tools:
 * - get_parcels: Percelen ophalen (gefilterd op gewas/ras)
 * - resolve_product: Product naam/alias resolven naar CTGB product
 * - validate_registration: CTGB validatie van registratie
 * - get_spray_history: Spuithistorie ophalen
 * - save_registration: Registratie opslaan naar spuitschrift
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
    getParcels,
    getSpuitschriftEntries,
    addSpuitschriftEntry,
    getAllCtgbProducts,
    getParcelHistoryEntries,
    getUserPreferences,
    getSprayableParcels,
    type SprayableParcel,
} from '@/lib/supabase-store';
import { resolveProductAlias, type ResolvedProduct } from '@/lib/product-aliases';
import {
    validateSprayApplication,
    validateParsedSprayData,
    type ValidationResult,
    type ValidationFlag,
} from '@/lib/validation-service';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry, SpuitschriftEntry, Parcel } from '@/lib/types';

// ============================================================================
// TOOL: Get Parcels
// ============================================================================

export const getParcelsTool = ai.defineTool(
    {
        name: 'get_parcels',
        description: 'Haal alle percelen/blokken op voor de gebruiker. ' +
            'Kan gefilterd worden op gewas (Appel/Peer) of ras. ' +
            'Gebruik dit om te weten welke percelen beschikbaar zijn.',
        inputSchema: z.object({
            filter: z.object({
                gewas: z.string().optional().describe('Filter op gewas: "Appel" of "Peer"'),
                ras: z.string().optional().describe('Filter op ras, bijv. "Elstar", "Conference"'),
            }).optional().describe('Optionele filters'),
        }),
        outputSchema: z.object({
            parcels: z.array(z.object({
                id: z.string(),
                name: z.string(),
                crop: z.string(),
                variety: z.string(),
                area: z.number(),
            })),
            totalCount: z.number(),
            cropSummary: z.object({
                appel: z.number(),
                peer: z.number(),
            }),
        }),
    },
    async (input) => {
        // Get sprayable parcels (sub-parcels with all info)
        const allParcels = await getSprayableParcels();

        let filtered = allParcels;

        // Filter on crop
        if (input.filter?.gewas) {
            const gewasLower = input.filter.gewas.toLowerCase();
            filtered = filtered.filter(p =>
                p.crop?.toLowerCase() === gewasLower ||
                p.crop?.toLowerCase().includes(gewasLower)
            );
        }

        // Filter on variety
        if (input.filter?.ras) {
            const rasLower = input.filter.ras.toLowerCase();
            filtered = filtered.filter(p =>
                p.variety?.toLowerCase() === rasLower ||
                p.variety?.toLowerCase().includes(rasLower)
            );
        }

        // Calculate crop summary
        const appelCount = allParcels.filter(p =>
            p.crop?.toLowerCase() === 'appel'
        ).length;
        const peerCount = allParcels.filter(p =>
            p.crop?.toLowerCase() === 'peer'
        ).length;

        return {
            parcels: filtered.map(p => ({
                id: p.id,
                name: p.name,
                crop: p.crop || 'Onbekend',
                variety: p.variety || 'Onbekend',
                area: p.area || 0,
            })),
            totalCount: filtered.length,
            cropSummary: {
                appel: appelCount,
                peer: peerCount,
            },
        };
    }
);

// ============================================================================
// TOOL: Resolve Product
// ============================================================================

export const resolveProductTool = ai.defineTool(
    {
        name: 'resolve_product',
        description: 'Resolve een productnaam of alias naar het officiële CTGB product. ' +
            'Gebruik dit wanneer de gebruiker een productnaam noemt die je niet herkent, ' +
            'of wanneer je zeker wilt weten welk product bedoeld wordt. ' +
            'Bijv. "captan" → "Merpan Spuitkorrel", "het schurftmiddel" → vraag om verduidelijking.',
        inputSchema: z.object({
            productQuery: z.string().describe('De productnaam of alias die de gebruiker noemde'),
        }),
        outputSchema: z.object({
            found: z.boolean(),
            officialName: z.string().optional(),
            toelatingsnummer: z.string().optional(),
            confidence: z.number().describe('0-100, hoe zeker de match is'),
            werkzameStoffen: z.array(z.string()).optional(),
            alternatives: z.array(z.object({
                name: z.string(),
                confidence: z.number(),
            })).optional().describe('Alternatieve matches als confidence laag is'),
            needsClarification: z.boolean().describe('True als er meerdere mogelijke matches zijn'),
        }),
    },
    async (input) => {
        const [ctgbProducts, userPreferences, parcelHistory] = await Promise.all([
            getAllCtgbProducts(),
            getUserPreferences(),
            getParcelHistoryEntries(),
        ]);

        const resolved = await resolveProductAlias(
            input.productQuery,
            ctgbProducts,
            userPreferences,
            parcelHistory
        );

        // Find the full product info
        const matchedProduct = ctgbProducts.find(p =>
            p.naam?.toLowerCase() === resolved.resolvedName.toLowerCase()
        );

        // Check for multiple possible matches if confidence is low
        let alternatives: Array<{ name: string; confidence: number }> = [];
        let needsClarification = false;

        if (resolved.confidence < 80) {
            // Search for similar products
            const queryLower = input.productQuery.toLowerCase();
            const similarProducts = ctgbProducts
                .filter(p => p.naam?.toLowerCase().includes(queryLower))
                .slice(0, 5)
                .map(p => ({
                    name: p.naam,
                    confidence: 60,
                }));

            if (similarProducts.length > 1) {
                alternatives = similarProducts;
                needsClarification = true;
            }
        }

        return {
            found: resolved.confidence > 0,
            officialName: resolved.confidence > 0 ? resolved.resolvedName : undefined,
            toelatingsnummer: matchedProduct?.toelatingsnummer || undefined,
            confidence: resolved.confidence,
            werkzameStoffen: matchedProduct?.werkzameStoffen || undefined,
            alternatives: alternatives.length > 0 ? alternatives : undefined,
            needsClarification,
        };
    }
);

// ============================================================================
// TOOL: Validate Registration
// ============================================================================

export const validateRegistrationTool = ai.defineTool(
    {
        name: 'validate_registration',
        description: 'Valideer een (deel van) registratie tegen CTGB regels. ' +
            'Controleert: gewastoelating, dosering, interval, max toepassingen, werkzame stof cumulatie, veiligheidstermijn. ' +
            'Gebruik dit na elke wijziging aan de registratie.',
        inputSchema: z.object({
            registration: z.object({
                date: z.string().describe('Spuitdatum in YYYY-MM-DD formaat'),
                units: z.array(z.object({
                    plots: z.array(z.string()).describe('Perceel IDs'),
                    products: z.array(z.object({
                        product: z.string(),
                        dosage: z.number(),
                        unit: z.string(),
                    })),
                })),
            }),
        }),
        outputSchema: z.object({
            isValid: z.boolean(),
            flags: z.array(z.object({
                type: z.enum(['error', 'warning', 'info']),
                message: z.string(),
                field: z.string().optional(),
            })),
            summary: z.string().describe('Korte samenvatting van de validatie'),
        }),
    },
    async (input) => {
        const [allCtgbProducts, parcelHistory, sprayableParcels] = await Promise.all([
            getAllCtgbProducts(),
            getParcelHistoryEntries(),
            getSprayableParcels(),
        ]);

        const applicationDate = new Date(input.registration.date);
        const allFlags: ValidationFlag[] = [];

        // Create a map for quick parcel lookup
        const parcelMap = new Map(sprayableParcels.map(p => [p.id, p]));

        // Validate each unit
        for (const unit of input.registration.units) {
            for (const productEntry of unit.products) {
                // Find the CTGB product
                const ctgbProduct = allCtgbProducts.find(p =>
                    p.naam?.toLowerCase() === productEntry.product.toLowerCase()
                );

                if (!ctgbProduct) {
                    allFlags.push({
                        type: 'warning',
                        message: `Product "${productEntry.product}" niet gevonden in CTGB database`,
                        field: 'products',
                    });
                    continue;
                }

                // Validate for each parcel
                for (const plotId of unit.plots) {
                    const parcel = parcelMap.get(plotId);
                    if (!parcel) continue;

                    // Convert SprayableParcel to Parcel format for validation
                    const parcelForValidation: Parcel = {
                        id: parcel.id,
                        name: parcel.name,
                        area: parcel.area || 0,
                        crop: parcel.crop || undefined,
                        variety: parcel.variety || undefined,
                        subParcels: [{
                            id: parcel.id,
                            parcelId: parcel.id,
                            crop: parcel.crop || 'Onbekend',
                            variety: parcel.variety || 'Onbekend',
                            area: parcel.area || 0,
                            irrigationType: 'Nee',
                        }],
                    };

                    // Filter history for this parcel
                    const parcelSeasonHistory = parcelHistory.filter(h =>
                        h.parcelId === plotId &&
                        new Date(h.date).getFullYear() === applicationDate.getFullYear()
                    );

                    const result = await validateSprayApplication(
                        parcelForValidation,
                        ctgbProduct,
                        productEntry.dosage,
                        productEntry.unit,
                        applicationDate,
                        parcelSeasonHistory,
                        allCtgbProducts
                    );

                    // Add flags (deduplicate by message)
                    for (const flag of result.flags) {
                        const exists = allFlags.some(f => f.message === flag.message);
                        if (!exists) {
                            allFlags.push(flag);
                        }
                    }
                }
            }
        }

        const errorCount = allFlags.filter(f => f.type === 'error').length;
        const warningCount = allFlags.filter(f => f.type === 'warning').length;

        let summary = '';
        if (errorCount === 0 && warningCount === 0) {
            summary = 'Registratie is geldig volgens CTGB regels.';
        } else if (errorCount === 0) {
            summary = `Registratie is geldig met ${warningCount} waarschuwing${warningCount > 1 ? 'en' : ''}.`;
        } else {
            summary = `Registratie heeft ${errorCount} fout${errorCount > 1 ? 'en' : ''} en ${warningCount} waarschuwing${warningCount > 1 ? 'en' : ''}.`;
        }

        return {
            isValid: errorCount === 0,
            flags: allFlags.map(f => ({
                type: f.type,
                message: f.message,
                field: f.field,
            })),
            summary,
        };
    }
);

// ============================================================================
// TOOL: Get Spray History
// ============================================================================

export const getSprayHistoryTool = ai.defineTool(
    {
        name: 'get_spray_history',
        description: 'Haal de spuithistorie op uit het spuitschrift. ' +
            'Gebruik dit voor: interval-checks, dosering-suggesties, "hetzelfde als vorige keer", ' +
            'of om te zien wat er recent gespoten is.',
        inputSchema: z.object({
            parcelIds: z.array(z.string()).optional().describe('Filter op specifieke percelen'),
            productName: z.string().optional().describe('Filter op productnaam'),
            daysBack: z.number().optional().default(90).describe('Aantal dagen terug (standaard 90)'),
        }),
        outputSchema: z.object({
            entries: z.array(z.object({
                date: z.string(),
                parcels: z.array(z.string()),
                products: z.array(z.object({
                    name: z.string(),
                    dosage: z.number().optional(),
                    unit: z.string().optional(),
                })),
            })),
            totalEntries: z.number(),
            lastApplicationDate: z.string().optional().describe('Datum van laatste bespuiting'),
            frequentDosages: z.array(z.object({
                product: z.string(),
                dosage: z.number(),
                unit: z.string(),
                count: z.number(),
            })).optional().describe('Veelgebruikte doseringen per product'),
        }),
    },
    async (input) => {
        const allEntries = await getSpuitschriftEntries();
        const cutoff = new Date(Date.now() - (input.daysBack || 90) * 24 * 60 * 60 * 1000);

        // Filter entries within cutoff
        let filtered = allEntries.filter(e => new Date(e.date) >= cutoff);

        // Filter on parcels
        if (input.parcelIds && input.parcelIds.length > 0) {
            filtered = filtered.filter(e =>
                e.plots.some(p => input.parcelIds!.includes(p))
            );
        }

        // Filter on product
        if (input.productName) {
            const productLower = input.productName.toLowerCase();
            filtered = filtered.filter(e =>
                e.products.some(p => p.product.toLowerCase().includes(productLower))
            );
        }

        // Sort by date (newest first)
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate frequent dosages
        const dosageCounts = new Map<string, { dosage: number; unit: string; count: number }>();
        for (const entry of filtered) {
            for (const product of entry.products) {
                const key = `${product.product}:${product.dosage}:${product.unit}`;
                const existing = dosageCounts.get(key);
                if (existing) {
                    existing.count++;
                } else {
                    dosageCounts.set(key, {
                        dosage: product.dosage,
                        unit: product.unit,
                        count: 1,
                    });
                }
            }
        }

        const frequentDosages = Array.from(dosageCounts.entries())
            .map(([key, value]) => ({
                product: key.split(':')[0],
                dosage: value.dosage,
                unit: value.unit,
                count: value.count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            entries: filtered.slice(0, 10).map(e => ({
                date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : String(e.date).split('T')[0],
                parcels: e.plots,
                products: e.products.map(p => ({
                    name: p.product,
                    dosage: p.dosage,
                    unit: p.unit,
                })),
            })),
            totalEntries: filtered.length,
            lastApplicationDate: filtered.length > 0
                ? (filtered[0].date instanceof Date ? filtered[0].date.toISOString().split('T')[0] : String(filtered[0].date).split('T')[0])
                : undefined,
            frequentDosages: frequentDosages.length > 0 ? frequentDosages : undefined,
        };
    }
);

// ============================================================================
// TOOL: Save Registration
// ============================================================================

export const saveRegistrationTool = ai.defineTool(
    {
        name: 'save_registration',
        description: 'Sla een bevestigde registratie op naar het spuitschrift. ' +
            'ALLEEN aanroepen wanneer de gebruiker expliciet bevestigt ("opslaan", "klopt", "bevestig"). ' +
            'NOOIT automatisch opslaan zonder bevestiging.',
        inputSchema: z.object({
            registration: z.object({
                groupId: z.string(),
                date: z.string().describe('Spuitdatum in YYYY-MM-DD formaat'),
                rawInput: z.string().describe('Originele invoer van gebruiker'),
                units: z.array(z.object({
                    id: z.string(),
                    plots: z.array(z.string()),
                    products: z.array(z.object({
                        product: z.string(),
                        dosage: z.number(),
                        unit: z.string(),
                        targetReason: z.string().optional(),
                    })),
                    date: z.string().optional().describe('Override datum voor deze unit'),
                })),
            }),
            userId: z.string().describe('User ID voor authenticatie'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            savedCount: z.number().describe('Aantal opgeslagen units'),
            spuitschriftIds: z.array(z.string()).describe('IDs van opgeslagen entries'),
            error: z.string().optional(),
        }),
    },
    async (input) => {
        const savedIds: string[] = [];

        try {
            for (const unit of input.registration.units) {
                const unitDate = unit.date || input.registration.date;

                const entry = await addSpuitschriftEntry(
                    {
                        originalLogbookId: null,
                        originalRawInput: input.registration.rawInput,
                        date: new Date(unitDate),
                        createdAt: new Date(),
                        plots: unit.plots,
                        products: unit.products.map(p => ({
                            product: p.product,
                            dosage: p.dosage,
                            unit: p.unit,
                            targetReason: p.targetReason,
                        })),
                        status: 'Akkoord',
                    },
                    input.userId
                );

                savedIds.push(entry.id);
            }

            return {
                success: true,
                savedCount: savedIds.length,
                spuitschriftIds: savedIds,
            };
        } catch (error) {
            console.error('[saveRegistrationTool] Error:', error);
            return {
                success: false,
                savedCount: savedIds.length,
                spuitschriftIds: savedIds,
                error: error instanceof Error ? error.message : 'Onbekende fout bij opslaan',
            };
        }
    }
);

// ============================================================================
// Export all tools
// ============================================================================

export const registrationAgentTools = [
    getParcelsTool,
    resolveProductTool,
    validateRegistrationTool,
    getSprayHistoryTool,
    saveRegistrationTool,
];
