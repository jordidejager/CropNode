'use client';

import { useMemo } from 'react';
import {
  usePhysicalStations,
  useStationMeasurements,
  type Measurement,
} from '@/hooks/use-physical-stations';
import { cn } from '@/lib/utils';
import {
  Thermometer,
  Droplets,
  Gauge,
  CloudRain,
  Sun,
  Battery,
  BatteryLow,
  BatteryWarning,
  Signal,
  SignalLow,
  SignalZero,
  Radio,
  Wifi,
  AlertCircle,
} from 'lucide-react';

/**
 * LiveStationCard — shows the latest sensor reading from a CropNode physical
 * weather station. Appears at the top of the Weather Dashboard when the user
 * has at least one registered physical station.
 *
 * Design goals:
 *  - Glanceable: biggest = temp + rainfall, less critical stats in a chip row
 *  - Trust signals: last-seen timestamp, battery, signal quality always visible
 *  - Zero UI if no station registered (don't nag new users)
 */
export function LiveStationCard() {
  const { data: stations, isLoading: stationsLoading } = usePhysicalStations();

  const activeStation = useMemo(() => {
    return stations?.find(s => s.active) ?? stations?.[0] ?? null;
  }, [stations]);

  const { data: measurements, isLoading: measurementsLoading } =
    useStationMeasurements(activeStation?.id ?? null, '24h');

  // Derived values — must be declared BEFORE any early returns to keep the
  // hook call order stable across renders (React Rules of Hooks).
  const latest: Measurement | undefined = measurements?.[0];

  const rainfallLastHour = useMemo(() => {
    if (!measurements || measurements.length === 0) return 0;
    const cutoff = Date.now() - 60 * 60 * 1000;
    return measurements
      .filter(m => new Date(m.measured_at).getTime() >= cutoff)
      .reduce((sum, m) => sum + (m.rainfall_mm ?? 0), 0);
  }, [measurements]);

  const rainfallLast24h = useMemo(() => {
    if (!measurements || measurements.length === 0) return 0;
    return measurements.reduce((sum, m) => sum + (m.rainfall_mm ?? 0), 0);
  }, [measurements]);

  const ageMinutes = latest
    ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 60_000)
    : null;
  const isStale = ageMinutes !== null && ageMinutes > 60;

  // Now safe to bail out
  if (!stationsLoading && (!stations || stations.length === 0)) return null;
  if (!activeStation) return null;

  if (measurementsLoading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-white/5 border border-emerald-500/25 p-5 animate-pulse">
        <div className="h-5 w-40 bg-white/10 rounded mb-3" />
        <div className="h-12 w-32 bg-white/10 rounded" />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">
              {activeStation.label || activeStation.device_id}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Nog geen metingen ontvangen. Controleer of het station online is
              en via TTN data verstuurt.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl p-5 md:p-6 border backdrop-blur-sm relative overflow-hidden',
        'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white/5',
        'border-emerald-500/25',
        isStale && 'from-amber-500/10 via-amber-500/5 border-amber-500/25'
      )}
    >
      {/* Ambient glow */}
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div
                className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center',
                  isStale ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                )}
              >
                <Radio
                  className={cn(
                    'h-4.5 w-4.5',
                    isStale ? 'text-amber-400' : 'text-emerald-400'
                  )}
                />
              </div>
              {!isStale && (
                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-slate-950" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400/80">
                Eigen weerstation
              </div>
              <div className="text-sm font-bold text-white">
                {activeStation.label || activeStation.device_id}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                isStale ? 'text-amber-400' : 'text-emerald-400/80'
              )}
            >
              {isStale ? 'Verouderd' : 'Live'}
            </div>
            <div className="text-xs text-white/50 tabular-nums">
              {ageMinutes !== null ? formatAge(ageMinutes) : '—'}
            </div>
          </div>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <PrimaryKPI
            icon={Thermometer}
            label="Temperatuur"
            value={latest.temperature_c}
            unit="°C"
            decimals={1}
            accent="orange"
          />
          <PrimaryKPI
            icon={Droplets}
            label="Luchtvochtigheid"
            value={latest.humidity_pct}
            unit="%"
            decimals={0}
            accent="sky"
          />
          <PrimaryKPI
            icon={CloudRain}
            label="Regen 24u"
            value={rainfallLast24h}
            unit="mm"
            decimals={1}
            accent="emerald"
            sublabel={rainfallLastHour > 0 ? `${rainfallLastHour.toFixed(1)} laatste uur` : undefined}
          />
          <PrimaryKPI
            icon={Gauge}
            label="Luchtdruk"
            value={latest.pressure_hpa}
            unit="hPa"
            decimals={0}
            accent="violet"
          />
        </div>

        {/* Secondary chips */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {latest.dew_point_c !== null && (
            <Chip icon={Droplets} label="Dauwpunt" value={`${latest.dew_point_c.toFixed(1)}°C`} />
          )}
          {latest.illuminance_lux !== null && (
            <Chip
              icon={Sun}
              label="Licht"
              value={formatLux(latest.illuminance_lux)}
            />
          )}
          {latest.battery_v !== null && (
            <BatteryChip
              voltage={latest.battery_v}
              status={latest.battery_status}
            />
          )}
          {latest.rssi_dbm !== null && (
            <SignalChip
              rssi={latest.rssi_dbm}
              snr={latest.snr_db}
              gatewayCount={latest.gateway_count}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

type AccentKey = 'orange' | 'sky' | 'emerald' | 'violet';

const accentClasses: Record<AccentKey, { icon: string; glow: string }> = {
  orange: { icon: 'text-orange-400', glow: 'from-orange-500/10' },
  sky: { icon: 'text-sky-400', glow: 'from-sky-500/10' },
  emerald: { icon: 'text-emerald-400', glow: 'from-emerald-500/10' },
  violet: { icon: 'text-violet-400', glow: 'from-violet-500/10' },
};

function PrimaryKPI({
  icon: Icon,
  label,
  value,
  unit,
  decimals,
  accent,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  unit: string;
  decimals: number;
  accent: AccentKey;
  sublabel?: string;
}) {
  const a = accentClasses[accent];
  const display =
    value === null
      ? '—'
      : decimals === 0
        ? Math.round(value).toString()
        : value.toFixed(decimals);
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl p-3 md:p-3.5',
        'bg-gradient-to-br to-transparent border border-white/10',
        a.glow
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn('h-3.5 w-3.5', a.icon)} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl md:text-2xl font-bold text-white tabular-nums">
          {display}
        </span>
        <span className="text-xs text-white/40">{unit}</span>
      </div>
      {sublabel && (
        <div className="text-[10px] text-white/40 mt-0.5 truncate">{sublabel}</div>
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5">
      <Icon className="h-3 w-3 text-white/50" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </span>
      <span className="text-xs font-semibold text-white/80 tabular-nums">{value}</span>
    </div>
  );
}

function BatteryChip({
  voltage,
  status,
}: {
  voltage: number;
  status: 'good' | 'low' | 'critical' | null;
}) {
  const Icon = status === 'critical' ? BatteryWarning : status === 'low' ? BatteryLow : Battery;
  const color =
    status === 'critical'
      ? 'text-red-400'
      : status === 'low'
        ? 'text-amber-400'
        : 'text-emerald-400';
  const label =
    status === 'critical'
      ? 'Bijna leeg'
      : status === 'low'
        ? 'Voldoende'
        : 'Vol';
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5"
      title={`Accuspanning: ${voltage.toFixed(2)} V`}
    >
      <Icon className={cn('h-3 w-3', color)} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        Accu
      </span>
      <span className={cn('text-xs font-semibold', color)}>{label}</span>
    </div>
  );
}

function SignalChip({
  rssi,
  snr,
  gatewayCount,
}: {
  rssi: number;
  snr: number | null;
  gatewayCount: number | null;
}) {
  // LoRaWAN quality thresholds — user-friendly labels
  const { label, color } =
    rssi >= -100
      ? { label: 'Zeer goed', color: 'text-emerald-400' }
      : rssi >= -110
        ? { label: 'Goed', color: 'text-emerald-400' }
        : rssi >= -120
          ? { label: 'Matig', color: 'text-amber-400' }
          : { label: 'Zwak', color: 'text-red-400' };
  const Icon = rssi >= -120 ? Wifi : Signal;
  // Hover tip preserves the technical detail for installers
  const tooltipParts = [`${rssi} dBm`];
  if (snr !== null) tooltipParts.push(`SNR ${snr.toFixed(1)} dB`);
  if (gatewayCount && gatewayCount > 0)
    tooltipParts.push(`${gatewayCount} gateway${gatewayCount > 1 ? 's' : ''}`);
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5"
      title={tooltipParts.join(' · ')}
    >
      <Icon className={cn('h-3 w-3', color)} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        Signaal
      </span>
      <span className={cn('text-xs font-semibold', color)}>{label}</span>
    </div>
  );
}

// ---- formatting ----

function formatAge(minutes: number): string {
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes}m geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  return `${days}d geleden`;
}

function formatLux(lux: number): string {
  if (lux >= 10_000) return `${(lux / 1000).toFixed(1)}k lux`;
  return `${lux} lux`;
}
