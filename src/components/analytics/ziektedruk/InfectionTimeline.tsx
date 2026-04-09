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
} from '@/lib/disease-models/types';

interface InfectionTimelineProps {
  seasonProgress: SeasonProgressEntry[];
  infectionPeriods: InfectionPeriod[];
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

interface TimelineDataPoint {
  date: string;
  dateLabel: string;
  pam: number;
  precipitation: number;
  infectionSeverity: number; // 0=none, 1=light, 2=moderate, 3=severe
  infectionColor: string;
  isForecast: boolean;
  infection: InfectionPeriod | null;
}

function severityToNumber(s: MillsSeverity): number {
  switch (s) {
    case 'severe':
      return 3;
    case 'moderate':
      return 2;
    case 'light':
      return 1;
    default:
      return 0;
  }
}

export function InfectionTimeline({
  seasonProgress,
  infectionPeriods,
}: InfectionTimelineProps) {
  const data = useMemo(() => {
    // Build infection lookup by date
    const infectionByDate = new Map<string, InfectionPeriod>();
    for (const ip of infectionPeriods) {
      if (ip.severity === 'none') continue;
      const date = ip.wetPeriodStart.split('T')[0];
      // Keep the most severe infection per day
      const existing = infectionByDate.get(date);
      if (
        !existing ||
        severityToNumber(ip.severity) >
          severityToNumber(existing.severity)
      ) {
        infectionByDate.set(date, ip);
      }
    }

    return seasonProgress.map((sp): TimelineDataPoint => {
      const infection = infectionByDate.get(sp.date) ?? null;
      const severity = infection?.severity ?? 'none';

      return {
        date: sp.date,
        dateLabel: format(new Date(sp.date + 'T12:00:00'), 'd MMM', {
          locale: nl,
        }),
        pam: Math.round(sp.pam * 100),
        precipitation: 0, // Could be added from weather data
        infectionSeverity: severity !== 'none' ? severityToNumber(severity) : 0,
        infectionColor: SEVERITY_COLORS[severity],
        isForecast: sp.isForecast,
        infection,
      };
    });
  }, [seasonProgress, infectionPeriods]);

  // Find today's position for reference line
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Show every Nth label to avoid crowding
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
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.03)"
              />
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
                label={{
                  value: 'PAM %',
                  angle: 90,
                  position: 'insideRight',
                  style: { fill: '#64748b', fontSize: 11 },
                }}
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

              {/* Infection events */}
              <Bar
                yAxisId="infection"
                dataKey="infectionSeverity"
                name="Infectie-ernst"
                maxBarSize={8}
                shape={(props: unknown) => {
                  const { x, y, width, height, payload } = props as {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                    payload: TimelineDataPoint;
                  };
                  if (!payload.infectionSeverity) return <rect />;
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={payload.infectionColor}
                      rx={2}
                      opacity={payload.isForecast ? 0.5 : 0.9}
                    />
                  );
                }}
              />

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
                        {format(
                          new Date(point.date + 'T12:00:00'),
                          'd MMMM yyyy',
                          { locale: nl }
                        )}
                        {point.isForecast && (
                          <span className="ml-2 text-xs text-blue-400">
                            (verwachting)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        PAM: {point.pam}%
                      </p>
                      {point.infection && (
                        <>
                          <div className="mt-1.5 pt-1.5 border-t border-white/5">
                            <p
                              className="text-xs font-medium"
                              style={{
                                color:
                                  SEVERITY_COLORS[point.infection.severity],
                              }}
                            >
                              {SEVERITY_LABELS[point.infection.severity]}{' '}
                              infectie
                            </p>
                            <p className="text-xs text-slate-400">
                              {point.infection.durationHours}u nat ·{' '}
                              {point.infection.avgTemperature}°C · RIM{' '}
                              {point.infection.rimValue}
                            </p>
                            {point.infection.expectedSymptomDate && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                Symptomen verwacht:{' '}
                                {format(
                                  new Date(
                                    point.infection.expectedSymptomDate +
                                      'T12:00:00'
                                  ),
                                  'd MMM',
                                  { locale: nl }
                                )}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                }}
              />

              <Legend
                wrapperStyle={{ fontSize: 12, fontWeight: 500 }}
                formatter={(value) => (
                  <span className="text-slate-400">{value}</span>
                )}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
