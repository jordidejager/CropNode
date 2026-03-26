'use client';

import * as React from 'react';
import { useCtgbProducts, useParcelHistory } from '@/hooks/use-data';
import { MiddelenOverzichtClientPage } from '@/app/(app)/crop-care/my-products/client-page';
import { ProductDatabaseSkeleton, ErrorState } from '@/components/ui/data-states';
import { CardTitle, CardDescription } from '@/components/ui/card';

// Extended list of crop terms used by CTGB for hard fruit
// Includes variations, plurals, and related terms
const HARD_FRUIT_CROPS = [
    'appel', 'appels', 'appelboom', 'appelbomen',
    'peer', 'peren', 'perenboom', 'perenbomen',
    'pitvruchten', 'pitfruit', 'pitvrucht',
    'vruchtbomen', 'vruchtboom',
    'fruitgewassen', 'fruitteelt', 'fruit',
    'hardfruit', 'hard fruit',
    'malus',  // Latin for apple
    'pyrus',  // Latin for pear
];

export default function CtgbDatabasePage() {
    const {
        data: ctgbProducts = [],
        isLoading: isLoadingProducts,
        isError: isErrorProducts,
        error: errorProducts,
        refetch: refetchProducts
    } = useCtgbProducts();

    const {
        data: history = [],
        isLoading: isLoadingHistory
    } = useParcelHistory();

    const filteredCtgbProducts = React.useMemo(() => {
        if (!ctgbProducts.length) return [];
        const popularity: Record<string, number> = {};
        for (const entry of history) {
            popularity[entry.product] = (popularity[entry.product] || 0) + 1;
        }

        return ctgbProducts
            .filter(product =>
                product.gebruiksvoorschriften?.some(gebruik =>
                    HARD_FRUIT_CROPS.some(crop =>
                        gebruik.gewas?.toLowerCase().includes(crop)
                    )
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
                gebruiksvoorschriften: product.gebruiksvoorschriften
            }))
            .sort((a, b) => {
                if (a.popularity !== b.popularity) {
                    return b.popularity - a.popularity;
                }
                return a.naam.localeCompare(b.naam);
            });
    }, [ctgbProducts, history]);

    if (isLoadingProducts || isLoadingHistory) return <ProductDatabaseSkeleton />;
    if (isErrorProducts) return <ErrorState title="Fout" message={errorProducts.message} onRetry={refetchProducts} />;

    return (
        <div className="space-y-6">
            <div>
                <CardTitle>CTGB Database</CardTitle>
                <CardDescription>Gevalideerde gewasbeschermingsmiddelen voor hardfruit.</CardDescription>
            </div>
            <MiddelenOverzichtClientPage products={filteredCtgbProducts} />
        </div>
    );
}
