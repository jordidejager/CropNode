/**
 * Seasonal inoculum modulator for black rot (Botryosphaeria obtusa).
 *
 * Based on spore-trap data (Mohankumar 2023, Pusey 1990 for peach, Cornell/NY
 * field observations for apple):
 * - Spring (Apr-May): building primary inoculum from pseudothecia (ascospores)
 * - Early summer (Jun-Jul): PEAK — conidia from pycnidia on cankers + mummies
 * - Late summer/autumn (Aug-Oct): declining inoculum, drier weather
 *
 * We modulate the RIM value by a seasonal factor that reflects actual
 * field-observed inoculum availability.
 */

/**
 * Seasonal inoculum availability multiplier (0-1.2).
 * 1.0 = baseline, > 1.0 = peak, < 1.0 = suppressed.
 *
 * Based on trap data: late spring/early summer is highest, late summer dips,
 * autumn has some resurgence but rarely causes damage since fruit is near harvest.
 */
export function seasonalInoculumFactor(date: Date): number {
  const month = date.getUTCMonth(); // 0-11
  const day = date.getUTCDate();

  // Rough month-based curve:
  // Mar: 0.3 (just starting)
  // Apr: 0.7 (primary ascospores ramping up)
  // May: 1.0 (peak spring)
  // Jun: 1.2 (peak — conidia from cankers fully active)
  // Jul: 1.1 (still high)
  // Aug: 0.8 (declining, often drier)
  // Sep: 0.6 (late season, but fruit vulnerable)
  // Oct: 0.4 (end of season)
  // Nov-Feb: 0.1 (dormant)
  const monthlyFactors: number[] = [
    0.1, // Jan
    0.1, // Feb
    0.3, // Mar
    0.7, // Apr
    1.0, // May
    1.2, // Jun
    1.1, // Jul
    0.8, // Aug
    0.6, // Sep
    0.4, // Oct
    0.2, // Nov
    0.1, // Dec
  ];

  const baseFactor = monthlyFactors[month];
  const nextMonthIdx = (month + 1) % 12;
  const nextFactor = monthlyFactors[nextMonthIdx];

  // Interpolate within month (day 1 = this month's value, day 31 = next month's)
  const dayFraction = day / 31;
  return baseFactor * (1 - dayFraction) + nextFactor * dayFraction;
}

/**
 * Classify inoculum phase — used for UI indicators.
 */
export function inoculumPhase(date: Date): {
  label: string;
  description: string;
} {
  const month = date.getUTCMonth();

  if (month < 2 || month > 10) {
    return {
      label: 'Rustfase',
      description: 'Pathogeen overwintert in cankers en mummies',
    };
  }
  if (month < 4) {
    return {
      label: 'Opstart',
      description: 'Eerste ascosporen vrijkomen uit pseudothecia',
    };
  }
  if (month < 7) {
    return {
      label: 'Piekperiode',
      description: 'Maximale conidia-productie uit cankers en mummies',
    };
  }
  if (month < 9) {
    return {
      label: 'Afnemend',
      description: 'Inoculum loopt terug, vrucht nog kwetsbaar',
    };
  }
  return {
    label: 'Laat seizoen',
    description: 'Laatste infecties voor oogst — vrucht bijna rijp',
  };
}
