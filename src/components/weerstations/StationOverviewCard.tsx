'use client';

import { useMemo } from 'react';
import {
  Thermometer,
  Droplets,
  CloudRain,
  Gauge,
  Radio,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Battery,
  BatteryLow,
  BatteryWarning,
  Signal,
  SignalLow,
  SignalZero,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStationMeasurements,
  type PhysicalStation,
} from '@/hooks/use-physical-stations';

/**
 * Rich, clickable overview row for one physical weather station. Shows a
 * quick visual summary: last reading, age, signal + battery quality, and
 * 24h rain total. Tapping drills into the detail view.
 */
export function StationOverviewCard({
  station,
  onClick,
}: {
  station: PhysicalStation;
  onClick: () => void;
}) {
  const { data: measurements } = useStationMeasurements(station.id, '24h');
  const latest = measurements?.[0];

  const rainfall24h = useMemo(
    () => (measurements ?? []).reduce((sum, m) => sum + (m.rainfall_mm ?? 0), 0),
    [measurements]
  );

  const ageMinutes = latest
    ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 60_000)
    : null;
  const isStale = ageMinutes === null || ageMinutes > 60;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border p-5 transition-all relative overflow-hidden',
        'bg-gradient-to-br from-white/[0.04] to-white/[0.02]',
        'hover:from-white/[0.07] hover:to-white/[0.03]',
        isStale
          ? 'border-amber-500/25 hover:border-amber-500/40'
          : 'border-emerald-500/25 hover:border-emerald-500/40'
      )}
    >
      {/* Ambient glow */}
      <div
        className={cn(
          'absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl pointer-events-none',
          isStale ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        )}
      />

      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            'relative h-12 w-12 rounded-xl flex items-center justify-center shrink-0',
            isStale ? 'bg-amber-500/15' : 'bg-emerald-500/15'
          )}
        >
          <Radio
            className={cn(
              'h-6 w-6',
              isStale ? 'text-amber-400' : 'text-emerald-400'
            )}
          />
          {!isStale && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-slate-950" />
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white truncate">
                  {station.label || station.device_id}
                </h3>
                {station.parcels?.name && (
                  <span className="text-[11px] text-white/40 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    {station.parcels.name}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/30 font-mono truncate mt-0.5">
                {station.device_id}
              </div>
            </div>

            <div
              className={cn(
                'text-right flex items-center gap-1.5 text-xs',
                isStale ? 'text-amber-400' : 'text-emerald-400'
              )}
            >
              {isStale ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span className="font-semibold">
                {ageMinutes === null
                  ? 'Geen data'
                  : isStale
                    ? 'Verouderd'
                    : 'Live'}
              </span>
              {ageMinutes !== null && (
                <span className="text-white/40">· {formatAge(ageMinutes)}</span>
              )}
            </div>
          </div>

          {/* KPI row */}
          {latest && (
            <div className="mt-3.5 grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniStat
                icon={Thermometer}
                label="Temp"
                value={latest.temperature_c}
                unit="°C"
                decimals={1}
                color="text-orange-400"
              />
              <MiniStat
                icon={Droplets}
                label="RV"
                value={latest.humidity_pct}
                unit="%"
                decimals={0}
                color="text-sky-400"
              />
              <MiniStat
                icon={CloudRain}
                label="Regen 24u"
                value={rainfall24h}
                unit="mm"
                decimals={1}
                color="text-emerald-400"
              />
              <MiniStat
                icon={Gauge}
                label="Druk"
                value={latest.pressure_hpa}
                unit="hPa"
                decimals={0}
                color="text-violet-400"
              />
            </div>
          )}

          {/* Quality chips */}
          {latest && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              {latest.battery_v !== null && (
                <BatteryBadge voltage={latest.battery_v} status={latest.battery_status} />
              )}
              {latest.rssi_dbm !== null && (
                <SignalBadge
                  rssi={latest.rssi_dbm}
                  snr={latest.snr_db}
                  gatewayCount={latest.gateway_count}
                />
              )}
              <ChevronRight className="h-4 w-4 text-white/30 ml-auto shrink-0" />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ---- bits ----

function MiniStat({
  icon: Icon,
  label,
  value,
  unit,
  decimals,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  unit: string;
  decimals: number;
  color: string;
}) {
  const display =
    value === null
      ? '—'
      : decimals === 0
        ? Math.round(value).toString()
        : value.toFixed(decimals);
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={cn('h-3 w-3', color)} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-base font-bold text-white tabular-nums">{display}</span>
        <span className="text-[10px] text-white/40">{unit}</span>
      </div>
    </div>
  );
}

function BatteryBadge({
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
  return (
    <div className="flex items-center gap-1 text-white/40">
      <Icon className={cn('h-3 w-3', color)} />
      <span className={cn('font-semibold tabular-nums', color)}>
        {voltage.toFixed(2)}V
      </span>
    </div>
  );
}

function SignalBadge({
  rssi,
  snr,
  gatewayCount,
}: {
  rssi: number;
  snr: number | null;
  gatewayCount: number | null;
}) {
  const quality = rssi >= -110 ? 'strong' : rssi >= -120 ? 'ok' : 'weak';
  const Icon = quality === 'strong' ? Signal : quality === 'ok' ? SignalLow : SignalZero;
  const color =
    quality === 'strong'
      ? 'text-emerald-400'
      : quality === 'ok'
        ? 'text-amber-400'
        : 'text-red-400';
  return (
    <div className="flex items-center gap-1 text-white/40">
      <Icon className={cn('h-3 w-3', color)} />
      <span className={cn('font-semibold tabular-nums', color)}>{rssi}dBm</span>
      {gatewayCount && gatewayCount > 1 && (
        <span className="text-white/30">· {gatewayCount}gw</span>
      )}
      {snr !== null && <span className="text-white/30">· SNR {snr.toFixed(1)}</span>}
    </div>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}u`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
