/**
 * Shared parcel-group options hook.
 *
 * Single source-of-truth voor de hiërarchische perceelweergave die overal in
 * CropNode wordt gebruikt (spuitschrift, urenregistratie, veldnotities, oogst,
 * ziektedruk).
 *
 * Pure helper `groupSprayableParcels` zit in `@/lib/parcel-grouping` zodat hij
 * stand-alone unit-testbaar blijft. Deze hook combineert hem met `useParcels`.
 */
import * as React from 'react';
import { useParcels } from './use-data';
import { groupSprayableParcels } from '@/lib/parcel-grouping';
import type { ParcelGroupOption } from '@/lib/types';

/** Re-export voor consumers die de raw helper willen. */
export { groupSprayableParcels };

/**
 * React hook: ontvang sprayable parcels via existing `useParcels()`, return
 * gegroepeerde versie + raw parcels lijst (voor lookups).
 *
 * Type-cast naar `ParcelGroupOption[]` is veilig: de helper produceert exact
 * dezelfde shape (de helper gebruikt een lokale type alias om circulaire
 * imports te vermijden).
 */
export function useParcelGroupOptions() {
  const query = useParcels();
  const groups = React.useMemo<ParcelGroupOption[]>(
    () => groupSprayableParcels(query.data ?? []) as ParcelGroupOption[],
    [query.data],
  );
  return {
    ...query,
    data: groups,
    parcels: query.data ?? [],
  };
}
