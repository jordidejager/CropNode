'use client';

import Link from 'next/link';
import {
  Radio,
  Thermometer,
  Droplets,
  Gauge,
  Sun,
  Waves,
  FlaskConical,
  Leaf,
  Sprout,
  CloudRain,
  AlertCircle,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePhysicalStations,
  useStationMeasurements,
  type PhysicalStation,
  type Measurement,
} from '@/hooks/use-physical-stations';
import { bulkEcToPoreWater } from '@/lib/weather/soil-ec';
import {
  leafWetnessState,
  leafWetnessDurationHours,
} from '@/lib/weather/leaf-wetness';
import { rainSinceMidnight } from '@/lib/weather/daily-aggregation';
import { DailyRainChart } from './DailyRainChart';

/**
 * Combined data overview for ALL of the grower's sensors. One scroll shows
 * every station's key live values together, plus per-weather-station daily
 * rainfall with hourly drill-down. Built so a non-power-user (e.g. dad on the
 * dashboard) gets everything important at a glance.
 */
export function SensorOverview() {
  const { data: stations, isLoading } = usePhysicalStations();

  if (isLoading) {
    return (
      <div className="space-y-4 pb-12">
        {[1, 2].map(i => (
          <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stations || stations.length === 0) {
    return (
      <div className="pb-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <Radio className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1">Nog geen sensoren</h2>
          <p className="text-sm text-white/50 mb-4">
            Voeg een weerstation of bodem-/bladsensor toe om hier al je data bij elkaar te zien.
          </p>
          <Link
            href="/weerstations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Station toevoegen
          </Link>
        </div>
      </div>
    );
  }

  const weatherStations = stations.filter(
    s => s.device_kind === 'weather' || !s.device_kind
  );

  return (
    <div className="pb-12 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white">Sensor-overzicht</h1>
        <p className="text-xs text-white/50 mt-0.5">
          Alle belangrijke meetwaarden van je sensoren bij elkaar
        </p>
      </div>

      {/* Live conditions — one card per sensor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stations.map(s => (
          <StationLiveCard key={s.id} station={s} />
        ))}
      </div>

      {/* Daily rain — per weather station */}
      {weatherStations.map(s => (
        <DailyRainChart key={s.id} stationId={s.id} stationLabel={s.label || s.device_id} />
      ))}
    </div>
  );
}

// ---- Per-station live card ----

const KIND_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  weather: { icon: Radio, label: 'Weerstation' },
  soil: { icon: Sprout, label: 'Bodemsensor' },
  leaf: { icon: Leaf, label: 'Bladsensor' },
};

function StationLiveCard({ station }: { station: PhysicalStation }) {
  const { data: measurements } = useStationMeasurements(station.id, '24h');
  const latest = measurements?.[0];

  const ageMinutes = latest
    ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 60_000)
    : null;
  const isStale = ageMinutes === null || ageMinutes > 60;

  const kind = station.device_kind ?? 'weather';
  const meta = KIND_META[kind] ?? KIND_META.weather;
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 bg-gradient-to-br from-white/[0.04] to-white/[0.02]',
        isStale ? 'border-amber-500/20' : 'border-emerald-500/20'
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
              isStale ? 'bg-amber-500/15' : 'bg-emerald-500/15'
            )}
          >
            <Icon className={cn('h-4 w-4', isStale ? 'text-amber-400' : 'text-emerald-400')} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {station.label || station.device_id}
            </div>
            <div className="text-[10px] text-white/40">{meta.label}</div>
          </div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1 text-[11px] font-semibold shrink-0',
            isStale ? 'text-amber-400' : 'text-emerald-400'
          )}
        >
          {isStale ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {ageMinutes === null ? 'Geen data' : isStale ? 'Verouderd' : 'Live'}
        </div>
      </div>

      {/* Tiles per kind */}
      {!latest ? (
        <div className="text-xs text-white/40 py-4 text-center">Nog geen metingen</div>
      ) : kind === 'soil' ? (
        <SoilTiles measurements={measurements ?? []} />
      ) : kind === 'leaf' ? (
        <LeafTiles measurements={measurements ?? []} />
      ) : (
        <WeatherTiles measurements={measurements ?? []} />
      )}
    </div>
  );
}

// ---- Tile groups ----

function Tile({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={cn('h-3 w-3', color)} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-base font-bold text-white tabular-nums">{value}</span>
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
      </div>
    </div>
  );
}

type M = Measurement;

function fmt(v: number | null, decimals: number): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return decimals === 0 ? Math.round(v).toString() : v.toFixed(decimals);
}

function WeatherTiles({ measurements }: { measurements: M[] }) {
  const latest = measurements[0]!;
  const today = rainSinceMidnight(measurements);
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile icon={Thermometer} label="Temp" value={fmt(latest.temperature_c, 1)} unit="°C" color="text-orange-400" />
      <Tile icon={Droplets} label="RV" value={fmt(latest.humidity_pct, 0)} unit="%" color="text-sky-400" />
      <Tile icon={CloudRain} label="Regen vandaag" value={today.toFixed(1)} unit="mm" color="text-emerald-400" />
      <Tile icon={Gauge} label="Druk" value={fmt(latest.pressure_hpa, 0)} unit="hPa" color="text-violet-400" />
      <Tile
        icon={Sun}
        label="Licht"
        value={
          latest.illuminance_lux === null
            ? '—'
            : latest.illuminance_lux >= 10_000
              ? `${(latest.illuminance_lux / 1000).toFixed(1)}k`
              : Math.round(latest.illuminance_lux).toString()
        }
        unit={latest.illuminance_lux !== null && latest.illuminance_lux >= 10_000 ? 'klux' : 'lux'}
        color="text-amber-300"
      />
    </div>
  );
}

function SoilTiles({ measurements }: { measurements: M[] }) {
  const latest = measurements[0]!;
  const ecPwUsCm = bulkEcToPoreWater(latest.soil_conductivity_us_cm, latest.soil_moisture_pct);
  const ecPwMs = ecPwUsCm !== null ? ecPwUsCm / 1000 : null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile icon={Waves} label="Bodemvocht" value={fmt(latest.soil_moisture_pct, 1)} unit="%" color="text-sky-400" />
      <Tile icon={Thermometer} label="Bodemtemp" value={fmt(latest.soil_temp_c, 1)} unit="°C" color="text-orange-400" />
      <Tile icon={FlaskConical} label="EC porie" value={fmt(ecPwMs, 2)} unit="mS" color="text-emerald-400" />
    </div>
  );
}

function LeafTiles({ measurements }: { measurements: M[] }) {
  const latest = measurements[0]!;
  const state = leafWetnessState(latest.leaf_wetness_pct_measured);
  const lwd = leafWetnessDurationHours(measurements, 24);
  const isWet = state === 'wet';
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
        <div className="flex items-center gap-1 mb-0.5">
          <Leaf className={cn('h-3 w-3', state === null ? 'text-white/40' : isWet ? 'text-emerald-400' : 'text-amber-300')} />
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Blad</span>
        </div>
        <div className="text-base font-bold tabular-nums">
          <span className={state === null ? 'text-white/40' : isWet ? 'text-emerald-300' : 'text-amber-200'}>
            {state === null ? '—' : isWet ? 'Nat' : 'Droog'}
          </span>
        </div>
      </div>
      <Tile icon={Droplets} label="Nat 24u" value={fmt(lwd, 1)} unit="u" color="text-sky-400" />
      <Tile icon={Thermometer} label="Bladtemp" value={fmt(latest.leaf_temp_c, 1)} unit="°C" color="text-orange-400" />
    </div>
  );
}
