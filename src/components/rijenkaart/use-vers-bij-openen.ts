'use client';

/**
 * Rijenkaart (beta) — één keer verversen bij het openen van een pagina als de gecachte data
 * verouderd is.
 *
 * De app draait met `refetchOnMount: false` (src/lib/query-provider.tsx). Een rijen-query die
 * intussen ongeldig is gemaakt terwijl de pagina niet open stond (bv. het overzicht na rijen
 * genereren op de detailpagina, of de kaart na een bespuiting op rijen vanuit het spuitschrift)
 * zou anders oude data blijven tonen tot de gebruiker herlaadt.
 */

import { useEffect, useRef } from 'react';

export function useVersBijOpenen(query: {
  data: unknown;
  isStale: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}): void {
  const gedaan = useRef(false);
  const { data, isStale, isFetching, refetch } = query;
  useEffect(() => {
    // Zonder cache haalt de query zelf al op; alleen bestaande (verouderde) data verversen
    if (gedaan.current || data === undefined) return;
    gedaan.current = true;
    if (isStale && !isFetching) void refetch();
  }, [data, isStale, isFetching, refetch]);
}
