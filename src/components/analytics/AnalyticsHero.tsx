'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { LogoIcon } from '@/components/ui/logo';
import { CountUpNumber } from './shared/CountUpNumber';
import { type KPIComparison } from '@/lib/analytics/types';
import { percentageChange } from '@/lib/analytics/calculations';
import Link from 'next/link';

interface AnalyticsHeroProps {
  kpiComparison: KPIComparison | null;
  harvestYear: number;
}

export function AnalyticsHero({ kpiComparison, harvestYear }: AnalyticsHeroProps) {
  const hasData = kpiComparison && (
    kpiComparison.current.totalTreatments > 0 || kpiComparison.current.totalHarvestTons > 0
  );

  const current = kpiComparison?.current;
  const previous = kpiComparison?.previous;

  const heroKPIs = hasData && current ? [
    { label: 'Inputkosten', value: current.totalInputCosts, prefix: '€', change: previous ? percentageChange(current.totalInputCosts, previous.totalInputCosts) : null, invertColor: true },
    { label: 'Kosten/ha', value: current.costsPerHectare, prefix: '€', change: previous ? percentageChange(current.costsPerHectare, previous.costsPerHectare) : null, invertColor: true },
    { label: current.totalHarvestTons > 0 ? 'Totale oogst' : 'Registraties', value: current.totalHarvestTons > 0 ? current.totalHarvestTons : current.totalTreatments, suffix: current.totalHarvestTons > 0 ? ' ton' : '', change: previous ? (current.totalHarvestTons > 0 ? percentageChange(current.totalHarvestTons, previous.totalHarvestTons) : percentageChange(current.totalTreatments, previous.totalTreatments)) : null, invertColor: false },
  ] : null;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl mb-6">
      {/* Background gradient */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a1628 40%, rgba(16, 185, 129, 0.06) 100%)' }} />

      {/* Geometric grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="analytics-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#10b981" strokeWidth="0.5" />
            </pattern>
            <pattern id="analytics-dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="1" fill="#10b981" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#analytics-grid)" />
          <rect width="100%" height="100%" fill="url(#analytics-dots)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between px-6 py-8 md:px-10 md:py-10 gap-6">
        {/* Left: Logo lockup */}
        <div className="flex flex-col items-center md:items-start gap-1">
          <div className="flex items-center gap-3 mb-1">
            <LogoIcon theme="dark" size={40} style="animated" />
            <span className="text-xl font-semibold text-white">CropNode</span>
          </div>
          <span className="analytics-shimmer text-3xl md:text-4xl font-light text-emerald-400 tracking-wide">Analytics</span>
          <span className="text-xs text-slate-500 mt-1">Oogst {harvestYear}</span>
        </div>

        {/* Right: Hero KPIs or empty state */}
        {heroKPIs ? (
          <div className="grid grid-cols-3 gap-4 md:gap-6">
            {heroKPIs.map((kpi) => (
              <div key={kpi.label} className="flex flex-col items-center md:items-end gap-0.5">
                <CountUpNumber
                  value={kpi.value}
                  prefix={kpi.prefix}
                  suffix={kpi.suffix}
                  decimals={kpi.value < 100 ? 1 : 0}
                  className="text-xl md:text-2xl font-semibold text-white"
                />
                <span className="text-xs text-slate-400">{kpi.label}</span>
                {kpi.change !== null && kpi.change !== undefined && isFinite(kpi.change) ? (
                  <div className="flex items-center gap-1">
                    {kpi.change > 0 ? (
                      <TrendingUp className={`size-3 ${kpi.invertColor ? 'text-red-400' : 'text-emerald-400'}`} />
                    ) : (
                      <TrendingDown className={`size-3 ${kpi.invertColor ? 'text-emerald-400' : 'text-red-400'}`} />
                    )}
                    <span className={`text-[10px] font-medium ${(kpi.invertColor ? kpi.change < 0 : kpi.change > 0) ? 'text-emerald-400' : 'text-red-400'}`}>
                      {kpi.change > 0 ? '+' : ''}{kpi.change.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-600">&mdash;</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center md:items-end gap-2 text-center md:text-right">
            <p className="text-sm text-slate-400 max-w-xs">Begin met registreren om je bedrijfscijfers te zien</p>
            <Link href="/slimme-invoer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
              Slimme Invoer openen
            </Link>
          </div>
        )}
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#020617] to-transparent" />

      <style jsx>{`
        .analytics-shimmer {
          background: linear-gradient(90deg, #10b981 0%, #34d399 25%, #6ee7b7 50%, #34d399 75%, #10b981 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}
