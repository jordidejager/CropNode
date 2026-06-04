'use client';

import Link from 'next/link';
import {
  Radio,
  Thermometer,
  CloudRain,
  Waves,
  FlaskConical,
  Leaf,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePhysicalStations,
  useStationMeasurements,
} from '@/hooks/use-physical-stations';
import { bulkEcToPoreWater } from '@/lib/weather/soil-ec';
import {
  leafWetnessState,
  leafWetnessDurationHours,
} from '@/lib/weather/leaf-wetness';
import { rainSinceMidnight } from '@/lib/weather/daily-aggregation';

/**
 * Compact live-sensor card for the dashboard. Surfaces the handful of values a
 * grower (or their less-technical dad) wants at a glance: air temp + rain
 * today, soil moisture + EC, and leaf wet/dry. Renders nothing when the user
 * has no physical sensors, so it stays out of the way for everyone else.
 */
export function SensorSummaryCard() {
  const { data: stations } = usePhysicalStations();

  if (!stations || stations.length === 0) return null;

  const weather = stations.find(s => s.device_kind === 'weather' || !s.device_kind);
  const soil = stations.find(s => s.device_kind === 'soil');
  const leaf = stations.find(s => s.device_kind === 'leaf');

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Radio className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Mijn sensoren</h2>
            <p className="text-[11px] text-white/40">Live van het veld</p>
          </div>
        </div>
        <Link
          href="/weerstations"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400/80 hover:text-emerald-400 transition-colors"
        >
          Bekijk alles
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {weather && <WeatherMini stationId={weather.id} />}
        {soil && <SoilMini stationId={soil.id} />}
        {leaf && <LeafMini stationId={leaf.id} />}
      </div>
    </div>
  );
}

// ---- mini blocks (self-contained per station) ----

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  color,
  valueClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit?: string;
  color: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1">
        <Icon className={cn('h-3.5 w-3.5', color)} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className={cn('text-lg font-bold tabular-nums', valueClass ?? 'text-white')}>{value}</span>
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
      </div>
    </div>
  );
}

function num(v: number | null, decimals: number): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return decimals === 0 ? Math.round(v).toString() : v.toFixed(decimals);
}

function WeatherMini({ stationId }: { stationId: string }) {
  const { data } = useStationMeasurements(stationId, '24h');
  const latest = data?.[0];
  const today = rainSinceMidnight(data ?? []);
  return (
    <>
      <Stat
        icon={Thermometer}
        label="Temp"
        value={num(latest?.temperature_c ?? null, 1)}
        unit="°C"
        color="text-orange-400"
      />
      <Stat
        icon={CloudRain}
        label="Regen vandaag"
        value={today.toFixed(1)}
        unit="mm"
        color="text-sky-400"
      />
    </>
  );
}

function SoilMini({ stationId }: { stationId: string }) {
  const { data } = useStationMeasurements(stationId, '24h');
  const latest = data?.[0];
  const ecPwUsCm = bulkEcToPoreWater(
    latest?.soil_conductivity_us_cm ?? null,
    latest?.soil_moisture_pct ?? null
  );
  const ecPwMs = ecPwUsCm !== null ? ecPwUsCm / 1000 : null;
  return (
    <>
      <Stat
        icon={Waves}
        label="Bodemvocht"
        value={num(latest?.soil_moisture_pct ?? null, 1)}
        unit="%"
        color="text-sky-400"
      />
      <Stat
        icon={FlaskConical}
        label="EC porie"
        value={num(ecPwMs, 2)}
        unit="mS"
        color="text-emerald-400"
      />
    </>
  );
}

function LeafMini({ stationId }: { stationId: string }) {
  const { data } = useStationMeasurements(stationId, '24h');
  const latest = data?.[0];
  const state = leafWetnessState(latest?.leaf_wetness_pct_measured ?? null);
  const lwd = leafWetnessDurationHours(data ?? [], 24);
  const isWet = state === 'wet';
  return (
    <>
      <Stat
        icon={Leaf}
        label="Blad"
        value={state === null ? '—' : isWet ? 'Nat' : 'Droog'}
        color={state === null ? 'text-white/40' : isWet ? 'text-emerald-400' : 'text-amber-300'}
        valueClass={state === null ? 'text-white/40' : isWet ? 'text-emerald-300' : 'text-amber-200'}
      />
      <Stat
        icon={CloudRain}
        label="Nat 24u"
        value={num(lwd, 1)}
        unit="u"
        color="text-sky-400"
      />
    </>
  );
}
