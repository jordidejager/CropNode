/**
 * Adapter: convert PearScabResult → legacy ZiektedrukResult shape
 */

import type {
  SeasonProgressEntry,
  InfectionPeriod,
  ZiektedrukKPIs,
  MillsSeverity,
} from '../types';
import type { PearScabResult } from './simulation';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function pearScabToSeasonProgress(
  result: PearScabResult
): SeasonProgressEntry[] {
  return result.dailyProgress.map((d) => ({
    date: d.date,
    dailyDD: d.dailyRIM,
    cumulativeDD: d.cumulativeDD,
    pam: d.pam,
    isForecast: d.isForecast,
  }));
}

export function pearScabToInfectionPeriods(
  result: PearScabResult
): InfectionPeriod[] {
  return result.infections.map((ev) => ({
    wetPeriodStart: ev.wetPeriodStart.toISOString(),
    wetPeriodEnd: ev.infectionCompleted.toISOString(),
    durationHours: Math.round(ev.wetDurationHours * 10) / 10,
    avgTemperature: ev.avgTemperature,
    severity: ev.severity as MillsSeverity,
    rimValue: ev.rimValue,
    pamAtEvent: Math.round(ev.pamAtStart * 1000) / 1000,
    degreeDaysCumulative: 0,
    expectedSymptomDate: ev.expectedSymptomDate
      ? toDateStr(ev.expectedSymptomDate)
      : null,
    isForecast: ev.isForecast,
  }));
}

export function pearScabToKPIs(
  result: PearScabResult,
  infectionPeriods: InfectionPeriod[]
): ZiektedrukKPIs {
  const observed = infectionPeriods.filter((ip) => !ip.isForecast);
  const forecast = infectionPeriods.filter((ip) => ip.isForecast);

  const light = observed.filter((ip) => ip.severity === 'light').length;
  const moderate = observed.filter((ip) => ip.severity === 'moderate').length;
  const severe = observed.filter((ip) => ip.severity === 'severe').length;

  const currentPAM = result.finalPAM;
  const currentDD =
    result.dailyProgress.length > 0
      ? result.dailyProgress[result.dailyProgress.length - 1].cumulativeDD
      : 0;

  let seasonPhase: ZiektedrukKPIs['seasonPhase'];
  if (currentPAM < 0.05) seasonPhase = 'dormant';
  else if (currentPAM < 0.5) seasonPhase = 'building';
  else if (currentPAM < 0.9) seasonPhase = 'peak';
  else if (currentPAM < 0.98) seasonPhase = 'declining';
  else seasonPhase = 'ended';

  let estimatedSeasonEnd: string | null = null;
  for (const d of result.dailyProgress) {
    if (d.pam > 0.95) {
      estimatedSeasonEnd = d.date;
      break;
    }
  }

  const nextForecast = forecast
    .filter((ip) => ip.severity !== 'none')
    .sort((a, b) => a.wetPeriodStart.localeCompare(b.wetPeriodStart))[0];

  return {
    totalInfections: observed.length,
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
