'use client';

import { Bug, ShieldAlert, Shield, Thermometer, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { ZiektedrukKPIs, CoveragePoint } from '@/lib/disease-models/types';

interface SeasonSummaryProps {
  kpis: ZiektedrukKPIs;
  coverageTimeline?: CoveragePoint[];
}

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext: string;
  iconColor?: string;
}

function KPICard({ icon: Icon, label, value, subtext, iconColor = 'text-slate-400' }: KPICardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 min-w-[180px]">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/5">
        <Icon className={`size-4 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-xl font-semibold text-slate-100 tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtext}</p>
      </div>
    </div>
  );
}

export function SeasonSummary({ kpis, coverageTimeline }: SeasonSummaryProps) {
  // Calculate current coverage from latest point in timeline
  const currentCoverage = coverageTimeline && coverageTimeline.length > 0
    ? coverageTimeline[coverageTimeline.length - 1].coveragePct
    : null;
  const lastProduct = coverageTimeline && coverageTimeline.length > 0
    ? coverageTimeline[coverageTimeline.length - 1].product
    : null;
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
      <KPICard
        icon={Bug}
        label="Totaal infecties"
        value={kpis.totalInfections}
        subtext={
          kpis.totalInfections === 0
            ? 'dit seizoen'
            : `${kpis.lightInfections} licht · ${kpis.moderateInfections} matig · ${kpis.severeInfections} zwaar`
        }
        iconColor="text-orange-400"
      />

      <KPICard
        icon={ShieldAlert}
        label="Zware infecties"
        value={kpis.severeInfections}
        subtext={kpis.severeInfections > 0 ? 'behandeling noodzakelijk' : 'geen dit seizoen'}
        iconColor={kpis.severeInfections > 0 ? 'text-red-400' : 'text-emerald-400'}
      />

      <KPICard
        icon={Thermometer}
        label="Huidige PAM"
        value={`${Math.round(kpis.currentPAM * 100)}%`}
        subtext={`${Math.round(kpis.currentDegreeDays)} graaddagen`}
        iconColor="text-emerald-400"
      />

      {currentCoverage !== null && (
        <KPICard
          icon={Shield}
          label="Huidige dekking"
          value={`${Math.round(currentCoverage)}%`}
          subtext={lastProduct ?? 'geen bespuiting'}
          iconColor={currentCoverage >= 50 ? 'text-emerald-400' : currentCoverage >= 30 ? 'text-yellow-400' : 'text-red-400'}
        />
      )}

      <KPICard
        icon={CalendarCheck}
        label="Seizoenend"
        value={
          kpis.estimatedSeasonEnd
            ? format(
                new Date(kpis.estimatedSeasonEnd + 'T12:00:00'),
                'd MMM yyyy',
                { locale: nl }
              )
            : '—'
        }
        subtext={kpis.seasonPhase === 'ended' ? 'primair seizoen afgelopen' : 'geschat (PAM > 95%)'}
        iconColor="text-blue-400"
      />
    </div>
  );
}
