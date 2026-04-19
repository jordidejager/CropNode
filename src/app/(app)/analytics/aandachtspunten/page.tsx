'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, RefreshCw, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Target, MapPin, Sprout, Apple, FileText, CloudSun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignalCard } from '@/components/analytics/aandachtspunten/SignalCard';
import { BenchmarkWidget } from '@/components/analytics/aandachtspunten/BenchmarkWidget';
import type { Signal, BenchmarkSnapshot } from '@/lib/analytics/signals/types';

interface ApiResponse {
  signals: Signal[];
  stats: {
    totalDetected: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    detectorsRun: number;
    detectorsFailed: number;
    dataAvailability: {
      parcels: number;
      subParcels: number;
      soilAnalyses: number;
      productionEntries: number;
      harvestRegistrations: number;
      spuitschriftEntries: number;
    };
  };
  benchmarks: BenchmarkSnapshot[];
  generatedAt: string;
  error?: string;
}

// ============================================================================
// DATA AVAILABILITY CHECK
// ============================================================================

function DataAvailability({ data }: { data: ApiResponse['stats']['dataAvailability'] }) {
  const items = [
    { label: 'Percelen',              value: data.parcels,              icon: MapPin,  min: 1, key: 'parcels' },
    { label: 'Subpercelen',           value: data.subParcels,           icon: Sprout,  min: 1, key: 'subParcels' },
    { label: 'Bespuitingen',          value: data.spuitschriftEntries,  icon: FileText,min: 5, key: 'spuitschrift' },
    { label: 'Oogstregistraties',     value: data.harvestRegistrations, icon: Apple,   min: 1, key: 'harvests' },
    { label: 'Productiegeschiedenis', value: data.productionEntries,    icon: Target,  min: 2, key: 'production' },
    { label: 'Grondmonsters',         value: data.soilAnalyses,         icon: CloudSun,min: 1, key: 'soil' },
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">Beschikbare data</h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Hoe meer data je invoert, hoe scherper de signalering wordt.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => {
          const ok = item.value >= item.min;
          const Icon = item.icon;
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              {ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="size-3.5 text-slate-600 shrink-0" />
              )}
              <Icon className={`size-3 shrink-0 ${ok ? 'text-slate-400' : 'text-slate-600'}`} />
              <span className={ok ? 'text-slate-300' : 'text-slate-600'}>
                {item.label}: <strong>{item.value}</strong>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// SEVERITY GROUPING
// ============================================================================

function SignalGroup({ title, signals, emptyMessage }: {
  title: string;
  signals: Signal[];
  emptyMessage?: string;
}) {
  if (signals.length === 0 && !emptyMessage) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        {title}
        <span className="text-[10px] text-slate-500 bg-white/5 rounded px-1.5 py-0.5">
          {signals.length}
        </span>
      </h2>
      {signals.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AandachtspuntenPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/signals', { cache: 'no-store' });
      const json: ApiResponse = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || 'Fout bij laden');
        if (json.stats) setData(json);
      } else {
        setData(json);
      }
    } catch (err: any) {
      setError(err.message || 'Verbindingsfout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Loading
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-white/5 rounded" />
        <div className="h-24 bg-white/[0.02] rounded-xl border border-white/5" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-white/[0.02] rounded-xl border border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const urgent = (data?.signals || []).filter((s) => s.severity === 'urgent');
  const attention = (data?.signals || []).filter((s) => s.severity === 'attention');
  const explore = (data?.signals || []).filter((s) => s.severity === 'explore');

  const hasNoData = data && data.stats.dataAvailability.subParcels === 0;
  const hasNoSignals = data && data.signals.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="size-5 text-emerald-400" />
            Aandachtspunten
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            CropNode scant je data op anomalieën en signaleert wat je deze week extra aandacht verdient.
          </p>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-200 hover:bg-white/5 shrink-0"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          <span className="ml-1.5 text-xs">Ververs</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-200">{error}</p>
            <p className="text-xs text-slate-400 mt-1">Probeer opnieuw te verversen.</p>
          </div>
        </div>
      )}

      {/* Benchmark widget */}
      {data && data.benchmarks.length > 0 && (
        <BenchmarkWidget benchmarks={data.benchmarks} />
      )}

      {/* No sub-parcels */}
      {hasNoData && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
            <Sprout className="size-8 text-emerald-500/60" />
          </div>
          <h3 className="text-base font-medium text-slate-100 mb-2">Nog geen percelen</h3>
          <p className="text-sm text-slate-400 max-w-md mb-4">
            Voeg percelen toe om aandachtspunten te genereren.
          </p>
          <a
            href="/percelen"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Naar Percelen
          </a>
        </div>
      )}

      {/* Signals in severity groups */}
      {data && !hasNoData && (
        <>
          {urgent.length > 0 && (
            <SignalGroup title="🔴 Urgent" signals={urgent} />
          )}
          {attention.length > 0 && (
            <SignalGroup title="🟠 Let op" signals={attention} />
          )}
          {explore.length > 0 && (
            <SignalGroup title="🟡 Verkennen" signals={explore} />
          )}

          {/* All clear */}
          {hasNoSignals && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex items-start gap-3">
              <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-200">Geen urgente aandachtspunten</p>
                <p className="text-xs text-slate-400 mt-1">
                  Op basis van de huidige data heeft CropNode niets opvallends gevonden. Blijf registreren
                  — zodra er trends of afwijkingen ontstaan worden ze hier gemeld.
                </p>
              </div>
            </div>
          )}

          {/* Data availability */}
          <DataAvailability data={data.stats.dataAvailability} />

          {/* Footer */}
          <p className="text-[10px] text-slate-600 text-center pt-2">
            Laatst bijgewerkt: {new Date(data.generatedAt).toLocaleString('nl-NL')}
            {data.stats.detectorsFailed > 0 && (
              <span className="text-amber-500 ml-2">
                ({data.stats.detectorsFailed} detector{data.stats.detectorsFailed > 1 ? 's' : ''} gefaald)
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
