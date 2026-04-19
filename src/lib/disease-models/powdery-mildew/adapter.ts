/**
 * Adapter: convert MildewResult to legacy ZiektedrukResult shape.
 */

import type {
  SeasonProgressEntry,
  InfectionPeriod,
  ZiektedrukKPIs,
  MillsSeverity,
} from '../types';
import type { MildewResult, MildewInfectionEvent } from './types';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mildewToSeasonProgress(
  result: MildewResult
): SeasonProgressEntry[] {
  if (result.dailyProgress.length === 0) return [];

  const maxRIM = Math.max(1, ...result.dailyProgress.map((d) => d.cumulativeRIM));

  return result.dailyProgress.map((d) => ({
    date: d.date,
    dailyDD: d.dailyRIM,
    cumulativeDD: d.cumulativeRIM,
    pam: d.cumulativeRIM / maxRIM, // proxy so UI shows "progress"
    isForecast: d.isForecast,
  }));
}

export function mildewToInfectionPeriods(
  result: MildewResult
): InfectionPeriod[] {
  return result.infections.map((ev) => ({
    wetPeriodStart: ev.windowStart.toISOString(),
    wetPeriodEnd: ev.infectionCompleted.toISOString(),
    durationHours: Math.round(ev.favorableDurationHours * 10) / 10,
    avgTemperature: ev.avgTemperature,
    severity: ev.severity as MillsSeverity,
    rimValue: ev.rimValue,
    pamAtEvent: 0,
    degreeDaysCumulative: 0,
    expectedSymptomDate: ev.expectedSymptomDate
      ? toDateStr(ev.expectedSymptomDate)
      : null,
    isForecast: ev.isForecast,
  }));
}

export function mildewToKPIs(
  result: MildewResult,
  infectionPeriods: InfectionPeriod[]
): ZiektedrukKPIs {
  const observed = infectionPeriods.filter((ip) => !ip.isForecast);
  const forecast = infectionPeriods.filter((ip) => ip.isForecast);

  const light = observed.filter((ip) => ip.severity === 'light').length;
  const moderate = observed.filter((ip) => ip.severity === 'moderate').length;
  const severe = observed.filter((ip) => ip.severity === 'severe').length;

  const currentRIM =
    result.dailyProgress.length > 0
      ? result.dailyProgress[result.dailyProgress.length - 1].cumulativeRIM
      : 0;

  const today = new Date();
  const month = today.getMonth();
  let seasonPhase: ZiektedrukKPIs['seasonPhase'];
  if (month < 2) seasonPhase = 'dormant';
  else if (month < 4) seasonPhase = 'building'; // spring bud break, primary mildew
  else if (month < 7) seasonPhase = 'peak'; // prime infection season
  else if (month < 9) seasonPhase = 'declining'; // slower growth
  else seasonPhase = 'ended';

  const nextForecast = forecast
    .filter((ip) => ip.severity !== 'none')
    .sort((a, b) => a.wetPeriodStart.localeCompare(b.wetPeriodStart))[0];

  return {
    totalInfections: observed.length,
    lightInfections: light,
    moderateInfections: moderate,
    severeInfections: severe,
    currentPAM: 0,
    currentDegreeDays: Math.round(currentRIM),
    seasonPhase,
    estimatedSeasonEnd: null,
    nextForecastRisk: nextForecast
      ? {
          date: nextForecast.wetPeriodStart.slice(0, 10),
          severity: nextForecast.severity,
        }
      : null,
  };
}
