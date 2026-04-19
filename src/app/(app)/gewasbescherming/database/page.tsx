'use client';

import * as React from 'react';
import { useCtgbProducts, useParcelHistory, useFertilizers } from '@/hooks/use-data';
import { UnifiedDatabaseClient } from './unified-database-client';
import { ProductDatabaseSkeleton, ErrorState } from '@/components/ui/data-states';
import { SectionHeader, GlowOrb } from '@/components/ui/premium';

// Specific crop terms for hard fruit (appel & peer) — strict matching
const HARD_FRUIT_CROPS = [
    'appel', 'appels', 'appelboom', 'appelbomen',
    'peer', 'peren', 'perenboom', 'perenbomen',
    'pitvruchten', 'pitfruit', 'pitvrucht',
    'vruchtbomen', 'vruchtboom',
    'malus', 'pyrus',
];

export default function UnifiedDatabasePage() {
    const {
        data: ctgbProducts = [],
        isLoading: isLoadingProducts,
        isError: isErrorProducts,
        error: errorProducts,
        refetch: refetchProducts,
    } = useCtgbProducts();

    const { data: history = [], isLoading: isLoadingHistory } = useParcelHistory();
    const { data: fertilizers = [], isLoading: isLoadingFertilizers } = useFertilizers();

    // Filter CTGB to hardfruit + sort by popularity
    const filteredCtgbProducts = React.useMemo(() => {
        if (!ctgbProducts.length) return [];

        const popularity: Record<string, number> = {};
        for (const entry of history) {
            popularity[entry.product] = (popularity[entry.product] || 0) + 1;
        }

        // Word-boundary matching to avoid "aardappel" matching "appel"
        const matchesCrop = (gewas: string, crop: string) => {
            const regex = new RegExp(`(^|[\\s,;/()]+)${crop}([\\s,;/()]+|$)`, 'i');
            return regex.test(gewas);
        };

        // Skip overly broad GV entries
        const isSpecificHardfruitGV = (gewas: string) => {
            const cropCount = gewas.split(',').length;
            if (cropCount > 8) {
                const lower = gewas.toLowerCase();
                const startsWithHardfruit = /^\s*(appel|peer|pitvruchten|pitvrucht|vruchtbomen)\b/i.test(gewas);
                const isPitvruchten = lower.startsWith('pitvruchten') || lower.startsWith('pitvrucht');
                return startsWithHardfruit || isPitvruchten;
            }
            return true;
        };

        return ctgbProducts
            .filter(product =>
                product.gebruiksvoorschriften?.some(gebruik =>
                    gebruik.gewas &&
                    isSpecificHardfruitGV(gebruik.gewas) &&
                    HARD_FRUIT_CROPS.some(crop => matchesCrop(gebruik.gewas, crop))
                )
            )
            .map(product => ({
                id: product.id,
                toelatingsnummer: product.toelatingsnummer,
                naam: product.naam,
                werkzameStoffen: product.werkzameStoffen,
                status: product.status,
                categorie: product.categorie,
                toelatingshouder: product.toelatingshouder,
                productTypes: product.productTypes,
                popularity: popularity[product.naam] || 0,
                gebruiksvoorschriften: product.gebruiksvoorschriften,
            }))
            .sort((a, b) => {
                if (a.popularity !== b.popularity) return b.popularity - a.popularity;
                return a.naam.localeCompare(b.naam);
            });
    }, [ctgbProducts, history]);

    const isLoading = isLoadingProducts || isLoadingHistory || isLoadingFertilizers;

    const header = (
        <SectionHeader
            eyebrow="Naslagwerk"
            title="Productdatabase"
            titleGradient={!isLoading ? `${ctgbProducts.length + fertilizers.length} producten` : undefined}
            description="Alle gewasbeschermingsmiddelen en meststoffen voor fruitteelt — met officiële CTGB-doseringen."
            color="sky"
        />
    );

    if (isLoading) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="sky" position="top-left" size="w-[450px] h-[300px]" blur="blur-[140px]" opacity={0.07} />
                {header}
                <ProductDatabaseSkeleton />
            </div>
        );
    }

    if (isErrorProducts) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="sky" position="top-left" size="w-[450px] h-[300px]" blur="blur-[140px]" opacity={0.07} />
                {header}
                <ErrorState title="Fout" message={errorProducts.message} onRetry={refetchProducts} />
            </div>
        );
    }

    return (
        <div className="relative space-y-8">
            <GlowOrb color="sky" position="top-left" size="w-[500px] h-[320px]" blur="blur-[140px]" opacity={0.07} />
            <GlowOrb color="indigo" position="top-right" size="w-[360px] h-[260px]" blur="blur-[140px]" opacity={0.04} />

            {header}

            <UnifiedDatabaseClient
                ctgbProducts={ctgbProducts.map(p => ({
                    id: p.id,
                    toelatingsnummer: p.toelatingsnummer,
                    naam: p.naam,
                    werkzameStoffen: p.werkzameStoffen,
                    status: p.status,
                    categorie: p.categorie,
                    toelatingshouder: p.toelatingshouder,
                    productTypes: p.productTypes,
                    gebruiksvoorschriften: p.gebruiksvoorschriften,
                }))}
                ctgbHardfruit={filteredCtgbProducts}
                fertilizers={fertilizers}
            />
        </div>
    );
}
