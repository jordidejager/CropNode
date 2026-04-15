'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { MultiModelData } from '@/hooks/use-weather';

interface MultiModelConsensusProps {
  data: MultiModelData;
}

/**
 * Replaces the 4 tiny unreadable mini-charts with a one-line consensus summary.
 * Shows: "Alle modellen eens: droog tot donderdag" or "Modellen oneens over neerslag woensdag"
 */
export function MultiModelConsensus({ data }: MultiModelConsensusProps) {
  const models = data?.models;
  if (!models || Object.keys(models).length === 0) return null;

  const modelNames = Object.keys(models);
  const consensus = analyzeConsensus(models);

  return (
    <Link
      href="/weer/forecast"
      className="block rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/[0.07] transition-colors group"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          'mt-0.5 p-2 rounded-xl shrink-0',
          consensus.agreement === 'high'
            ? 'bg-emerald-500/10 text-emerald-400'
            : consensus.agreement === 'medium'
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-red-500/10 text-red-400'
        )}>
          {consensus.agreement === 'high' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white/30">
              Multi-Model ({modelNames.length} modellen)
            </span>
            <ArrowRight className="h-3 w-3 text-white/20 group-hover:text-emerald-400 transition-colors" />
          </div>
          <p className="text-sm text-white/80 leading-snug">
            {consensus.summary}
          </p>
          {consensus.detail && (
            <p className="text-xs text-white/30 mt-1">{consensus.detail}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// Consensus analysis
// ============================================================================

interface ConsensusResult {
  agreement: 'high' | 'medium' | 'low';
  summary: string;
  detail?: string;
}

function analyzeConsensus(
  models: Record<string, { time: string[]; temperature_c: (number | null)[]; precipitation_mm: (number | null)[]; wind_speed_ms: (number | null)[] }>
): ConsensusResult {
  const modelNames = Object.keys(models);
  if (modelNames.length < 2) {
    return { agreement: 'high', summary: 'Onvoldoende modellen voor vergelijking.' };
  }

  const today = new Date().toISOString().split('T')[0]!;

  // Analyze precipitation consensus per day (next 7 days)
  const dailyPrecipPerModel = new Map<string, Map<string, number>>();

  for (const [modelName, m] of Object.entries(models)) {
    for (let i = 0; i < m.time.length; i++) {
      const date = m.time[i].slice(0, 10);
      if (date < today) continue;
      if (!dailyPrecipPerModel.has(date)) dailyPrecipPerModel.set(date, new Map());
      const dayMap = dailyPrecipPerModel.get(date)!;
      const current = dayMap.get(modelName) ?? 0;
      dayMap.set(modelName, current + (m.precipitation_mm[i] ?? 0));
    }
  }

  // Find days with disagreement
  const disagreementDays: string[] = [];
  const dryDays: string[] = [];
  const wetDays: string[] = [];

  const sortedDates = Array.from(dailyPrecipPerModel.keys()).sort().slice(0, 7);

  for (const date of sortedDates) {
    const dayMap = dailyPrecipPerModel.get(date)!;
    const values = Array.from(dayMap.values());
    if (values.length < 2) continue;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    // Disagreement if spread > 5mm or if some say dry and others say wet
    const someDry = min < 1;
    const someWet = max > 3;

    if ((max - min > 5) || (someDry && someWet && avg > 1)) {
      disagreementDays.push(date);
    } else if (avg < 0.5) {
      dryDays.push(date);
    } else {
      wetDays.push(date);
    }
  }

  // Build summary
  const formatDay = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('nl-NL', { weekday: 'long' });
  };

  if (disagreementDays.length === 0) {
    // High consensus
    if (wetDays.length === 0) {
      return {
        agreement: 'high',
        summary: `Alle modellen eens: overwegend droog de komende ${sortedDates.length} dagen.`,
      };
    }
    if (dryDays.length === 0) {
      return {
        agreement: 'high',
        summary: `Alle modellen eens: neerslag verwacht de komende dagen.`,
      };
    }
    const firstWet = wetDays[0];
    return {
      agreement: 'high',
      summary: `Alle modellen eens: droog tot ${formatDay(firstWet)}, daarna neerslag.`,
    };
  }

  if (disagreementDays.length <= 2) {
    const dayNames = disagreementDays.map(formatDay).join(' en ');
    return {
      agreement: 'medium',
      summary: `Modellen oneens over neerslag op ${dayNames}.`,
      detail: `${dryDays.length} droge en ${wetDays.length} natte dagen waar modellen het wél over eens zijn.`,
    };
  }

  return {
    agreement: 'low',
    summary: `Grote onzekerheid: modellen verschillen op ${disagreementDays.length} van de ${sortedDates.length} dagen.`,
    detail: 'Bekijk de expert-weergave voor details per model.',
  };
}
