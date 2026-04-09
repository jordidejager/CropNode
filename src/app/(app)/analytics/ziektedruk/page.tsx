'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import { ZiektedrukDisclaimer } from '@/components/analytics/ziektedruk/ZiektedrukDisclaimer';
import { BiofixConfig } from '@/components/analytics/ziektedruk/BiofixConfig';
import type {
  DiseaseModelConfig,
  InoculumPressure,
  ZiektedrukResult,
} from '@/lib/disease-models/types';

// Lazy-load chart-heavy components
const SeasonProgress = dynamic(
  () =>
    import('@/components/analytics/ziektedruk/SeasonProgress').then((m) => ({
      default: m.SeasonProgress,
    })),
  { ssr: false }
);
const SeasonSummary = dynamic(
  () =>
    import('@/components/analytics/ziektedruk/SeasonSummary').then((m) => ({
      default: m.SeasonSummary,
    })),
  { ssr: false }
);
const InfectionTimeline = dynamic(
  () =>
    import('@/components/analytics/ziektedruk/InfectionTimeline').then(
      (m) => ({ default: m.InfectionTimeline })
    ),
  { ssr: false }
);
const InfectionTable = dynamic(
  () =>
    import('@/components/analytics/ziektedruk/InfectionTable').then((m) => ({
      default: m.InfectionTable,
    })),
  { ssr: false }
);

interface ParcelOption {
  id: string;
  name: string;
}

export default function ZiektedrukPage() {
  const [parcels, setParcels] = useState<ParcelOption[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<string>('');
  const [harvestYear] = useState(getCurrentHarvestYear());
  const [config, setConfig] = useState<DiseaseModelConfig | null>(null);
  const [result, setResult] = useState<ZiektedrukResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load parcels on mount
  useEffect(() => {
    async function loadParcels() {
      const supabase = createClient();
      const { data } = await supabase
        .from('parcels')
        .select('id, name')
        .order('name');

      const parcelList = (data ?? []) as ParcelOption[];
      setParcels(parcelList);

      if (parcelList.length > 0 && !selectedParcelId) {
        setSelectedParcelId(parcelList[0].id);
      }
      setLoading(false);
    }
    loadParcels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load disease data when parcel changes
  const loadDiseaseData = useCallback(
    async (parcelId: string, force = false) => {
      if (!parcelId) return;
      setCalculating(true);
      setError(null);

      try {
        const forceParam = force ? '&force=1' : '';
        const res = await fetch(
          `/api/analytics/ziektedruk?parcel_id=${encodeURIComponent(parcelId)}&harvest_year=${harvestYear}${forceParam}`
        );
        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? 'Er ging iets mis');
          setConfig(null);
          setResult(null);
          return;
        }

        if (json.data.configured) {
          setConfig(json.data.config);
          setResult(json.data);
        } else {
          setConfig(null);
          setResult(null);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Kan data niet ophalen'
        );
      } finally {
        setCalculating(false);
      }
    },
    [harvestYear]
  );

  useEffect(() => {
    if (selectedParcelId) {
      loadDiseaseData(selectedParcelId);
    }
  }, [selectedParcelId, loadDiseaseData]);

  const handleParcelChange = (id: string) => {
    setSelectedParcelId(id);
    setConfig(null);
    setResult(null);
  };

  const handleSaveConfig = async (
    biofixDate: string,
    inoculumPressure: InoculumPressure
  ) => {
    setCalculating(true);
    setError(null);

    try {
      const res = await fetch('/api/analytics/ziektedruk/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcel_id: selectedParcelId,
          harvest_year: harvestYear,
          biofix_date: biofixDate,
          inoculum_pressure: inoculumPressure,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'Kan configuratie niet opslaan');
        return;
      }

      setConfig(json.data.config);
      setResult(json.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Kan configuratie niet opslaan'
      );
    } finally {
      setCalculating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-white/5 rounded" />
        <div className="h-32 bg-white/[0.02] rounded-xl border border-white/5" />
        <div className="flex gap-3">
          <div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />
          <div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />
          <div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />
          <div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />
        </div>
        <div className="h-80 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    );
  }

  // No parcels
  if (parcels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <div className="p-4 bg-emerald-500/10 rounded-2xl mb-6">
          <svg className="h-12 w-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Geen percelen</h1>
        <p className="text-white/40 text-sm">
          Voeg eerst percelen toe om ziektedruk te analyseren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <ZiektedrukDisclaimer />

      {/* Configuration */}
      <BiofixConfig
        parcels={parcels}
        selectedParcelId={selectedParcelId}
        onParcelChange={handleParcelChange}
        harvestYear={harvestYear}
        config={config}
        onSave={handleSaveConfig}
        onRecalculate={async () => {
          await loadDiseaseData(selectedParcelId, true);
        }}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Calculating indicator */}
      {calculating && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <div className="size-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-emerald-300">
            Infectiemodel berekenen op basis van weerdata...
          </p>
        </div>
      )}

      {/* Results */}
      {result && !calculating && (
        <>
          {/* Season Summary KPIs */}
          <SeasonSummary kpis={result.kpis} />

          {/* Season Progress (PAM bar) */}
          <SeasonProgress kpis={result.kpis} />

          {/* Infection Timeline Chart */}
          <InfectionTimeline
            seasonProgress={result.seasonProgress}
            infectionPeriods={result.infectionPeriods}
          />

          {/* Infection Detail Table */}
          <InfectionTable infectionPeriods={result.infectionPeriods} />
        </>
      )}
    </div>
  );
}
