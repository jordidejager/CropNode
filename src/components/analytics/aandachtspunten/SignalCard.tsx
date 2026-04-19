'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Eye, TrendingUp, TrendingDown, Minus, ArrowRight,
  Sprout, Apple, Shield, Euro, ShieldAlert, CloudRain, BarChart3,
  Gauge, Check, X,
} from 'lucide-react';
import type { Signal, SignalCategory, SignalSeverity } from '@/lib/analytics/signals/types';

const CATEGORY_CONFIG: Record<SignalCategory, { icon: any; label: string; color: string }> = {
  disease:       { icon: ShieldAlert, label: 'Ziektedruk',      color: 'text-red-400' },
  soil:          { icon: Sprout,      label: 'Bodem',           color: 'text-amber-400' },
  quality:       { icon: Apple,       label: 'Kwaliteit',       color: 'text-orange-400' },
  cost:          { icon: Euro,        label: 'Kosten',          color: 'text-blue-400' },
  compliance:    { icon: Shield,      label: 'Compliance',      color: 'text-purple-400' },
  benchmark:     { icon: Gauge,       label: 'Benchmark',       color: 'text-cyan-400' },
  production:    { icon: BarChart3,   label: 'Productie',       color: 'text-emerald-400' },
  weather:       { icon: CloudRain,   label: 'Weer',            color: 'text-sky-400' },
};

const SEVERITY_CONFIG: Record<SignalSeverity, {
  ring: string; bg: string; dot: string; label: string; icon: any;
}> = {
  urgent:    { ring: 'border-red-500/40', bg: 'bg-red-500/5',    dot: 'bg-red-400',    label: 'Urgent',     icon: AlertTriangle },
  attention: { ring: 'border-amber-500/30', bg: 'bg-amber-500/5', dot: 'bg-amber-400', label: 'Let op',    icon: AlertTriangle },
  explore:   { ring: 'border-white/10',   bg: 'bg-white/[0.02]', dot: 'bg-slate-400', label: 'Verkennen', icon: Eye },
};

function formatNumber(n: number | null | undefined, unit: string): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs < 10 ? 1 : 0;
  return `${n.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${unit ? ` ${unit}` : ''}`;
}

function MetricChip({ signal }: { signal: Signal }) {
  const m = signal.metric;
  if (!m) return null;

  const hasPrev = m.prevValue != null && isFinite(m.prevValue) && m.prevValue !== 0;
  const change = hasPrev ? ((m.value - (m.prevValue as number)) / (m.prevValue as number)) * 100 : null;
  const isPositive = change != null && change > 0;
  const isImproving = change != null
    ? (m.higherIsBetter !== false ? isPositive : !isPositive)
    : null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold text-slate-100">{formatNumber(m.value, m.unit)}</span>
      </div>

      {hasPrev && (
        <span className="text-slate-500">
          ← {formatNumber(m.prevValue, m.unit)}
          {change != null && (
            <span className={`ml-1 ${isImproving ? 'text-emerald-400' : isImproving === false ? 'text-red-400' : 'text-slate-400'}`}>
              ({change > 0 ? '+' : ''}{change.toFixed(0)}%)
            </span>
          )}
        </span>
      )}

      {m.benchmark != null && (
        <span className="text-slate-500">
          sector {formatNumber(m.benchmark, m.unit)}
        </span>
      )}

      {m.target != null && (
        <span className="text-slate-500">
          doel {formatNumber(m.target, m.unit)}
        </span>
      )}
    </div>
  );
}

export function SignalCard({ signal }: { signal: Signal }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[signal.category];
  const sev = SEVERITY_CONFIG[signal.severity];
  const CatIcon = cat.icon;
  const SevIcon = sev.icon;

  return (
    <div className={`rounded-xl border ${sev.ring} ${sev.bg} p-4 md:p-5 transition-colors`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 size-8 shrink-0 rounded-lg flex items-center justify-center ${sev.bg} border ${sev.ring}`}>
          <SevIcon className={`size-4 ${signal.severity === 'urgent' ? 'text-red-400' : signal.severity === 'attention' ? 'text-amber-400' : 'text-slate-400'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${cat.color}`}>
              <CatIcon className="size-3" />
              {cat.label}
            </div>
            <div className={`size-1.5 rounded-full ${sev.dot}`} />
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{sev.label}</span>
          </div>

          <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-1.5">
            {signal.title}
          </h3>

          <p className="text-xs text-slate-400 leading-relaxed mb-2">
            {signal.body}
          </p>

          {signal.metric && (
            <div className="mb-3">
              <MetricChip signal={signal} />
            </div>
          )}

          {signal.affectedParcels.length > 0 && signal.affectedParcels.length <= 5 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {signal.affectedParcels.map((p) => (
                <span key={p} className="text-[10px] text-slate-300 bg-white/5 rounded px-1.5 py-0.5 border border-white/5">
                  {p}
                </span>
              ))}
            </div>
          )}

          {signal.affectedParcels.length > 5 && (
            <p className="text-[10px] text-slate-500 mb-3">
              {signal.affectedParcels.length} percelen betrokken
            </p>
          )}

          {signal.action && (
            <div className="flex items-center gap-2">
              {signal.action.href ? (
                <Link
                  href={signal.action.href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {signal.action.label}
                  <ArrowRight className="size-3" />
                </Link>
              ) : (
                <button className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                  {signal.action.label}
                  <ArrowRight className="size-3" />
                </button>
              )}
            </div>
          )}

          {/* Debug: detector mechanism (subtle) */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[9px] text-slate-700 hover:text-slate-500 transition-colors"
          >
            {expanded ? 'Verberg' : 'Waarom dit signaal?'}
          </button>
          {expanded && (
            <div className="mt-1 text-[10px] text-slate-500 bg-white/[0.02] rounded p-2 border border-white/5">
              Detector: <code className="text-slate-400">{signal.mechanism}</code>
              <br />
              Prioriteit: {signal.priority}/100
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
