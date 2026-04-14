'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { Bug } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type {
  SeasonProgressEntry,
  InfectionPeriod,
  MillsSeverity,
  CoveragePointSerialized,
  InfectionCoverage,
} from '@/lib/disease-models/types';

interface InfectionTimelineProps {
  seasonProgress: SeasonProgressEntry[];
  infectionPeriods: InfectionPeriod[];
  coverageTimeline?: CoveragePointSerialized[];
  infectionCoverage?: Record<string, InfectionCoverage>;
  sprayEvents?: { date: string; product: string }[];
}

const SEVERITY_COLORS: Record<MillsSeverity, string> = {
  none: '#64748b',
  light: '#facc15',
  moderate: '#f97316',
  severe: '#ef4444',
};

const SEVERITY_LABELS: Record<MillsSeverity, string> = {
  none: 'Geen infectie',
  light: 'Licht',
  moderate: 'Matig',
  severe: 'Zwaar',
};

const COVERAGE_STATUS_COLORS = {
  good: '#10b981',
  moderate: '#facc15',
  low: '#f97316',
  none: '#ef4444',
};

const COVERAGE_STATUS_LABELS = {
  good: 'Goed gedekt',
  moderate: 'Matige dekking',
  low: 'Lage dekking',
  none: 'Niet gedekt',
};

interface TimelineDataPoint {
  date: string;
  dateLabel: string;
  pam: number;
  coverage: number | null; // 0-100%
  infectionSeverity: number;
  infectionColor: string;
  isForecast: boolean;
  infection: InfectionPeriod | null;
  coverageInfo: InfectionCoverage | null;
  isSprayDay: boolean;
  sprayProduct: string | null;
}

function severityToNumber(s: MillsSeverity): number {
  switch (s) {
    case 'severe': return 3;
    case 'moderate': return 2;
    case 'light': return 1;
    default: return 0;
  }
}

export function InfectionTimeline({
  seasonProgress,
  infectionPeriods,
  coverageTimeline,
  infectionCoverage,
  sprayEvents,
}: InfectionTimelineProps) {
  const data = useMemo(() => {
    // Build infection lookup by date
    const infectionByDate = new Map<string, InfectionPeriod>();
    for (const ip of infectionPeriods) {
      if (ip.severity === 'none') continue;
      const date = ip.wetPeriodStart.split('T')[0];
      const existing = infectionByDate.get(date);
      if (!existing || severityToNumber(ip.severity) > severityToNumber(existing.severity)) {
        infectionByDate.set(date, ip);
      }
    }

    // Build coverage lookup by date (take value closest to noon)
    const coverageByDate = new Map<string, number>();
    if (coverageTimeline) {
      for (const cp of coverageTimeline) {
        const date = cp.timestamp.split('T')[0];
        // Keep the latest value per day
        coverageByDate.set(date, cp.coveragePct);
      }
    }

    // Build spray day lookup
    const sprayDays = new Map<string, string>();
    if (sprayEvents) {
      for (const se of sprayEvents) {
        const date = se.date.split('T')[0];
        sprayDays.set(date, se.product);
      }
    }

    return seasonProgress.map((sp): TimelineDataPoint => {
      const infection = infectionByDate.get(sp.date) ?? null;
      const severity = infection?.severity ?? 'none';
      const covInfo = infection && infectionCoverage
        ? infectionCoverage[infection.wetPeriodStart] ?? null
        : null;

      return {
        date: sp.date,
        dateLabel: format(new Date(sp.date + 'T12:00:00'), 'd MMM', { locale: nl }),
        pam: Math.round(sp.pam * 100),
        coverage: coverageByDate.get(sp.date) ?? null,
        infectionSeverity: severity !== 'none' ? severityToNumber(severity) : 0,
        infectionColor: SEVERITY_COLORS[severity],
        isForecast: sp.isForecast,
        infection,
        coverageInfo: covInfo,
        isSprayDay: sprayDays.has(sp.date),
        sprayProduct: sprayDays.get(sp.date) ?? null,
      };
    });
  }, [seasonProgress, infectionPeriods, coverageTimeline, infectionCoverage, sprayEvents]);

  const hasCoverage = data.some((d) => d.coverage !== null);
  const tickInterval = Math.max(1, Math.floor(data.length / 15));

  return (
    <ChartCard
      title="Infectietijdlijn"
      isEmpty={data.length === 0}
      emptyIcon={Bug}
      emptyTitle="Geen data beschikbaar"
      emptyDescription="Stel de groene-punt datum in om de infectietijdlijn te genereren."
    >
      <div className="overflow-x-auto -mx-5 px-5">
        <div style={{ minWidth: Math.max(600, data.length * 6) }}>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                interval={tickInterval}
              />
              <YAxis
                yAxisId="pam"
                orientation="right"
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                yAxisId="infection"
                orientation="left"
                domain={[0, 3.5]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                ticks={[1, 2, 3]}
                tickFormatter={(v) => {
                  if (v === 1) return 'Licht';
                  if (v === 2) return 'Matig';
                  if (v === 3) return 'Zwaar';
                  return '';
                }}
              />

              {/* Coverage area (grey, behind everything) */}
              {hasCoverage && (
                <Area
                  yAxisId="pam"
                  type="monotone"
                  dataKey="coverage"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.10}
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  name="Restdekking (%)"
                  dot={false}
                  connectNulls={false}
                />
              )}

              {/* PAM curve */}
              <Area
                yAxisId="pam"
                type="monotone"
                dataKey="pam"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.08}
                strokeWidth={2}
                name="Sporenrijping (PAM)"
                dot={false}
              />

              {/* Infection events with coverage-colored borders */}
              <Bar
                yAxisId="infection"
                dataKey="infectionSeverity"
                name="Infectie-ernst"
                maxBarSize={8}
                shape={(props: unknown) => {
                  const { x, y, width, height, payload } = props as {
                    x: number; y: number; width: number; height: number;
                    payload: TimelineDataPoint;
                  };
                  if (!payload.infectionSeverity) return <rect />;

                  const covInfo = payload.coverageInfo;
                  const borderColor = covInfo
                    ? COVERAGE_STATUS_COLORS[covInfo.coverageStatus]
                    : undefined;

                  return (
                    <g>
                      {/* Coverage border ring */}
                      {borderColor && (
                        <rect
                          x={x - 2}
                          y={y - 2}
                          width={width + 4}
                          height={height + 4}
                          fill="none"
                          stroke={borderColor}
                          strokeWidth={2}
                          rx={3}
                          opacity={payload.isForecast ? 0.4 : 0.8}
                        />
                      )}
                      {/* Infection bar */}
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={payload.infectionColor}
                        rx={2}
                        opacity={payload.isForecast ? 0.5 : 0.9}
                      />
                    </g>
                  );
                }}
              />

              {/* Spray markers as reference lines */}
              {sprayEvents?.map((se, i) => {
                const dateLabel = format(
                  new Date(se.date.split('T')[0] + 'T12:00:00'),
                  'd MMM',
                  { locale: nl }
                );
                return (
                  <ReferenceLine
                    key={`spray-${i}`}
                    yAxisId="pam"
                    x={dateLabel}
                    stroke="#60a5fa"
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                );
              })}

              {/* Today reference line */}
              <ReferenceLine
                yAxisId="pam"
                x={format(new Date(), 'd MMM', { locale: nl })}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: 'Vandaag',
                  position: 'top',
                  fill: '#10b981',
                  fontSize: 11,
                }}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as TimelineDataPoint;
                  if (!point) return null;

                  return (
                    <div className="rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-xl max-w-xs">
                      <p className="text-sm font-semibold text-slate-200 mb-1">
                        {format(new Date(point.date + 'T12:00:00'), 'd MMMM yyyy', { locale: nl })}
                        {point.isForecast && (
                          <span className="ml-2 text-xs text-blue-400">(verwachting)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">PAM: {point.pam}%</p>
                      {point.coverage !== null && (
                        <p className="text-xs text-slate-400">Dekking: {Math.round(point.coverage)}%</p>
                      )}
                      {point.isSprayDay && (
                        <p className="text-xs text-blue-400 mt-0.5">
                          💧 Bespuiting: {point.sprayProduct}
                        </p>
                      )}
                      {point.infection && (
                        <div className="mt-1.5 pt-1.5 border-t border-white/5">
                          <p className="text-xs font-medium" style={{ color: SEVERITY_COLORS[point.infection.severity] }}>
                            {SEVERITY_LABELS[point.infection.severity]} infectie
                          </p>
                          <p className="text-xs text-slate-400">
                            {point.infection.durationHours}u nat · {point.infection.avgTemperature}°C · RIM {point.infection.rimValue}
                          </p>
                          {point.coverageInfo && (
                            <p className="text-xs mt-0.5" style={{ color: COVERAGE_STATUS_COLORS[point.coverageInfo.coverageStatus] }}>
                              {COVERAGE_STATUS_LABELS[point.coverageInfo.coverageStatus]}
                              {point.coverageInfo.coverageAtInfection > 0 && ` (${Math.round(point.coverageInfo.coverageAtInfection)}%)`}
                            </p>
                          )}
                          {point.coverageInfo?.curativeWindowOpen && (
                            <p className="text-xs text-amber-400 mt-0.5">
                              Curatief venster open · {point.coverageInfo.curativeRemainingDH} GU resterend
                            </p>
                          )}
                          {point.infection.expectedSymptomDate && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              Symptomen verwacht: {format(new Date(point.infection.expectedSymptomDate + 'T12:00:00'), 'd MMM', { locale: nl })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Legend
                wrapperStyle={{ fontSize: 12, fontWeight: 500 }}
                formatter={(value) => <span className="text-slate-400">{value}</span>}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
