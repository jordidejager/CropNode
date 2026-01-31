/**
 * @fileOverview AgriBot Tools - Genkit Tool Definitions
 *
 * Deze tools kunnen door de AI worden aangeroepen om data op te halen.
 * De AI beslist zelf welke tools nodig zijn om een vraag te beantwoorden.
 *
 * Tools:
 * - searchProducts: Zoek CTGB producten op naam, gewas, of doelorganisme
 * - getProductDetails: Haal volledige details van een specifiek product
 * - getSprayHistory: Haal spuitgeschiedenis op (optioneel gefilterd)
 * - getParcelInfo: Haal perceel informatie op
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
    searchCtgbProducts,
    getCtgbProductByName,
    getLogbookEntries,
    getParcels,
    getParcelHistoryEntries,
} from '@/lib/supabase-store';
import { searchRegulations } from '@/lib/embedding-service';

// ============================================================================
// TOOL: Search Products
// ============================================================================

export const searchProductsTool = ai.defineTool(
    {
        name: 'searchProducts',
        description: 'Zoek gewasbeschermingsmiddelen in de CTGB database. ' +
            'Gebruik dit voor vragen over welke middelen beschikbaar zijn, ' +
            'middelen tegen specifieke plagen/ziektes, of middelen voor een gewas.',
        inputSchema: z.object({
            query: z.string().describe('Zoekterm: productnaam, werkzame stof, doelorganisme, of gewas'),
            limit: z.number().optional().default(5).describe('Maximum aantal resultaten (standaard 5)'),
        }),
        outputSchema: z.object({
            products: z.array(z.object({
                naam: z.string(),
                toelatingsnummer: z.string().optional(),
                werkzameStoffen: z.array(z.string()).optional(),
                categorie: z.string().optional(),
            })),
            totalFound: z.number(),
        }),
    },
    async (input) => {
        const results = await searchCtgbProducts(input.query);
        const limited = results.slice(0, input.limit || 5);

        return {
            products: limited.map(p => ({
                naam: p.naam,
                toelatingsnummer: p.toelatingsnummer || undefined,
                werkzameStoffen: p.werkzameStoffen || undefined,
                categorie: p.categorie || undefined,
            })),
            totalFound: results.length,
        };
    }
);

// ============================================================================
// TOOL: Get Product Details
// ============================================================================

export const getProductDetailsTool = ai.defineTool(
    {
        name: 'getProductDetails',
        description: 'Haal volledige details op van een specifiek gewasbeschermingsmiddel, ' +
            'inclusief gebruiksvoorschriften, doseringen, en toelatingsgegevens. ' +
            'Gebruik dit voor vragen over VGT, dosering, of specifieke regels van een product.',
        inputSchema: z.object({
            productName: z.string().describe('Exacte naam van het product'),
        }),
        outputSchema: z.object({
            found: z.boolean(),
            product: z.object({
                naam: z.string(),
                toelatingsnummer: z.string().optional(),
                werkzameStoffen: z.array(z.string()).optional(),
                categorie: z.string().optional(),
                formulering: z.string().optional(),
                gebruiksvoorschriften: z.array(z.object({
                    gewas: z.string().optional(),
                    dosering: z.string().optional(),
                    doelorganisme: z.string().optional(),
                    toepassingsvoorwaarden: z.string().optional(),
                })).optional(),
            }).optional(),
            suggestion: z.string().optional(),
        }),
    },
    async (input) => {
        const product = await getCtgbProductByName(input.productName);

        if (!product) {
            // Probeer te zoeken voor suggesties
            const searchResults = await searchCtgbProducts(input.productName);
            return {
                found: false,
                suggestion: searchResults.length > 0
                    ? `Bedoelde je misschien: ${searchResults.slice(0, 3).map(p => p.naam).join(', ')}?`
                    : undefined,
            };
        }

        return {
            found: true,
            product: {
                naam: product.naam,
                toelatingsnummer: product.toelatingsnummer || undefined,
                werkzameStoffen: product.werkzameStoffen || undefined,
                categorie: product.categorie || undefined,
                formulering: product.samenstelling?.formuleringstype || undefined,
                gebruiksvoorschriften: product.gebruiksvoorschriften?.slice(0, 5).map(v => ({
                    gewas: v.gewas || undefined,
                    dosering: v.dosering || undefined,
                    doelorganisme: v.doelorganisme || undefined,
                    toepassingsvoorwaarden: v.toepassingsmethode || undefined,
                })),
            },
        };
    }
);

// ============================================================================
// TOOL: Get Spray History
// ============================================================================

export const getSprayHistoryTool = ai.defineTool(
    {
        name: 'getSprayHistory',
        description: 'Haal de spuitgeschiedenis op uit het logboek. ' +
            'Kan gefilterd worden op product, perceel, of tijdsperiode. ' +
            'Gebruik dit voor vragen over wanneer/hoeveel er gespoten is.',
        inputSchema: z.object({
            productFilter: z.string().optional().describe('Filter op productnaam (partial match)'),
            parcelFilter: z.string().optional().describe('Filter op perceelnaam (partial match)'),
            daysBack: z.number().optional().default(365).describe('Aantal dagen terug (standaard 365)'),
            limit: z.number().optional().default(10).describe('Maximum aantal resultaten'),
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
            summary: z.object({
                totalApplications: z.number(),
                uniqueProducts: z.number(),
                dateRange: z.object({
                    from: z.string().optional(),
                    to: z.string().optional(),
                }),
            }),
        }),
    },
    async (input) => {
        const allEntries = await getLogbookEntries();
        const cutoff = new Date(Date.now() - (input.daysBack || 365) * 24 * 60 * 60 * 1000);

        // Filter entries that have parsedData and are within cutoff
        let filtered = allEntries.filter(e =>
            e.parsedData && new Date(e.date) >= cutoff
        );

        // Filter op product
        if (input.productFilter) {
            const productLower = input.productFilter.toLowerCase();
            filtered = filtered.filter(e =>
                e.parsedData?.products?.some((p: { product: string }) =>
                    p.product.toLowerCase().includes(productLower)
                )
            );
        }

        // Filter op perceel (plots are IDs, so we filter by ID match)
        if (input.parcelFilter) {
            const parcelLower = input.parcelFilter.toLowerCase();
            filtered = filtered.filter(e =>
                e.parsedData?.plots?.some((plotId: string) =>
                    plotId.toLowerCase().includes(parcelLower)
                )
            );
        }

        // Sorteer op datum (nieuwste eerst)
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Bereken summary
        const uniqueProducts = new Set<string>();
        for (const entry of filtered) {
            for (const p of entry.parsedData?.products || []) {
                uniqueProducts.add(p.product.toLowerCase());
            }
        }

        const dateStrings = filtered.map(e =>
            e.date instanceof Date ? e.date.toISOString() : String(e.date)
        ).sort();

        return {
            entries: filtered.slice(0, input.limit || 10).map(e => ({
                date: e.date instanceof Date ? e.date.toISOString() : String(e.date),
                parcels: e.parsedData?.plots || [],
                products: (e.parsedData?.products || []).map((p: { product: string; dosage: number; unit: string }) => ({
                    name: p.product,
                    dosage: p.dosage,
                    unit: p.unit,
                })),
            })),
            totalEntries: filtered.length,
            summary: {
                totalApplications: filtered.length,
                uniqueProducts: uniqueProducts.size,
                dateRange: {
                    from: dateStrings[0],
                    to: dateStrings[dateStrings.length - 1],
                },
            },
        };
    }
);

// ============================================================================
// TOOL: Get Parcel Info
// ============================================================================

export const getParcelInfoTool = ai.defineTool(
    {
        name: 'getParcelInfo',
        description: 'Haal informatie op over percelen. ' +
            'Kan zoeken op naam of alle percelen ophalen. ' +
            'Gebruik dit voor vragen over welke percelen er zijn of info over een specifiek perceel.',
        inputSchema: z.object({
            parcelName: z.string().optional().describe('Zoek op perceelnaam (partial match)'),
            includeHistory: z.boolean().optional().default(false).describe('Inclusief recente spuithistorie'),
        }),
        outputSchema: z.object({
            parcels: z.array(z.object({
                id: z.string(),
                name: z.string(),
                crop: z.string().optional(),
                variety: z.string().optional(),
                area: z.number().optional(),
                recentApplications: z.number().optional(),
            })),
            totalParcels: z.number(),
        }),
    },
    async (input) => {
        const allParcels = await getParcels();
        let filtered = allParcels;

        if (input.parcelName) {
            const nameLower = input.parcelName.toLowerCase();
            filtered = allParcels.filter(p =>
                p.name.toLowerCase().includes(nameLower) ||
                p.variety?.toLowerCase().includes(nameLower) ||
                p.crop?.toLowerCase().includes(nameLower)
            );
        }

        // Optioneel: haal history op
        let historyMap = new Map<string, number>();
        if (input.includeHistory) {
            const history = await getParcelHistoryEntries();
            for (const entry of history) {
                const count = historyMap.get(entry.parcelId) || 0;
                historyMap.set(entry.parcelId, count + 1);
            }
        }

        return {
            parcels: filtered.map(p => ({
                id: p.id,
                name: p.name,
                crop: p.crop || undefined,
                variety: p.variety || undefined,
                area: p.area || undefined,
                recentApplications: input.includeHistory ? (historyMap.get(p.id) || 0) : undefined,
            })),
            totalParcels: filtered.length,
        };
    }
);

// ============================================================================
// TOOL: Search Regulations (RAG)
// ============================================================================

export const searchRegulationsTool = ai.defineTool(
    {
        name: 'searchRegulations',
        description: 'Zoek in de CTGB kennisbank naar specifieke regelgeving en gebruiksvoorschriften. ' +
            'Gebruik dit voor vragen over: veiligheidstermijn (VGT), doseringen, wanneer een middel mag worden toegepast, ' +
            'beperkingen, W-codes voor waterbescherming, of andere regelgeving rond gewasbeschermingsmiddelen. ' +
            'Dit is een semantische zoekopdracht die relevante voorschriften vindt.',
        inputSchema: z.object({
            query: z.string().describe(
                'De vraag over regelgeving, bijvoorbeeld: "Mag ik Captan gebruiken vlak voor de oogst op appels?" ' +
                'of "Wat is de veiligheidstermijn van Luna Sensation op peer?"'
            ),
            filterGewas: z.string().optional().describe('Filter op gewas (bijv. "appel", "peer")'),
            filterProduct: z.string().optional().describe('Filter op productnaam'),
            limit: z.number().optional().default(5).describe('Maximum aantal resultaten'),
        }),
        outputSchema: z.object({
            results: z.array(z.object({
                productNaam: z.string(),
                gewas: z.string().nullable(),
                doelorganisme: z.string().nullable(),
                dosering: z.string().nullable(),
                veiligheidstermijn: z.string().nullable(),
                maxToepassingen: z.number().nullable(),
                relevantContent: z.string(),
                relevanceScore: z.number(),
            })),
            totalFound: z.number(),
            searchQuery: z.string(),
        }),
    },
    async (input) => {
        try {
            const results = await searchRegulations(input.query, {
                threshold: 0.4,
                limit: input.limit || 5,
                filterGewas: input.filterGewas,
                filterProduct: input.filterProduct,
            });

            return {
                results: results.map((r) => ({
                    productNaam: r.productNaam,
                    gewas: r.gewas,
                    doelorganisme: r.doelorganisme,
                    dosering: r.dosering,
                    veiligheidstermijn: r.veiligheidstermijn,
                    maxToepassingen: r.maxToepassingen,
                    relevantContent: r.content,
                    relevanceScore: Math.round(r.similarity * 100) / 100,
                })),
                totalFound: results.length,
                searchQuery: input.query,
            };
        } catch (error) {
            console.error('searchRegulations error:', error);
            // Return empty results on error (embeddings may not be generated yet)
            return {
                results: [],
                totalFound: 0,
                searchQuery: input.query,
            };
        }
    }
);

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

export const agribotTools = [
    searchProductsTool,
    getProductDetailsTool,
    getSprayHistoryTool,
    getParcelInfoTool,
    searchRegulationsTool,
];
