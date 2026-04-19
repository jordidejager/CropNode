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

interface StationWithParcels {
  stationId: string;
  stationName: string | null;
  latitude: number;
  longitude: number;
  parcels: { id: string; name: string; area: number | null }[];
}

export default function ZiektedrukPage() {
  const [parcels, setParcels] = useState<ParcelOption[]>([]);
  const [stations, setStations] = useState<StationWithParcels[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [selectedParcelId, setSelectedParcelId] = useState<string>('');
  const [harvestYear] = useState(getCurrentHarvestYear());
  const [config, setConfig] = useState<DiseaseModelConfig | null>(null);
  const [result, setResult] = useState<ZiektedrukResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedBiofixDate, setSuggestedBiofixDate] = useState<string | null>(null);

  // Load stations + parcels on mount
  useEffect(() => {
    async function loadStations() {
      try {
        const res = await fetch(
          `/api/analytics/ziektedruk/stations?harvest_year=${harvestYear}`
        );
        const json = await res.json();
        if (json.success && json.data.stations) {
          const stationList = json.data.stations as StationWithParcels[];
          setStations(stationList);

          // Flatten parcels for backwards-compat dropdown
          const allParcels = stationList.flatMap((s) =>
            s.parcels.map((p) => ({ id: p.id, name: p.name }))
          );
          setParcels(allParcels);

          // Auto-select first station and its first parcel
          if (stationList.length > 0 && !selectedStationId) {
            const firstStation = stationList[0];
            setSelectedStationId(firstStation.stationId);
            if (firstStation.parcels.length > 0) {
              setSelectedParcelId(firstStation.parcels[0].id);
            }
          }
        }
      } catch {
        // Fallback: load parcels directly if stations endpoint fails
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
      } finally {
        setLoading(false);
      }
    }
    loadStations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load disease data — uses auto-setup: creates config if missing, always returns results
  const loadDiseaseData = useCallback(
    async (parcelId: string) => {
      if (!parcelId) return;
      setCalculating(true);
      setError(null);

      try {
        const res = await fetch('/api/analytics/ziektedruk/auto-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parcel_id: parcelId,
            harvest_year: harvestYear,
            disease_type: 'apple_scab',
          }),
        });

        if (res.status === 401) {
          window.location.reload();
          return;
        }

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

  // Auto-biofix detection: ask the server to compute biofix from winter weather
  useEffect(() => {
    if (!selectedParcelId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/analytics/ziektedruk/auto-biofix?parcel_id=${encodeURIComponent(selectedParcelId)}&harvest_year=${harvestYear}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data?.detected_biofix) {
          setSuggestedBiofixDate(json.data.detected_biofix);
        }
      } catch {
        // Silently fail — suggestion is optional
      }
    })();
    return () => { cancelled = true; };
  }, [selectedParcelId, harvestYear]);

  const handleParcelChange = (id: string) => {
    setSelectedParcelId(id);
    // Sync station selection
    const owningStation = stations.find((s) =>
      s.parcels.some((p) => p.id === id)
    );
    if (owningStation) {
      setSelectedStationId(owningStation.stationId);
    }
    setConfig(null);
    setResult(null);
  };

  const handleStationChange = (stationId: string) => {
    setSelectedStationId(stationId);
    const station = stations.find((s) => s.stationId === stationId);
    if (station && station.parcels.length > 0) {
      // Auto-select first parcel of the new station
      setSelectedParcelId(station.parcels[0].id);
    }
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

      {/* Station selector — only shown if user has multiple stations */}
      {stations.length > 1 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Weerstation
          </label>
          <div className="flex flex-wrap gap-2">
            {stations.map((station) => {
              const isSelected = station.stationId === selectedStationId;
              const parcelNames = station.parcels.map((p) => p.name).join(', ');
              return (
                <button
                  key={station.stationId}
                  onClick={() => handleStationChange(station.stationId)}
                  className={`px-3 py-2 rounded-lg border transition-colors text-left ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <div className="text-sm font-medium">
                    {station.stationName ?? `Station (${station.latitude.toFixed(3)}, ${station.longitude.toFixed(3)})`}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {station.parcels.length} perceel
                    {station.parcels.length !== 1 ? 'en' : ''}: {parcelNames}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Configuration */}
      <BiofixConfig
        parcels={parcels}
        selectedParcelId={selectedParcelId}
        onParcelChange={handleParcelChange}
        harvestYear={harvestYear}
        config={config}
        onSave={handleSaveConfig}
        onRecalculate={async () => {
          await loadDiseaseData(selectedParcelId);
        }}
        suggestedBiofixDate={suggestedBiofixDate}
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
          <SeasonSummary kpis={result.kpis} coverageTimeline={result.coverageTimeline} />

          {/* Season Progress (PAM bar) */}
          <SeasonProgress kpis={result.kpis} />

          {/* Infection Timeline Chart */}
          <InfectionTimeline
            seasonProgress={result.seasonProgress}
            infectionPeriods={result.infectionPeriods}
            coverageTimeline={result.coverageTimeline}
            infectionCoverage={result.infectionCoverage}
            sprayEvents={result.sprayEvents}
          />

          {/* Infection Detail Table */}
          <InfectionTable
            infectionPeriods={result.infectionPeriods}
            infectionCoverage={result.infectionCoverage}
          />
        </>
      )}
    </div>
  );
}
