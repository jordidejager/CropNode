'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CountUpNumber } from './CountUpNumber';

interface KPICardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  changePercent?: number | null;
  invertColors?: boolean;
}

export function KPICard({ label, value, prefix = '', suffix = '', decimals = 0, changePercent, invertColors = false }: KPICardProps) {
  const hasChange = changePercent !== null && changePercent !== undefined && isFinite(changePercent);
  const isPositive = hasChange && changePercent! > 0;
  const isNegative = hasChange && changePercent! < 0;
  const isGood = invertColors ? isNegative : isPositive;
  const isBad = invertColors ? isPositive : isNegative;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-4 min-w-[160px] backdrop-blur-sm">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <CountUpNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} className="text-2xl font-semibold text-slate-100" />
      <div className="flex items-center gap-1 mt-1">
        {hasChange ? (
          <>
            {isPositive ? (
              <TrendingUp className={`size-3.5 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
            ) : isNegative ? (
              <TrendingDown className={`size-3.5 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
            ) : (
              <Minus className="size-3.5 text-slate-600" />
            )}
            <span className={`text-xs font-medium ${isGood ? 'text-emerald-400' : isBad ? 'text-red-400' : 'text-slate-600'}`}>
              {changePercent! > 0 ? '+' : ''}{changePercent!.toFixed(1)}%
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-600">&mdash;</span>
        )}
      </div>
    </div>
  );
}
