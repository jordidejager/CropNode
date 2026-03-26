'use client';

import * as React from 'react';
import { useFertilizers } from '@/hooks/use-data';
import { FertilizersClientPage } from '../my-products/fertilizers-client-page';
import { ProductDatabaseSkeleton, ErrorState } from '@/components/ui/data-states';
import { CardTitle, CardDescription } from '@/components/ui/card';

export default function FertilizersDatabasePage() {
    const {
        data: fertilizers = [],
        isLoading: isLoadingFertilizers,
        isError: isErrorFertilizers,
        error: errorFertilizers,
        refetch: refetchFertilizers
    } = useFertilizers();

    if (isLoadingFertilizers) return <ProductDatabaseSkeleton />;
    if (isErrorFertilizers) return <ErrorState title="Fout" message={errorFertilizers.message} onRetry={refetchFertilizers} />;

    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Meststoffen Database</CardTitle>
                <CardDescription>Overzicht van bladbemesting en fertigatie producten.</CardDescription>
            </div>
            <FertilizersClientPage fertilizers={fertilizers} />
        </div>
    );
}
