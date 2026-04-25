'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Radio,
  Thermometer,
  Droplets,
  CloudRain,
  Gauge,
  Sun,
  Wind,
  Settings,
  AlertCircle,
  CheckCircle2,
  Activity,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useStationMeasurements,
  type PhysicalStation,
  type Measurement,
} from '@/hooks/use-physical-stations';
import { StationHistoryChart } from '@/components/weather/StationHistoryChart';

/**
 * Rich detail view for one physical station. Header with live status,
 * big KPI grid, signal/battery health, and a history chart.
 */
export function StationDetailView({
  station,
  onBack,
}: {
  station: PhysicalStation;
  onBack: () => void;
}) {
  const { data: measurements } = useStationMeasurements(station.id, '24h');
  const latest: Measurement | undefined = measurements?.[0];

  const rain24h = useMemo(
    () => (measurements ?? []).reduce((s, m) => s + (m.rainfall_mm ?? 0), 0),
    [measurements]
  );
  const rain1h = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return (measurements ?? [])
      .filter(m => new Date(m.measured_at).getTime() >= cutoff)
      .reduce((s, m) => s + (m.rainfall_mm ?? 0), 0);
  }, [measurements]);

  const tempTrend = useMemo(() => computeTempTrend(measurements ?? []), [measurements]);

  const ageMinutes = latest
    ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 60_000)
    : null;
  const isStale = ageMinutes === null || ageMinutes > 60;

  return (
    <div className="space-y-4 pb-12">
      {/* Breadcrumb back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar overzicht
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'relative h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 border',
              isStale
                ? 'bg-amber-500/15 border-amber-500/30'
                : 'bg-emerald-500/15 border-emerald-500/30'
            )}
          >
            <Radio className={cn('h-7 w-7', isStale ? 'text-amber-400' : 'text-emerald-400')} />
            {!isStale && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              {station.label || station.device_id}
            </h1>
            <div className="flex items-center gap-2 text-xs text-white/50 mt-0.5 flex-wrap">
              <span className="font-mono">{station.device_id}</span>
              {station.parcels?.name && (
                <>
                  <span className="text-white/25">·</span>
                  <span>{station.parcels.name}</span>
                </>
              )}
              <span className="text-white/25">·</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  isStale ? 'text-amber-400' : 'text-emerald-400'
                )}
              >
                {isStale ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {ageMinutes !== null ? formatAge(ageMinutes) : 'Geen data'}
              </span>
            </div>
          </div>
        </div>

        <Link
          href="/instellingen/weerstations"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors px-3 py-2 text-xs font-semibold"
        >
          <Settings className="h-3.5 w-3.5" />
          Beheer
        </Link>
      </div>

      {/* No data state */}
      {!latest && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <h2 className="text-sm font-bold text-white mb-1">Nog geen metingen</h2>
          <p className="text-xs text-white/60 max-w-md mx-auto">
            Er is geen uplink ontvangen van dit station. Check of de TTN webhook
            actief is en of het station online is.
          </p>
        </div>
      )}

      {/* Primary KPI tiles */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigKPI
            icon={Thermometer}
            label="Temperatuur"
            value={latest.temperature_c}
            unit="°C"
            decimals={1}
            accent="orange"
            trend={tempTrend}
            sublabel={latest.dew_point_c !== null ? `Dauwpunt ${latest.dew_point_c.toFixed(1)}°C` : undefined}
          />
          <BigKPI
            icon={Droplets}
            label="Luchtvochtigheid"
            value={latest.humidity_pct}
            unit="%"
            decimals={0}
            accent="sky"
            sublabel={latest.wet_bulb_c !== null ? `Wet-bulb ${latest.wet_bulb_c.toFixed(1)}°C` : undefined}
          />
          <BigKPI
            icon={CloudRain}
            label="Regen 24u"
            value={rain24h}
            unit="mm"
            decimals={1}
            accent="emerald"
            sublabel={rain1h > 0 ? `${rain1h.toFixed(1)} mm laatste uur` : 'Droog laatste uur'}
          />
          <BigKPI
            icon={Gauge}
            label="Luchtdruk"
            value={latest.pressure_hpa}
            unit="hPa"
            decimals={0}
            accent="violet"
            sublabel={pressureTendency(latest.pressure_hpa)}
          />
        </div>
      )}

      {/* Secondary row — light, dew, technical health */}
      {latest && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HealthCard
            title="Licht"
            icon={Sun}
            accent="text-amber-300"
            main={
              latest.illuminance_lux !== null
                ? formatLux(latest.illuminance_lux)
                : '—'
            }
            sub={daylightLabel(latest.illuminance_lux)}
          />
          <HealthCard
            title="Accu"
            icon={Zap}
            accent={batteryColor(latest.battery_status)}
            main={batteryMainLabel(latest.battery_status)}
            sub={
              latest.battery_v !== null
                ? `${batteryAdvice(latest.battery_status)} · ${latest.battery_v.toFixed(2)} V`
                : batteryAdvice(latest.battery_status)
            }
          />
          <HealthCard
            title="LoRaWAN signaal"
            icon={Activity}
            accent={signalColor(latest.rssi_dbm)}
            main={signalMainLabel(latest.rssi_dbm)}
            sub={signalDetail(latest.rssi_dbm, latest.snr_db, latest.gateway_count)}
          />
        </div>
      )}

      {/* History chart */}
      <StationHistoryChart stationId={station.id} />

      {/* Technical footer card */}
      <TechFooter station={station} latest={latest} />
    </div>
  );
}

// ---- KPI tile ----

const accentStyles = {
  orange: {
    gradient: 'from-orange-500/15 to-transparent',
    ring: 'border-orange-500/25',
    icon: 'text-orange-400',
    glow: 'bg-orange-500/10',
  },
  sky: {
    gradient: 'from-sky-500/15 to-transparent',
    ring: 'border-sky-500/25',
    icon: 'text-sky-400',
    glow: 'bg-sky-500/10',
  },
  emerald: {
    gradient: 'from-emerald-500/15 to-transparent',
    ring: 'border-emerald-500/25',
    icon: 'text-emerald-400',
    glow: 'bg-emerald-500/10',
  },
  violet: {
    gradient: 'from-violet-500/15 to-transparent',
    ring: 'border-violet-500/25',
    icon: 'text-violet-400',
    glow: 'bg-violet-500/10',
  },
} as const;

function BigKPI({
  icon: Icon,
  label,
  value,
  unit,
  decimals,
  accent,
  sublabel,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  unit: string;
  decimals: number;
  accent: keyof typeof accentStyles;
  sublabel?: string;
  trend?: 'up' | 'down' | 'flat' | null;
}) {
  const s = accentStyles[accent];
  const display =
    value === null
      ? '—'
      : decimals === 0
        ? Math.round(value).toString()
        : value.toFixed(decimals);
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-4 border bg-gradient-to-br to-transparent',
        s.gradient,
        s.ring
      )}
    >
      <div className={cn('absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl', s.glow)} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Icon className={cn('h-3.5 w-3.5', s.icon)} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              {label}
            </span>
          </div>
          {trend && trend !== 'flat' && (
            <span
              className={cn(
                'text-[10px] font-bold',
                trend === 'up' ? 'text-emerald-400' : 'text-sky-400'
              )}
            >
              {trend === 'up' ? '↑' : '↓'}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl md:text-4xl font-black text-white tabular-nums">
            {display}
          </span>
          <span className="text-sm text-white/40">{unit}</span>
        </div>
        {sublabel && (
          <div className="text-[11px] text-white/40 mt-1">{sublabel}</div>
        )}
      </div>
    </div>
  );
}

// ---- Health cards ----

function HealthCard({
  title,
  icon: Icon,
  accent,
  main,
  sub,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  main: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn('h-3.5 w-3.5', accent)} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          {title}
        </span>
      </div>
      <div className={cn('text-xl font-bold tabular-nums', accent)}>{main}</div>
      <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>
    </div>
  );
}

// ---- Technical footer ----

function TechFooter({
  station,
  latest,
}: {
  station: PhysicalStation;
  latest: Measurement | undefined;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="h-3.5 w-3.5 text-white/40" />
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          Technische details
        </h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <TechRow label="Device ID" value={station.device_id} mono />
        <TechRow label="DevEUI" value={station.dev_eui} mono />
        <TechRow label="Application" value={station.application_id} mono />
        <TechRow
          label="Hardware"
          value={station.hardware_model || '—'}
        />
        <TechRow
          label="Laatste frame"
          value={latest?.frame_counter?.toString() ?? '—'}
          mono
        />
        <TechRow
          label="Gateways ontvangen"
          value={latest?.gateway_count?.toString() ?? '—'}
        />
        <TechRow
          label="Geïnstalleerd"
          value={
            station.installed_at
              ? new Date(station.installed_at).toLocaleDateString('nl-NL')
              : '—'
          }
        />
        <TechRow
          label="Laatste uplink"
          value={
            station.last_seen_at
              ? new Date(station.last_seen_at).toLocaleString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'
          }
        />
      </div>
    </div>
  );
}

function TechRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-0.5">
        {label}
      </div>
      <div className={cn('text-white/80 truncate', mono && 'font-mono text-[11px]')}>
        {value}
      </div>
    </div>
  );
}

// ---- Small utility formatters ----

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

function daylightLabel(lux: number | null): string {
  if (lux === null) return '—';
  if (lux === 0) return 'Donker';
  if (lux < 100) return 'Schemer';
  if (lux < 1000) return 'Licht bewolkt';
  if (lux < 10_000) return 'Bewolkt';
  return 'Zonnig';
}

function batteryColor(status: 'good' | 'low' | 'critical' | null): string {
  return status === 'critical'
    ? 'text-red-400'
    : status === 'low'
      ? 'text-amber-400'
      : 'text-emerald-400';
}

function batteryMainLabel(status: 'good' | 'low' | 'critical' | null): string {
  if (status === 'critical') return 'Bijna leeg';
  if (status === 'low') return 'Voldoende';
  if (status === 'good') return 'Vol';
  return '—';
}

function batteryAdvice(status: 'good' | 'low' | 'critical' | null): string {
  if (status === 'critical') return 'Vervang accu binnenkort';
  if (status === 'low') return 'Op termijn vervangen';
  return 'Prima';
}

function signalColor(rssi: number | null): string {
  if (rssi === null) return 'text-white/50';
  if (rssi >= -110) return 'text-emerald-400';
  if (rssi >= -120) return 'text-amber-400';
  return 'text-red-400';
}

function signalMainLabel(rssi: number | null): string {
  if (rssi === null) return '—';
  if (rssi >= -100) return 'Zeer goed';
  if (rssi >= -110) return 'Goed';
  if (rssi >= -120) return 'Matig';
  return 'Zwak';
}

function signalDetail(
  rssi: number | null,
  snr: number | null,
  gatewayCount: number | null
): string {
  if (rssi === null) return '—';
  const parts: string[] = [];
  if (gatewayCount && gatewayCount > 0)
    parts.push(`${gatewayCount} gateway${gatewayCount > 1 ? 's' : ''}`);
  parts.push(`${rssi} dBm`);
  if (snr !== null) parts.push(`SNR ${snr.toFixed(1)}`);
  return parts.join(' · ');
}

function pressureTendency(hpa: number | null): string | undefined {
  if (hpa === null) return undefined;
  if (hpa < 1000) return 'Laag — onstabiel weer';
  if (hpa < 1013) return 'Licht verlaagd';
  if (hpa < 1020) return 'Gemiddeld';
  return 'Hoog — stabiel weer';
}

function computeTempTrend(
  measurements: Measurement[]
): 'up' | 'down' | 'flat' | null {
  if (measurements.length < 3) return null;
  const now = measurements[0]?.temperature_c;
  // Take the average of 3 hours ago (roughly 9 readings earlier at 20-min interval)
  const older = measurements
    .slice(8, 11)
    .map(m => m.temperature_c)
    .filter((v): v is number => v != null);
  if (now == null || older.length === 0) return null;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const diff = now - avgOlder;
  if (diff > 1) return 'up';
  if (diff < -1) return 'down';
  return 'flat';
}
