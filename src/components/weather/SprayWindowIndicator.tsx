'use client';

import { useState } from 'react';
import { Wind, Thermometer, Droplets, CloudRain, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  calculateSprayWindowScore,
  calculateSprayWindowScoreForProduct,
  calculateDeltaT,
  SPRAY_PROFILES,
} from '@/lib/weather/weather-calculations';
import type { SprayProductType } from '@/lib/weather/weather-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SprayWindowIndicatorProps {
  currentData: Array<Record<string, unknown>>;
}

const PRODUCT_TABS: Array<{ type: SprayProductType | 'standaard'; label: string; short: string }> = [
  { type: 'standaard', label: 'Standaard', short: 'Std' },
  { type: 'contact', label: 'Contact', short: 'Con' },
  { type: 'systemisch', label: 'Systemisch', short: 'Sys' },
  { type: 'groeistof', label: 'Groeistof', short: 'Grs' },
  { type: 'meststof', label: 'Bladvoeding', short: 'Blv' },
];

type FactorStatus = 'good' | 'warning' | 'bad';

const statusConfig = {
  Groen: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(52,211,153,0.2)]',
    label: 'Goed spuitvenster',
    sublabel: 'Condities zijn geschikt om te spuiten',
  },
  Oranje: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(251,191,36,0.2)]',
    label: 'Matig spuitvenster',
    sublabel: 'Let op condities voordat je spuit',
  },
  Rood: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(239,68,68,0.2)]',
    label: 'Niet geschikt',
    sublabel: 'Condities zijn niet geschikt om te spuiten',
  },
};

function getFactorStatus(score: number): FactorStatus {
  if (score >= 70) return 'good';
  if (score >= 40) return 'warning';
  return 'bad';
}

const factorStatusColors: Record<FactorStatus, string> = {
  good: 'text-emerald-400 bg-emerald-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  bad: 'text-red-400 bg-red-500/10',
};

export function SprayWindowIndicator({ currentData }: SprayWindowIndicatorProps) {
  const [selectedProduct, setSelectedProduct] = useState<SprayProductType | 'standaard'>('standaard');

  // Find the current/most recent hour
  const now = Date.now();
  const sorted = [...currentData].sort(
    (a, b) =>
      Math.abs(new Date(a.timestamp as string).getTime() - now) -
      Math.abs(new Date(b.timestamp as string).getTime() - now)
  );

  const current = sorted[0];
  if (!current) return null;

  const windSpeed = current.windSpeedMs as number | null ?? current.wind_speed_ms as number | null;
  const temp = current.temperatureC as number | null ?? current.temperature_c as number | null;
  const dewPoint = current.dewPointC as number | null ?? current.dew_point_c as number | null;
  const precip = current.precipitationMm as number | null ?? current.precipitation_mm as number | null;

  // Sum precipitation for the next 2 hours
  const currentTime = new Date(current.timestamp as string).getTime();
  const next2hData = currentData.filter((d) => {
    const t = new Date(d.timestamp as string).getTime();
    return t > currentTime && t <= currentTime + 2 * 60 * 60 * 1000;
  });
  const precipNext2h = next2hData.reduce((sum, d) => {
    const p = (d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null) ?? 0;
    return sum + p;
  }, 0);

  const score = selectedProduct === 'standaard'
    ? calculateSprayWindowScore(windSpeed, temp, dewPoint, precip, precipNext2h)
    : calculateSprayWindowScoreForProduct(windSpeed, temp, dewPoint, precip, precipNext2h, selectedProduct);
  const config = statusConfig[score.label];
  const deltaT = calculateDeltaT(temp, dewPoint);

  // Convert wind m/s to km/h for display
  const windKmh = windSpeed !== null ? Math.round(windSpeed * 3.6) : null;

  // Determine precipitation display text (compact)
  const precipText =
    precip !== null && precip > 0
      ? `${precip.toFixed(1)}mm/u`
      : precipNext2h > 0
        ? `${precipNext2h.toFixed(1)}mm 2u`
        : 'Droog 2u';

  const factors = [
    {
      icon: Wind,
      label: 'Wind',
      value: windKmh !== null ? `${windKmh}km/u` : '—',
      status: getFactorStatus(score.factors.wind),
    },
    {
      icon: Thermometer,
      label: 'Temp',
      value: temp !== null ? `${Math.round(temp)}°C` : '—',
      status: getFactorStatus(score.factors.temperature),
    },
    {
      icon: Droplets,
      label: 'Delta-T',
      value: deltaT ? `${deltaT.value.toFixed(1)}°C` : '—',
      status: getFactorStatus(score.factors.deltaT),
      info: true,
    },
    {
      icon: CloudRain,
      label: 'Neerslag',
      value: precipText,
      status: getFactorStatus(score.factors.precipitation),
    },
  ];

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 md:p-6 transition-all',
        config.bg,
        config.border,
        config.glow
      )}
    >
      {/* Product type selector */}
      <div className="flex items-center justify-center gap-1 mb-4">
        {PRODUCT_TABS.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setSelectedProduct(tab.type)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
              selectedProduct === tab.type
                ? 'bg-white/15 text-white'
                : 'text-white/30 hover:text-white/50 hover:bg-white/5'
            )}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short}</span>
          </button>
        ))}
      </div>

      {/* Main indicator */}
      <div className="text-center mb-5">
        <h2 className={cn('text-2xl md:text-3xl font-black', config.text)}>
          {config.label}
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {selectedProduct === 'standaard'
            ? config.sublabel
            : `${SPRAY_PROFILES[selectedProduct].label}: ${config.sublabel.toLowerCase()}`}
        </p>
      </div>

      {/* Factor chips */}
      <TooltipProvider delayDuration={0}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {factors.map((factor) => {
            const chip = (
              <div
                key={factor.label}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-2.5 py-2',
                  factorStatusColors[factor.status]
                )}
              >
                <factor.icon className="h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 leading-none">
                      {factor.label}
                    </span>
                    {factor.info && (
                      <Info className="h-2.5 w-2.5 opacity-40 shrink-0" />
                    )}
                  </div>
                  <div className="text-[13px] font-bold leading-tight whitespace-nowrap mt-0.5">
                    {factor.value}
                  </div>
                </div>
              </div>
            );

            if (!factor.info) return chip;

            return (
              <Tooltip key={factor.label}>
                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[260px] bg-zinc-900 border-white/10 p-3"
                >
                  <p className="text-[11px] font-bold text-white/90 mb-1.5">
                    Delta-T = temperatuur − dauwpunt
                  </p>
                  <p className="text-[10px] text-white/50 mb-2">
                    Meet hoe snel druppels verdampen na het spuiten
                  </p>
                  <div className="space-y-1">
                    {[
                      { range: '< 2°C', label: 'Te vochtig', color: 'text-blue-400' },
                      { range: '2–8°C', label: 'Ideaal', color: 'text-emerald-400' },
                      { range: '8–10°C', label: 'Acceptabel', color: 'text-amber-400' },
                      { range: '> 10°C', label: 'Te droog', color: 'text-red-400' },
                    ].map((row) => (
                      <div key={row.range} className="flex items-center gap-2 text-[10px]">
                        <span className="text-white/40 w-[42px] font-mono">{row.range}</span>
                        <span className={cn('font-semibold', row.color)}>{row.label}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
