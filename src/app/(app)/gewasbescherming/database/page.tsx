'use client';

import * as React from 'react';
import { useCtgbProducts, useParcelHistory, useFertilizers } from '@/hooks/use-data';
import { UnifiedDatabaseClient } from './unified-database-client';
import { ProductDatabaseSkeleton, ErrorState } from '@/components/ui/data-states';
import { CardTitle, CardDescription } from '@/components/ui/card';

// Specific crop terms for hard fruit (appel & peer) — strict matching
// Avoids broad terms like 'fruit' which match too many non-hardfruit products
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

    // Skip overly broad GV entries (e.g. boomkwekerij listings with 10+ crops)
    // These list Appel/Peer among dozens of other species — not a real fruitteelt toelating
    const isSpecificHardfruitGV = (gewas: string) => {
      const cropCount = gewas.split(',').length;
      // If the GV lists more than 8 different crops, only accept if it's clearly
      // a pitvruchten/vruchtbomen-ONLY entry (not mixed with laanbomen, siergewassen etc.)
      if (cropCount > 8) {
        const lower = gewas.toLowerCase();
        // Must START with a hardfruit term — not just contain it buried in a long list
        const startsWithHardfruit = /^\s*(appel|peer|pitvruchten|pitvrucht|vruchtbomen)\b/i.test(gewas);
        // Or be specifically about pitvruchten
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

  if (isLoading) return <ProductDatabaseSkeleton />;
  if (isErrorProducts) return <ErrorState title="Fout" message={errorProducts.message} onRetry={refetchProducts} />;

  return (
    <div className="space-y-6">
      <div>
        <CardTitle>Productdatabase</CardTitle>
        <CardDescription>Alle gewasbeschermingsmiddelen en meststoffen voor fruitteelt.</CardDescription>
      </div>
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
