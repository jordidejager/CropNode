/**
 * Adapter — convert BlackRotResult to legacy ZiektedrukResult shape
 * so the existing UI components work without changes.
 */

import type {
  SeasonProgressEntry,
  InfectionPeriod,
  ZiektedrukKPIs,
  MillsSeverity,
} from '../types';
import type { BlackRotResult, BlackRotInfectionEvent } from './simulation';
import type { BlackRotSeverity } from './arauz-sutton-table';

function severityMap(s: BlackRotSeverity): MillsSeverity {
  // BlackRotSeverity and MillsSeverity share the same string values
  return s as MillsSeverity;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Convert BlackRotResult daily progress → SeasonProgressEntry[].
 * Uses cumulative RIM as a proxy for season progression (no PAM concept).
 */
export function blackRotToSeasonProgress(
  result: BlackRotResult
): SeasonProgressEntry[] {
  if (result.dailyProgress.length === 0) return [];

  // Normalize cumulative RIM to 0-1 range for PAM proxy
  const maxRIM = Math.max(
    1,
    ...result.dailyProgress.map((d) => d.cumulativeRIM)
  );

  return result.dailyProgress.map((d) => ({
    date: d.date,
    dailyDD: d.dailyRIM, // reuse dailyDD field for daily RIM
    cumulativeDD: d.cumulativeRIM,
    pam: d.cumulativeRIM / maxRIM, // proxy
    isForecast: d.isForecast,
  }));
}

export function blackRotToInfectionPeriods(
  result: BlackRotResult
): InfectionPeriod[] {
  return result.infections.map((ev) => ({
    wetPeriodStart: ev.wetPeriodStart.toISOString(),
    wetPeriodEnd: ev.wetPeriodEnd.toISOString(),
    durationHours: Math.round(ev.wetDurationHours * 10) / 10,
    avgTemperature: ev.avgTemperature,
    severity: severityMap(ev.severity),
    rimValue: ev.rimValue,
    pamAtEvent: 0, // not applicable for black rot
    degreeDaysCumulative: 0,
    expectedSymptomDate: ev.expectedSymptomDate
      ? toDateStr(ev.expectedSymptomDate)
      : null,
    isForecast: ev.isForecast,
  }));
}

export function blackRotToKPIs(
  result: BlackRotResult,
  infectionPeriods: InfectionPeriod[]
): ZiektedrukKPIs {
  const observed = infectionPeriods.filter((ip) => !ip.isForecast);
  const forecast = infectionPeriods.filter((ip) => ip.isForecast);

  const light = observed.filter((ip) => ip.severity === 'light').length;
  const moderate = observed.filter((ip) => ip.severity === 'moderate').length;
  const severe = observed.filter((ip) => ip.severity === 'severe').length;

  const currentRIM = result.dailyProgress.length > 0
    ? result.dailyProgress[result.dailyProgress.length - 1].cumulativeRIM
    : 0;

  // Season phase based on calendar:
  // Black rot is "active" from petal fall (May) to harvest (Sep-Oct)
  const today = new Date();
  const month = today.getMonth(); // 0-11
  let seasonPhase: ZiektedrukKPIs['seasonPhase'];
  if (month < 3) seasonPhase = 'dormant'; // Jan-Mar
  else if (month < 5) seasonPhase = 'building'; // Apr-May
  else if (month < 8) seasonPhase = 'peak'; // Jun-Aug
  else if (month < 10) seasonPhase = 'declining'; // Sep-Oct
  else seasonPhase = 'ended'; // Nov-Dec

  const nextForecast = forecast
    .filter((ip) => ip.severity !== 'none')
    .sort((a, b) => a.wetPeriodStart.localeCompare(b.wetPeriodStart))[0];

  return {
    totalInfections: observed.length,
    lightInfections: light,
    moderateInfections: moderate,
    severeInfections: severe,
    currentPAM: 0, // not applicable; use currentRIM via different field
    currentDegreeDays: Math.round(currentRIM), // show cumulative RIM here
    seasonPhase,
    estimatedSeasonEnd: null, // open-ended model
    nextForecastRisk: nextForecast
      ? {
          date: nextForecast.wetPeriodStart.slice(0, 10),
          severity: nextForecast.severity,
        }
      : null,
  };
}
