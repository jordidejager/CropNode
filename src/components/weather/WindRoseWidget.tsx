'use client';

import { useMemo } from 'react';
import { Wind } from 'lucide-react';
import { WindRose, WindRoseLegend } from './WindRose';
import type { WindRoseDataPoint } from './WindRose';

interface WindRoseWidgetProps {
  /** Merged hourly data from the dashboard (allHourlyData) */
  hourlyData: Array<Record<string, unknown>>;
}

/**
 * Wind rose card widget for the CropNode weather dashboard.
 * Filters the next 48 hours of hourly data and renders the wind rose.
 */
export function WindRoseWidget({ hourlyData }: WindRoseWidgetProps) {
  const windData = useMemo<WindRoseDataPoint[]>(() => {
    const now = Date.now();
    const cutoff = now + 48 * 60 * 60 * 1000;

    return hourlyData
      .filter((d) => {
        const ts = new Date(d.timestamp as string).getTime();
        return ts >= now && ts <= cutoff;
      })
      .map((d) => ({
        wind_direction:
          (d.windDirection as number | null) ??
          (d.wind_direction as number | null),
        wind_speed_ms:
          (d.windSpeedMs as number | null) ??
          (d.wind_speed_ms as number | null),
      }));
  }, [hourlyData]);

  if (windData.length === 0) return null;

  // Compute dominant direction for subtitle
  const dominantDir = useMemo(() => {
    const DIRS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'] as const;
    const counts = new Array(8).fill(0) as number[];

    for (const p of windData) {
      if (p.wind_direction == null) continue;
      const deg = ((p.wind_direction % 360) + 360) % 360;
      const idx = Math.round(deg / 45) % 8;
      counts[idx]!++;
    }

    const maxIdx = counts.indexOf(Math.max(...counts));
    return DIRS[maxIdx] ?? 'N';
  }, [windData]);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
          <Wind className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Windroos</h3>
          <p className="text-[11px] text-slate-500">
            Komende 48u &middot; overwegend {dominantDir}
          </p>
        </div>
      </div>

      {/* Wind rose SVG */}
      <WindRose data={windData} size={280} />

      {/* Legend */}
      <WindRoseLegend />
    </div>
  );
}
