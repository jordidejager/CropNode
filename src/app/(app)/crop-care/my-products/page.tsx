'use client';

import * as React from 'react';
import { useCtgbProducts, useParcelHistory } from '@/hooks/use-data';
import { MiddelenOverzichtClientPage } from "./client-page";
import { ProductDatabaseSkeleton, ErrorState } from '@/components/ui/data-states';
import { CardDescription, CardTitle } from '@/components/ui/card';

const HARD_FRUIT_CROPS = ['appel', 'peer', 'pitvruchten', 'vruchtbomen'];

export default function MyProductsPage() {
    // Use React Query for data fetching
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

    const isLoading = isLoadingProducts || isLoadingHistory;

    // Process CTGB products with popularity
    const filteredCtgbProducts = React.useMemo(() => {
        if (!ctgbProducts.length) return [];

        // Calculate popularity
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

    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <div className="mb-4">
                    <CardTitle>Product Matrix</CardTitle>
                    <CardDescription>Jouw meest gebruikte en relevante middelen.</CardDescription>
                </div>
                <ProductDatabaseSkeleton />
            </div>
        );
    }

    if (isErrorProducts) {
        return (
            <div className="h-full flex flex-col">
                <div className="mb-4">
                    <CardTitle>Product Matrix</CardTitle>
                    <CardDescription>Jouw meest gebruikte en relevante middelen.</CardDescription>
                </div>
                <ErrorState
                    title="Kon producten niet laden"
                    message={errorProducts?.message || 'Er is een fout opgetreden.'}
                    onRetry={() => refetchProducts()}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4">
                <CardTitle>Product Matrix</CardTitle>
                <CardDescription>Jouw meest gebruikte en relevante middelen voor hardfruit, gesorteerd op prioriteit.</CardDescription>
            </div>
            <MiddelenOverzichtClientPage products={filteredCtgbProducts} />
        </div>
    );
}
