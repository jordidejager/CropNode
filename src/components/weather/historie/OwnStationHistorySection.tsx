'use client';

import Link from 'next/link';
import { Radio, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { usePhysicalStations } from '@/hooks/use-physical-stations';
import { StationHistoryChart } from '@/components/weather/StationHistoryChart';

/**
 * "Jouw weerstation" section on the Historie page. Lets a grower scroll through
 * the historie of their own LoRaWAN sensors next to KNMI data. Renders nothing
 * if the user has no registered physical stations — the rest of the page stays
 * KNMI-only in that case.
 */
export function OwnStationHistorySection() {
  const { data: stations, isLoading } = usePhysicalStations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 animate-pulse h-48" />
    );
  }
  if (!stations || stations.length === 0) return null;

  const activeId = selectedId ?? stations[0]!.id;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Radio className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Jouw weerstation</h2>
            <p className="text-[11px] text-white/40">
              Eigen sensor-metingen, naast KNMI hieronder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stations.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-white/5 border border-white/10 p-1">
              {stations.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors',
                    activeId === s.id
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-white/50 hover:text-white/80'
                  )}
                >
                  {s.label || s.device_id}
                </button>
              ))}
            </div>
          )}
          <Link
            href="/weerstations"
            className="inline-flex items-center gap-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors px-2.5 py-1.5 text-[11px] font-semibold"
          >
            Open weerstation
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <StationHistoryChart stationId={activeId} />
    </div>
  );
}
