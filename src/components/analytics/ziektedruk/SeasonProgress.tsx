'use client';

import { Sprout, Thermometer, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { ZiektedrukKPIs, MillsSeverity } from '@/lib/disease-models/types';

interface SeasonProgressProps {
  kpis: ZiektedrukKPIs;
}

const PHASE_LABELS: Record<ZiektedrukKPIs['seasonPhase'], string> = {
  dormant: 'Rustfase',
  building: 'Opbouwfase',
  peak: 'Piekperiode',
  declining: 'Afnemend',
  ended: 'Seizoen afgelopen',
};

const PHASE_COLORS: Record<ZiektedrukKPIs['seasonPhase'], string> = {
  dormant: 'text-slate-400',
  building: 'text-amber-400',
  peak: 'text-red-400',
  declining: 'text-emerald-400',
  ended: 'text-slate-500',
};

const SEVERITY_LABELS: Record<MillsSeverity, string> = {
  none: 'Geen',
  light: 'Licht',
  moderate: 'Matig',
  severe: 'Zwaar',
};

const SEVERITY_COLORS: Record<MillsSeverity, string> = {
  none: 'text-slate-400',
  light: 'text-yellow-400',
  moderate: 'text-orange-400',
  severe: 'text-red-400',
};

function getProgressBarColor(pam: number): string {
  if (pam >= 0.95) return 'bg-slate-500';
  if (pam >= 0.7) return 'bg-emerald-500';
  if (pam >= 0.3) return 'bg-red-500';
  if (pam >= 0.02) return 'bg-amber-500';
  return 'bg-slate-600';
}

export function SeasonProgress({ kpis }: SeasonProgressProps) {
  const pamPercent = Math.round(kpis.currentPAM * 100);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      {/* PAM Progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sprout className="size-4 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-200">
              Ascosporenrijping
            </span>
          </div>
          <span className={`text-sm font-semibold ${PHASE_COLORS[kpis.seasonPhase]}`}>
            {PHASE_LABELS[kpis.seasonPhase]}
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${getProgressBarColor(kpis.currentPAM)}`}
            style={{ width: `${Math.min(100, pamPercent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-slate-500">0%</span>
          <span className="text-sm font-medium text-slate-300">
            {pamPercent}% van de ascosporen is rijp
          </span>
          <span className="text-xs text-slate-500">100%</span>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Degree days */}
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Thermometer className="size-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Graaddagen</span>
          </div>
          <p className="text-lg font-semibold text-slate-200">
            {Math.round(kpis.currentDegreeDays)}
          </p>
          <p className="text-xs text-slate-500">cumulatief (basis 0°C)</p>
        </div>

        {/* Total infections */}
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="size-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Infectieperiodes</span>
          </div>
          <p className="text-lg font-semibold text-slate-200">
            {kpis.totalInfections}
          </p>
          <p className="text-xs text-slate-500">
            {kpis.severeInfections > 0 && (
              <span className="text-red-400">{kpis.severeInfections} zwaar</span>
            )}
            {kpis.severeInfections > 0 && kpis.moderateInfections > 0 && ' · '}
            {kpis.moderateInfections > 0 && (
              <span className="text-orange-400">{kpis.moderateInfections} matig</span>
            )}
            {kpis.totalInfections === 0 && 'dit seizoen'}
          </p>
        </div>

        {/* Season end estimate */}
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="size-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Seizoenend</span>
          </div>
          <p className="text-lg font-semibold text-slate-200">
            {kpis.estimatedSeasonEnd
              ? format(
                  new Date(kpis.estimatedSeasonEnd + 'T12:00:00'),
                  'd MMM',
                  { locale: nl }
                )
              : '—'}
          </p>
          <p className="text-xs text-slate-500">
            {kpis.estimatedSeasonEnd ? 'PAM > 95%' : 'nog onbekend'}
          </p>
        </div>

        {/* Next forecast risk */}
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="size-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Volgend risico</span>
          </div>
          {kpis.nextForecastRisk ? (
            <>
              <p className={`text-lg font-semibold ${SEVERITY_COLORS[kpis.nextForecastRisk.severity]}`}>
                {SEVERITY_LABELS[kpis.nextForecastRisk.severity]}
              </p>
              <p className="text-xs text-slate-500">
                {format(
                  new Date(kpis.nextForecastRisk.date),
                  'd MMM HH:mm',
                  { locale: nl }
                )}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-emerald-400">Geen</p>
              <p className="text-xs text-slate-500">komende 7 dagen</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
