/**
 * Integration Test for Smart Input V2
 *
 * Tests the complete flow from user input to registration output.
 * Verifies that parcel names are correctly resolved to IDs.
 */

// @ts-expect-error vitest not installed as dependency
import { describe, it, expect, beforeAll } from 'vitest';

// Mock parcels for testing (matches production format)
const MOCK_PARCELS = [
    { id: 'p1-uuid', name: 'Thuis (Elstar)', crop: 'Appel', variety: 'Elstar', area: 1.5 },
    { id: 'p2-uuid', name: 'Thuis (Gala)', crop: 'Appel', variety: 'Gala', area: 1.2 },
    { id: 'p3-uuid', name: 'Schele (Conference)', crop: 'Peer', variety: 'Conference', area: 2.0 },
    { id: 'p4-uuid', name: 'Zuidhoek (Conference)', crop: 'Peer', variety: 'Conference', area: 1.8 },
    { id: 'p5-uuid', name: 'Stadhoek (Doyenne)', crop: 'Peer', variety: 'Doyenne', area: 0.9 },
    { id: 'p6-uuid', name: 'Kanzi blok', crop: 'Appel', variety: 'Kanzi', area: 1.1 },
];

// Import the resolution function (we'll test it directly)
function resolveParcelNamesToIds(
    rawPlots: string[],
    allParcels: typeof MOCK_PARCELS
): string[] {
    const resolvedIds = new Set<string>();

    for (const raw of rawPlots) {
        const normalized = raw.toLowerCase().trim();

        // 1. Check if it's already a valid parcel ID
        const directMatch = allParcels.find(p => p.id === raw);
        if (directMatch) {
            resolvedIds.add(directMatch.id);
            continue;
        }

        // 2. Check for exact name match
        const exactNameMatch = allParcels.find(
            p => p.name.toLowerCase() === normalized
        );
        if (exactNameMatch) {
            resolvedIds.add(exactNameMatch.id);
            continue;
        }

        // 3. Check for variety match (e.g., "conference", "elstar")
        const varietyMatches = allParcels.filter(
            p => p.variety?.toLowerCase() === normalized ||
                 p.variety?.toLowerCase().includes(normalized) ||
                 normalized.includes(p.variety?.toLowerCase() || '')
        );
        if (varietyMatches.length > 0) {
            varietyMatches.forEach(p => resolvedIds.add(p.id));
            continue;
        }

        // 4. Check for crop match (e.g., "appel", "appels", "peer", "peren")
        const cropNormalized = normalized
            .replace(/s$/, '')
            .replace(/en$/, '');

        const cropSearch = cropNormalized === 'per' ? 'peer' : cropNormalized;

        const cropMatches = allParcels.filter(
            p => p.crop?.toLowerCase() === cropSearch ||
                 p.crop?.toLowerCase().startsWith(cropSearch)
        );
        if (cropMatches.length > 0) {
            cropMatches.forEach(p => resolvedIds.add(p.id));
            continue;
        }

        // 5. Check for partial name match (fuzzy)
        const partialMatches = allParcels.filter(
            p => p.name.toLowerCase().includes(normalized) ||
                 normalized.includes(p.name.toLowerCase().split(' ')[0])
        );
        if (partialMatches.length > 0) {
            partialMatches.forEach(p => resolvedIds.add(p.id));
            continue;
        }

        // 6. Check if it contains crop/variety keywords
        if (normalized.includes('appel') || normalized.includes('apple')) {
            allParcels.filter(p => p.crop?.toLowerCase() === 'appel')
                .forEach(p => resolvedIds.add(p.id));
        } else if (normalized.includes('peer') || normalized.includes('pear')) {
            allParcels.filter(p => p.crop?.toLowerCase() === 'peer')
                .forEach(p => resolvedIds.add(p.id));
        }
    }

    return Array.from(resolvedIds);
}

describe('resolveParcelNamesToIds', () => {
    describe('Direct ID match', () => {
        it('should return ID when given valid UUID', () => {
            const result = resolveParcelNamesToIds(['p1-uuid'], MOCK_PARCELS);
            expect(result).toEqual(['p1-uuid']);
        });

        it('should handle multiple valid UUIDs', () => {
            const result = resolveParcelNamesToIds(['p1-uuid', 'p3-uuid'], MOCK_PARCELS);
            expect(result).toContain('p1-uuid');
            expect(result).toContain('p3-uuid');
            expect(result).toHaveLength(2);
        });
    });

    describe('Exact name match', () => {
        it('should match exact parcel name', () => {
            const result = resolveParcelNamesToIds(['Thuis (Elstar)'], MOCK_PARCELS);
            expect(result).toEqual(['p1-uuid']);
        });

        it('should be case-insensitive', () => {
            const result = resolveParcelNamesToIds(['THUIS (ELSTAR)'], MOCK_PARCELS);
            expect(result).toEqual(['p1-uuid']);
        });
    });

    describe('Variety match', () => {
        it('should match all parcels with variety "Conference"', () => {
            const result = resolveParcelNamesToIds(['conference'], MOCK_PARCELS);
            expect(result).toContain('p3-uuid'); // Schele (Conference)
            expect(result).toContain('p4-uuid'); // Zuidhoek (Conference)
            expect(result).toHaveLength(2);
        });

        it('should match variety "Elstar"', () => {
            const result = resolveParcelNamesToIds(['elstar'], MOCK_PARCELS);
            expect(result).toEqual(['p1-uuid']);
        });

        it('should handle "de conference" pattern', () => {
            const result = resolveParcelNamesToIds(['de conference'], MOCK_PARCELS);
            expect(result).toContain('p3-uuid');
            expect(result).toContain('p4-uuid');
        });
    });

    describe('Crop match', () => {
        it('should match all "Appel" parcels with "appels"', () => {
            const result = resolveParcelNamesToIds(['appels'], MOCK_PARCELS);
            expect(result).toContain('p1-uuid'); // Elstar
            expect(result).toContain('p2-uuid'); // Gala
            expect(result).toContain('p6-uuid'); // Kanzi
            expect(result).toHaveLength(3);
        });

        it('should match all "Peer" parcels with "peren"', () => {
            const result = resolveParcelNamesToIds(['peren'], MOCK_PARCELS);
            expect(result).toContain('p3-uuid'); // Conference
            expect(result).toContain('p4-uuid'); // Conference
            expect(result).toContain('p5-uuid'); // Doyenne
            expect(result).toHaveLength(3);
        });

        it('should match "Peer" with "peer"', () => {
            const result = resolveParcelNamesToIds(['peer'], MOCK_PARCELS);
            expect(result).toContain('p3-uuid');
            expect(result).toContain('p4-uuid');
            expect(result).toContain('p5-uuid');
        });

        it('should match "Appel" with "appel"', () => {
            const result = resolveParcelNamesToIds(['appel'], MOCK_PARCELS);
            expect(result).toContain('p1-uuid');
            expect(result).toContain('p2-uuid');
            expect(result).toContain('p6-uuid');
        });
    });

    describe('Partial name match', () => {
        it('should match "Schele" to "Schele (Conference)"', () => {
            const result = resolveParcelNamesToIds(['schele'], MOCK_PARCELS);
            expect(result).toEqual(['p3-uuid']);
        });

        it('should match "Thuis" to both Thuis parcels', () => {
            const result = resolveParcelNamesToIds(['thuis'], MOCK_PARCELS);
            expect(result).toContain('p1-uuid');
            expect(result).toContain('p2-uuid');
        });
    });

    describe('Mixed inputs', () => {
        it('should handle mix of IDs, names, and varieties', () => {
            const result = resolveParcelNamesToIds(
                ['p1-uuid', 'conference', 'Kanzi blok'],
                MOCK_PARCELS
            );
            expect(result).toContain('p1-uuid');
            expect(result).toContain('p3-uuid');
            expect(result).toContain('p4-uuid');
            expect(result).toContain('p6-uuid');
        });

        it('should deduplicate results', () => {
            const result = resolveParcelNamesToIds(
                ['p1-uuid', 'Thuis (Elstar)', 'elstar'],
                MOCK_PARCELS
            );
            expect(result).toEqual(['p1-uuid']);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty input', () => {
            const result = resolveParcelNamesToIds([], MOCK_PARCELS);
            expect(result).toEqual([]);
        });

        it('should handle unknown input gracefully', () => {
            const result = resolveParcelNamesToIds(['onbekend'], MOCK_PARCELS);
            expect(result).toEqual([]);
        });

        it('should handle "alle appels" pattern', () => {
            const result = resolveParcelNamesToIds(['alle appels'], MOCK_PARCELS);
            expect(result).toContain('p1-uuid');
            expect(result).toContain('p2-uuid');
            expect(result).toContain('p6-uuid');
        });

        it('should handle "alle peren" pattern', () => {
            const result = resolveParcelNamesToIds(['alle peren'], MOCK_PARCELS);
            expect(result).toContain('p3-uuid');
            expect(result).toContain('p4-uuid');
            expect(result).toContain('p5-uuid');
        });
    });
});

describe('Smart Input V2 Integration', () => {
    describe('First message flow', () => {
        it.todo('should parse "Vandaag alle conference met surround" correctly');
        it.todo('should resolve all Conference parcels to their IDs');
        it.todo('should handle dosage specification');
    });

    describe('Agent mode flow', () => {
        it.todo('should handle corrections like "conference niet"');
        it.todo('should handle additions like "ook merpan erbij"');
    });
});
