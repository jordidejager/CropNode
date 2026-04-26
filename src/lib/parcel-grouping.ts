/**
 * Pure helper voor parcel-groepering. Geen React, geen Supabase imports —
 * stand-alone testbaar en server-side bruikbaar.
 *
 * **Groepering: op `parcelName` (lowercased), NIET op `parcelId`.**
 *
 * Reden: in de DB kunnen meerdere `parcels`-records bestaan met dezelfde naam
 * (legacy "Jan van W ×3"). Op `/percelen` werden die altijd als één
 * hoofdperceel getoond door op naam te groeperen. Door overal op naam te
 * groeperen is de hiërarchie direct consistent.
 */

// Lokaal gedefinieerde input shape om circulaire imports met supabase-store te
// vermijden. Compatibel met `SprayableParcel` (alle velden ervan).
export type GroupableParcel = {
  id: string;
  name: string;
  area: number | null;
  crop: string;
  variety: string | null;
  parcelId: string;
  parcelName: string;
  synonyms?: string[];
};

export type ParcelGroupingOption = {
  parcelId: string;
  parcelName: string;
  subParcels: Array<{
    id: string;
    name: string;
    shortLabel: string;
    variety: string | null;
    crop: string;
    area: number | null;
  }>;
};

/**
 * Groepeert SprayableParcels op lowercased `parcelName`. Subs binnen een groep
 * worden alfabetisch op `shortLabel` gesorteerd (NL-locale). Groepen idem.
 *
 * `shortLabel` derivatie:
 *   1. Strip parent-naam prefix (case-insensitive)
 *   2. Strip trailing `(variety)` suffix
 *   3. Fallback: variety, dan volledige `name`
 */
export function groupSprayableParcels<T extends GroupableParcel>(
  parcels: T[],
): ParcelGroupingOption[] {
  const byKey = new Map<string, ParcelGroupingOption>();

  for (const sp of parcels) {
    const parentName = (sp.parcelName || sp.name).trim();
    const key = parentName.toLowerCase();

    let group = byKey.get(key);
    if (!group) {
      group = {
        parcelId: sp.parcelId || sp.id,
        parcelName: parentName,
        subParcels: [],
      };
      byKey.set(key, group);
    }

    let shortLabel = sp.name;
    if (parentName && shortLabel.toLowerCase().startsWith(parentName.toLowerCase())) {
      shortLabel = shortLabel.slice(parentName.length).trim();
    }
    shortLabel = shortLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!shortLabel) shortLabel = sp.variety || sp.name;

    group.subParcels.push({
      id: sp.id,
      name: sp.name,
      shortLabel,
      variety: sp.variety || null,
      crop: sp.crop,
      area: sp.area ?? null,
    });
  }

  for (const g of byKey.values()) {
    g.subParcels.sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, 'nl'));
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.parcelName.localeCompare(b.parcelName, 'nl'),
  );
}
