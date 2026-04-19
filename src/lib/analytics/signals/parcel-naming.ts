/**
 * Helper voor duidelijke perceelnamen in signalen.
 *
 * Fruittelers hebben vaak subpercelen met korte namen ("4Rijen", "3Rijen")
 * die pas betekenis krijgen met de hoofdperceelnaam erbij ("Jachthoek — 4Rijen").
 */

interface SubParcel {
  id: string;
  parcel_id: string;
  name: string;
}

interface Parcel {
  id: string;
  name: string;
}

/**
 * Formatteer een volledige perceelnaam als "Hoofdperceel — Subperceel".
 * Als de subperceel-naam hetzelfde is als hoofdperceel, of als er geen
 * hoofdperceel gevonden wordt, valt hij terug op enkel de subperceel-naam.
 */
export function formatSubParcelName(
  subParcel: SubParcel | undefined | null,
  parcels: Parcel[]
): string {
  if (!subParcel) return 'Onbekend';
  const hoofd = parcels.find((p) => p.id === subParcel.parcel_id);
  const hoofdName = hoofd?.name?.trim();
  const subName = subParcel.name?.trim() || 'onbekend';

  if (!hoofdName) return subName;
  if (hoofdName.toLowerCase() === subName.toLowerCase()) return hoofdName;
  return `${hoofdName} — ${subName}`;
}

/**
 * Zoek een subperceel op id en formatteer de volledige naam.
 */
export function resolveSubParcelName(
  subParcelId: string | null | undefined,
  subParcels: SubParcel[],
  parcels: Parcel[]
): string {
  if (!subParcelId) return 'Onbekend';
  const sp = subParcels.find((s) => s.id === subParcelId);
  return formatSubParcelName(sp, parcels);
}
