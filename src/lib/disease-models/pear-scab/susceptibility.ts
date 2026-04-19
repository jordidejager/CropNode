/**
 * Fruit susceptibility curve for pear scab.
 *
 * Based on RIMpro V. pirina model observations for Conference:
 * - Young leaves + flowers: 100% susceptible
 * - Up to full bloom: still 100%
 * - After petal fall: gradual decline
 * - Mid-June: ~20% susceptibility
 * - Late June: ~10%
 * - July onwards: ~5% (nearly resistant)
 *
 * This matches the RIMpro "Vatbaarheid van de vruchten" pink area on
 * pear scab Conidiën BASIS graph. Without this weighting, we count
 * infections that can no longer cause economic damage.
 */

/**
 * Compute fruit susceptibility (0-1) at a given date.
 *
 * @param eventDate - Date of the infection event
 * @param bloomDate - Full bloom date (from phenology_reference)
 */
export function fruitSusceptibility(
  eventDate: Date,
  bloomDate: Date
): number {
  const daysFromBloom =
    (eventDate.getTime() - bloomDate.getTime()) / (24 * 3600 * 1000);

  // Before bloom (biofix to bloom): 100% susceptible (young leaves take up
  // infections just as readily as fruit will shortly)
  if (daysFromBloom < 0) return 1.0;

  // Full bloom + 14 days: still 100%
  if (daysFromBloom < 14) return 1.0;

  // Days 14-45 (petal fall → end of June): linear decline to 20%
  if (daysFromBloom < 45) {
    const t = (daysFromBloom - 14) / 31; // 0 at day 14, 1 at day 45
    return 1.0 - 0.8 * t;
  }

  // Days 45-75: decline from 20% to 5%
  if (daysFromBloom < 75) {
    const t = (daysFromBloom - 45) / 30;
    return 0.2 - 0.15 * t;
  }

  // > 75 days: fruits nearly resistant
  return 0.05;
}
