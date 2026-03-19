import type { SpuitschriftEntry, ProductEntry } from '@/lib/types';

/**
 * Checks if a product is a fertilizer (meststof).
 * Products without a source are assumed to be crop protection (ctgb) for backward compatibility.
 */
export function isFertilizerProduct(product: ProductEntry): boolean {
  return product.source === 'fertilizer';
}

/**
 * Checks if a product is a crop protection product (gewasbeschermingsmiddel).
 */
export function isCropProtectionProduct(product: ProductEntry): boolean {
  return !product.source || product.source === 'ctgb';
}

/**
 * Checks if an entry has ANY fertilizer products.
 */
export function hasFertilizerProducts(entry: SpuitschriftEntry): boolean {
  return entry.products.some(isFertilizerProduct);
}

/**
 * Checks if an entry has ANY crop protection products.
 */
export function hasCropProtectionProducts(entry: SpuitschriftEntry): boolean {
  return entry.products.some(isCropProtectionProduct);
}

/**
 * Checks if an entry is a pure fertilizer entry (ALL products are fertilizer).
 */
export function isPureFertilizerEntry(entry: SpuitschriftEntry): boolean {
  return entry.products.length > 0 && entry.products.every(isFertilizerProduct);
}

/**
 * Checks if an entry is a pure crop protection entry (ALL products are crop protection).
 */
export function isPureCropProtectionEntry(entry: SpuitschriftEntry): boolean {
  return entry.products.length > 0 && entry.products.every(isCropProtectionProduct);
}

/**
 * Checks if an entry is a tankmix (has both fertilizer AND crop protection products).
 */
export function isTankmixEntry(entry: SpuitschriftEntry): boolean {
  return hasFertilizerProducts(entry) && hasCropProtectionProducts(entry);
}

/**
 * For the Bemestingsregister: returns entries that have fertilizer products.
 * Tankmix entries are included but with only the fertilizer products shown.
 */
export function filterFertilizationEntries(entries: SpuitschriftEntry[]): SpuitschriftEntry[] {
  return entries
    .filter(hasFertilizerProducts)
    .map(entry => {
      if (isTankmixEntry(entry)) {
        // Tankmix: only show fertilizer products
        return {
          ...entry,
          products: entry.products.filter(isFertilizerProduct),
        };
      }
      return entry;
    });
}

/**
 * For the Spuitschrift: returns entries that have crop protection products.
 * Tankmix entries are included but with only the crop protection products shown.
 */
export function filterCropProtectionEntries(entries: SpuitschriftEntry[]): SpuitschriftEntry[] {
  return entries
    .filter(hasCropProtectionProducts)
    .map(entry => {
      if (isTankmixEntry(entry)) {
        // Tankmix: only show crop protection products
        return {
          ...entry,
          products: entry.products.filter(isCropProtectionProduct),
        };
      }
      return entry;
    });
}
