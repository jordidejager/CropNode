/**
 * Adapter — convert v2 SimulationResult to the legacy ZiektedrukResult shape
 * so existing UI components work without changes.
 *
 * The v2 simulation produces richer data (30-min state snapshots with spore
 * pool evolution), but we collapse it to daily SeasonProgress + per-event
 * InfectionPeriod to stay compatible.
 */

import type {
  SeasonProgressEntry,
  InfectionPeriod,
  ZiektedrukKPIs,
  MillsSeverity,
} from '../types';
import type { SimulationResult, InfectionEvent } from './types';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Convert v2 simulation states → daily SeasonProgress entries.
 * Takes one snapshot per day (end-of-day state).
 */
export function toSeasonProgress(
  result: SimulationResult
): SeasonProgressEntry[] {
  if (result.states.length === 0) return [];

  const INITIAL_INOCULUM = 10_000;
  const dailyMap = new Map<string, SeasonProgressEntry>();

  for (const state of result.states) {
    const dateKey = toDateStr(state.timestamp);
    // PAM = fraction of initial inoculum that has matured (discharged + still in pool)
    const matureAndDischarged =
      INITIAL_INOCULUM - (state.immature / (1 - 0)); // immature is absolute count
    const pam = Math.max(
      0,
      Math.min(1, (INITIAL_INOCULUM - state.immature) / INITIAL_INOCULUM)
    );

    dailyMap.set(dateKey, {
      date: dateKey,
      dailyDD: 0, // filled after
      cumulativeDD: state.cumulativeDD,
      pam,
      isForecast: state.isForecast,
    });
  }

  // Compute dailyDD from differences
  const sorted = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  for (let i = 0; i < sorted.length; i++) {
    const prev = i > 0 ? sorted[i - 1].cumulativeDD : 0;
    sorted[i].dailyDD = Math.max(0, sorted[i].cumulativeDD - prev);
  }

  return sorted;
}

/**
 * Convert v2 infection events → legacy InfectionPeriod entries.
 */
export function toInfectionPeriods(
  result: SimulationResult
): InfectionPeriod[] {
  return result.infections.map((ev) => ({
    wetPeriodStart: ev.wetPeriodStart.toISOString(),
    wetPeriodEnd: ev.infectionCompleted.toISOString(),
    durationHours: Math.round(ev.wetDurationHours * 10) / 10,
    avgTemperature: Math.round(ev.avgTemperature * 10) / 10,
    severity: ev.severity as MillsSeverity,
    rimValue: ev.rimValue,
    pamAtEvent: Math.round(ev.pamAtStart * 1000) / 1000,
    degreeDaysCumulative: 0, // filled from progress if needed
    expectedSymptomDate: ev.expectedSymptomDate
      ? toDateStr(ev.expectedSymptomDate)
      : null,
    isForecast: ev.isForecast,
  }));
}

/**
 * Compute KPIs from v2 simulation result.
 */
export function toKPIs(
  result: SimulationResult,
  infectionPeriods: InfectionPeriod[]
): ZiektedrukKPIs {
  const observedInfections = infectionPeriods.filter((ip) => !ip.isForecast);
  const forecastInfections = infectionPeriods.filter((ip) => ip.isForecast);

  const light = observedInfections.filter((ip) => ip.severity === 'light').length;
  const moderate = observedInfections.filter((ip) => ip.severity === 'moderate').length;
  const severe = observedInfections.filter((ip) => ip.severity === 'severe').length;

  // Current PAM = final PAM from simulation
  const currentPAM = result.finalPAM;
  const currentDD = result.states.length > 0
    ? result.states[result.states.length - 1].cumulativeDD
    : 0;

  // Season phase
  let seasonPhase: ZiektedrukKPIs['seasonPhase'];
  if (currentPAM < 0.05) seasonPhase = 'dormant';
  else if (currentPAM < 0.5) seasonPhase = 'building';
  else if (currentPAM < 0.9) seasonPhase = 'peak';
  else if (currentPAM < 0.98) seasonPhase = 'declining';
  else seasonPhase = 'ended';

  // Estimated season end: find first forecast state with PAM > 0.95
  let estimatedSeasonEnd: string | null = null;
  for (const state of result.states) {
    const pam = (10_000 - state.immature) / 10_000;
    if (pam > 0.95) {
      estimatedSeasonEnd = toDateStr(state.timestamp);
      break;
    }
  }

  // Next forecast risk
  const nextForecast = forecastInfections
    .filter((ip) => ip.severity !== 'none')
    .sort((a, b) => a.wetPeriodStart.localeCompare(b.wetPeriodStart))[0];

  return {
    totalInfections: observedInfections.length,
    lightInfections: light,
    moderateInfections: moderate,
    severeInfections: severe,
    currentPAM,
    currentDegreeDays: Math.round(currentDD * 10) / 10,
    seasonPhase,
    estimatedSeasonEnd,
    nextForecastRisk: nextForecast
      ? {
          date: nextForecast.wetPeriodStart.slice(0, 10),
          severity: nextForecast.severity,
        }
      : null,
  };
}
