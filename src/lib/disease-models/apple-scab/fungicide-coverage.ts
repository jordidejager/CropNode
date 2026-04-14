/**
 * Fungicide Coverage Model
 *
 * Calculates the residual coverage of a fungicide spray over time,
 * accounting for two degradation factors:
 *
 * 1. Leaf growth dilution — new leaf tissue is unprotected. Growth rate
 *    is temperature-dependent (base 4°C). Faster in spring (bloom period).
 *
 * 2. Rain wash-off — each rain event removes a fraction of remaining deposit.
 *    The fraction depends on the product: captan washes off easily (halflife 1mm),
 *    dithianon is very rain-fast (halflife 15mm).
 *
 * Also calculates curative windows for products that can stop infection
 * post-penetration, expressed in degree-hours (°C·h) after infection start.
 */

import type {
  FungicideProperties,
  HourlyWeatherInput,
  CoveragePoint,
  CoverageTimeline,
  SprayEvent,
  InfectionPeriod,
  InfectionCoverage,
  CoverageStatus,
  SeasonProgressEntry,
} from '../types';

// Leaf growth coefficients per phenological phase (degree-day ranges since biofix)
// These determine how fast new (unprotected) leaf area grows
const GROWTH_PHASES = [
  { maxDD: 200, coeff: 0.015 },   // Green tip → bloom: moderate growth
  { maxDD: 400, coeff: 0.025 },   // Bloom → petal fall: fastest growth (critical period)
  { maxDD: 600, coeff: 0.010 },   // After petal fall: slowing
  { maxDD: Infinity, coeff: 0.005 }, // After June drop: minimal
];

const LEAF_GROWTH_BASE_TEMP = 4; // °C — below this, no growth

/**
 * Get the leaf growth coefficient based on cumulative degree-days.
 */
function getGrowthCoeff(cumulativeDD: number): number {
  for (const phase of GROWTH_PHASES) {
    if (cumulativeDD <= phase.maxDD) return phase.coeff;
  }
  return 0.005;
}

/**
 * Calculate the coverage timeline for a single spray application.
 *
 * @param sprayDate - When the spray was applied
 * @param product - Product name (for labeling)
 * @param props - Fungicide wash-off/growth properties
 * @param hourlyWeather - Hourly weather data after the spray
 * @param seasonProgress - Daily DD/PAM data (for growth phase)
 * @param nextSprayDate - When the next spray occurs (stops this coverage calculation)
 * @returns Coverage timeline with hourly points
 */
export function calculateCoverageTimeline(
  sprayDate: Date,
  product: string,
  props: FungicideProperties,
  hourlyWeather: HourlyWeatherInput[],
  seasonProgress: SeasonProgressEntry[],
  nextSprayDate: Date | null
): CoverageTimeline {
  const points: CoveragePoint[] = [];
  let coverage = 100;

  // Find weather data starting from spray date
  const sprayTime = sprayDate.getTime();
  const endTime = nextSprayDate?.getTime() ?? Infinity;
  const relevantHours = hourlyWeather.filter(
    (h) => h.timestamp.getTime() >= sprayTime && h.timestamp.getTime() < endTime
  );

  // Check for rain during drying period (penalty for wet application)
  const dryingEndTime = sprayTime + props.min_drying_hours * 3600000;
  const rainDuringDrying = relevantHours
    .filter((h) => h.timestamp.getTime() < dryingEndTime)
    .some((h) => h.precipitationMm !== null && h.precipitationMm > 0.5);

  if (rainDuringDrying) {
    coverage *= 0.7; // 30% penalty for wet application
  }

  // Get current DD for growth phase
  const sprayDateStr = formatDate(sprayDate);
  const currentDD = getDDAtDate(seasonProgress, sprayDateStr);

  // Initial point
  points.push({ timestamp: sprayDate, coveragePct: Math.round(coverage * 10) / 10, product });

  const minCoverage = props.min_residual_fraction * 100;

  for (const hour of relevantHours) {
    if (hour.timestamp.getTime() <= sprayTime) continue;

    const temp = hour.temperatureC ?? 0;
    const precip = hour.precipitationMm ?? 0;

    // 1. Leaf growth dilution (hourly portion of daily growth)
    const ddAtHour = getDDAtDate(seasonProgress, formatDate(hour.timestamp));
    const growthCoeff = getGrowthCoeff(ddAtHour > 0 ? ddAtHour : currentDD);
    const hourlyGrowth = Math.max(0, (temp - LEAF_GROWTH_BASE_TEMP)) * growthCoeff / 24;
    coverage *= (1 - hourlyGrowth);

    // 2. Rain wash-off
    if (precip > 0) {
      const availableForWashoff = coverage - minCoverage;
      if (availableForWashoff > 0) {
        const washFraction = 1 - Math.exp(-precip / props.rain_washoff_halflife_mm);
        coverage -= availableForWashoff * washFraction;
      }
    }

    // Floor at minimum residual
    coverage = Math.max(coverage, minCoverage);

    // Stop if coverage is negligible
    if (coverage < 1) {
      points.push({ timestamp: hour.timestamp, coveragePct: 0, product });
      break;
    }

    // Record every 3 hours to keep data manageable
    const hoursSinceSpray = (hour.timestamp.getTime() - sprayTime) / 3600000;
    if (hoursSinceSpray % 3 < 1) {
      points.push({
        timestamp: hour.timestamp,
        coveragePct: Math.round(coverage * 10) / 10,
        product,
      });
    }
  }

  return { sprayId: '', sprayDate, product, points };
}

/**
 * Get the coverage percentage at a specific moment in time.
 * Interpolates between coverage timeline points.
 */
export function getCoverageAtTime(
  timelines: CoverageTimeline[],
  targetTime: Date
): { coveragePct: number; product: string } | null {
  const t = targetTime.getTime();

  // Find the most recent spray timeline that covers this time
  let best: { coveragePct: number; product: string } | null = null;

  for (const timeline of timelines) {
    if (timeline.sprayDate.getTime() > t) continue;
    if (timeline.points.length === 0) continue;

    // Find the two surrounding points
    let before: CoveragePoint | null = null;
    let after: CoveragePoint | null = null;

    for (const point of timeline.points) {
      if (point.timestamp.getTime() <= t) {
        before = point;
      } else if (!after) {
        after = point;
      }
    }

    if (!before) continue;

    // Use the before point (or interpolate if we have after)
    let coverage = before.coveragePct;
    if (after) {
      const span = after.timestamp.getTime() - before.timestamp.getTime();
      const elapsed = t - before.timestamp.getTime();
      if (span > 0) {
        const ratio = elapsed / span;
        coverage = before.coveragePct + ratio * (after.coveragePct - before.coveragePct);
      }
    }

    // Keep the highest coverage (best-protecting spray wins)
    if (!best || coverage > best.coveragePct) {
      best = { coveragePct: Math.round(coverage * 10) / 10, product: timeline.product };
    }
  }

  return best;
}

/**
 * Determine coverage status from percentage.
 */
export function coverageToStatus(pct: number): CoverageStatus {
  if (pct >= 50) return 'good';
  if (pct >= 30) return 'moderate';
  if (pct >= 10) return 'low';
  return 'none';
}

/**
 * Calculate curative remaining degree-hours for an infection event.
 *
 * @param infectionStart - When the infection started
 * @param hourlyWeather - Hourly weather data after infection
 * @param maxDegreeHours - Product's curative window limit
 * @returns Remaining degree-hours, or null if window has closed
 */
export function calculateCurativeWindow(
  infectionStart: Date,
  hourlyWeather: HourlyWeatherInput[],
  maxDegreeHours: number,
  now: Date = new Date()
): { open: boolean; remainingDH: number } {
  const startTime = infectionStart.getTime();
  const nowTime = now.getTime();

  let accumulatedDH = 0;

  for (const hour of hourlyWeather) {
    const t = hour.timestamp.getTime();
    if (t < startTime) continue;
    if (t > nowTime) break;

    const temp = hour.temperatureC ?? 0;
    accumulatedDH += Math.max(0, temp);
  }

  const remaining = maxDegreeHours - accumulatedDH;
  return {
    open: remaining > 0,
    remainingDH: Math.max(0, Math.round(remaining)),
  };
}

/**
 * Evaluate coverage for each infection period.
 *
 * @param infectionPeriods - From the infection calculator
 * @param sprayEvents - Matched spray registrations with fungicide properties
 * @param hourlyWeather - Hourly weather data for the season
 * @param seasonProgress - Daily degree-day progression
 * @returns Map of infection start timestamp → coverage info
 */
export function evaluateCoverageForInfections(
  infectionPeriods: InfectionPeriod[],
  sprayEvents: SprayEvent[],
  hourlyWeather: HourlyWeatherInput[],
  seasonProgress: SeasonProgressEntry[]
): Map<string, InfectionCoverage> {
  const result = new Map<string, InfectionCoverage>();

  if (sprayEvents.length === 0) {
    // No sprays — all infections unprotected
    for (const ip of infectionPeriods) {
      result.set(ip.wetPeriodStart, {
        coverageAtInfection: 0,
        coverageStatus: 'none',
        lastSprayProduct: null,
        lastSprayDate: null,
        curativeWindowOpen: false,
        curativeRemainingDH: null,
      });
    }
    return result;
  }

  // Sort sprays chronologically
  const sortedSprays = [...sprayEvents].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Build coverage timelines for each spray
  const timelines: CoverageTimeline[] = [];

  for (let i = 0; i < sortedSprays.length; i++) {
    const spray = sortedSprays[i];
    const nextSpray = sortedSprays[i + 1] ?? null;

    // Use the best fungicide properties from the spray's products
    const bestProps = getBestFungicideProps(spray);
    if (!bestProps) continue;

    const productName = spray.products
      .map((p) => p.name)
      .join(' + ');

    const timeline = calculateCoverageTimeline(
      spray.date,
      productName,
      bestProps.props,
      hourlyWeather,
      seasonProgress,
      nextSpray?.date ?? null
    );
    timeline.sprayId = spray.id;
    timelines.push(timeline);
  }

  // Evaluate coverage at each infection event
  for (const ip of infectionPeriods) {
    const infectionTime = new Date(ip.wetPeriodStart);
    const coverageResult = getCoverageAtTime(timelines, infectionTime);

    // Find last spray before this infection
    const lastSpray = sortedSprays
      .filter((s) => s.date.getTime() < infectionTime.getTime())
      .pop();

    // Check curative window
    let curativeWindowOpen = false;
    let curativeRemainingDH: number | null = null;

    if (lastSpray) {
      const curativeProps = getCurativeProps(lastSpray);
      if (curativeProps) {
        const window = calculateCurativeWindow(
          infectionTime,
          hourlyWeather,
          curativeProps.curative_max_degree_hours!
        );
        curativeWindowOpen = window.open;
        curativeRemainingDH = window.remainingDH;
      }
    }

    const coveragePct = coverageResult?.coveragePct ?? 0;

    // Use consistent source: if coverage was found, show its product; otherwise use last spray
    const sprayProduct = lastSpray
      ? lastSpray.products.map((p) => p.name).join(' + ')
      : null;
    const sprayDate = lastSpray?.date.toISOString() ?? null;

    result.set(ip.wetPeriodStart, {
      coverageAtInfection: coveragePct,
      coverageStatus: coverageToStatus(coveragePct),
      lastSprayProduct: sprayProduct,
      lastSprayDate: sprayDate,
      curativeWindowOpen,
      curativeRemainingDH,
    });
  }

  return result;
}

/**
 * Build combined coverage timeline for charting.
 * Merges all spray timelines into one continuous series.
 */
export function buildCombinedCoverageTimeline(
  sprayEvents: SprayEvent[],
  hourlyWeather: HourlyWeatherInput[],
  seasonProgress: SeasonProgressEntry[]
): CoveragePoint[] {
  if (sprayEvents.length === 0) return [];

  const sortedSprays = [...sprayEvents].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const timelines: CoverageTimeline[] = [];

  for (let i = 0; i < sortedSprays.length; i++) {
    const spray = sortedSprays[i];
    const nextSpray = sortedSprays[i + 1] ?? null;
    const bestProps = getBestFungicideProps(spray);
    if (!bestProps) continue;

    const productName = spray.products.map((p) => p.name).join(' + ');
    timelines.push(
      calculateCoverageTimeline(
        spray.date,
        productName,
        bestProps.props,
        hourlyWeather,
        seasonProgress,
        nextSpray?.date ?? null
      )
    );
  }

  // Merge: at each timestamp, take the highest coverage
  const allPoints = new Map<number, CoveragePoint>();

  for (const tl of timelines) {
    for (const p of tl.points) {
      const key = p.timestamp.getTime();
      const existing = allPoints.get(key);
      if (!existing || p.coveragePct > existing.coveragePct) {
        allPoints.set(key, p);
      }
    }
  }

  return Array.from(allPoints.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
}

// === Helpers ===

function getBestFungicideProps(spray: SprayEvent): { props: FungicideProperties; name: string } | null {
  let best: { props: FungicideProperties; name: string } | null = null;

  for (const p of spray.products) {
    if (!p.fungicideProps) continue;
    if (
      !best ||
      p.fungicideProps.rain_washoff_halflife_mm > best.props.rain_washoff_halflife_mm
    ) {
      best = { props: p.fungicideProps, name: p.name };
    }
  }

  return best;
}

function getCurativeProps(spray: SprayEvent): FungicideProperties | null {
  for (const p of spray.products) {
    if (
      p.fungicideProps &&
      p.fungicideProps.curative_max_degree_hours &&
      (p.fungicideProps.mode_of_action === 'curatief' || p.fungicideProps.mode_of_action === 'beide')
    ) {
      return p.fungicideProps;
    }
  }
  return null;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDDAtDate(seasonProgress: SeasonProgressEntry[], dateStr: string): number {
  let best: SeasonProgressEntry | null = null;
  for (const entry of seasonProgress) {
    if (entry.date <= dateStr) {
      if (!best || entry.date > best.date) best = entry;
    }
  }
  return best?.cumulativeDD ?? 0;
}
