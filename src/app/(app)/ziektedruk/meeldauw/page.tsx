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

export default function ZwartvruchtrotPage() {
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

  // Load stations + parcels
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

          const allParcels = stationList.flatMap((s) =>
            s.parcels.map((p) => ({ id: p.id, name: p.name }))
          );
          setParcels(allParcels);

          if (stationList.length > 0 && !selectedStationId) {
            const firstStation = stationList[0];
            setSelectedStationId(firstStation.stationId);
            if (firstStation.parcels.length > 0) {
              setSelectedParcelId(firstStation.parcels[0].id);
            }
          }
        }
      } catch {
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
            disease_type: 'powdery_mildew',
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
        setError(err instanceof Error ? err.message : 'Kan data niet ophalen');
      } finally {
        setCalculating(false);
      }
    },
    [harvestYear]
  );

  useEffect(() => {
    if (selectedParcelId) loadDiseaseData(selectedParcelId);
  }, [selectedParcelId, loadDiseaseData]);

  const handleParcelChange = (id: string) => {
    setSelectedParcelId(id);
    const owningStation = stations.find((s) =>
      s.parcels.some((p) => p.id === id)
    );
    if (owningStation) setSelectedStationId(owningStation.stationId);
    setConfig(null);
    setResult(null);
  };

  const handleStationChange = (stationId: string) => {
    setSelectedStationId(stationId);
    const station = stations.find((s) => s.stationId === stationId);
    if (station && station.parcels.length > 0) {
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
      const res = await fetch(
        '/api/analytics/ziektedruk/zwartvruchtrot/config',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parcel_id: selectedParcelId,
            harvest_year: harvestYear,
            biofix_date: biofixDate,
            inoculum_pressure: inoculumPressure,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Kan config niet opslaan');
        return;
      }
      setConfig(json.data.config);
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan config niet opslaan');
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-white/[0.02] rounded-xl border border-white/5" />
        <div className="h-80 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    );
  }

  if (parcels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <h1 className="text-2xl font-black text-white mb-2">Geen percelen</h1>
        <p className="text-white/40 text-sm">
          Voeg eerst percelen toe om meeldauw te analyseren.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ZiektedrukDisclaimer />

      {/* Info banner specific to powdery mildew */}
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <h3 className="text-sm font-semibold text-purple-300 mb-1">
          Meeldauw (Podosphaera leucotricha)
        </h3>
        <p className="text-xs text-purple-200/70">
          Actief vanaf knopuitloop. Gebaseerd op Xu 1999. Let op: water dóódt
          sporen — meeldauw gedijt bij hoge RH zonder regen. Optimaal bij
          19-22°C en RH{'>'}70%. Strenge winters ({'<'}-24°C) reduceren inoculum sterk.
        </p>
      </div>

      {/* Station selector */}
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
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                      : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <div className="text-sm font-medium">
                    {station.stationName ??
                      `Station (${station.latitude.toFixed(3)}, ${station.longitude.toFixed(3)})`}
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

      <BiofixConfig
        parcels={parcels}
        selectedParcelId={selectedParcelId}
        onParcelChange={handleParcelChange}
        harvestYear={harvestYear}
        config={config}
        onSave={handleSaveConfig}
      />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {calculating && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <p className="text-sm text-slate-400 animate-pulse">
            Berekenen van infectieperiodes...
          </p>
        </div>
      )}

      {result && result.configured && (
        <>
          <SeasonSummary kpis={result.kpis} />
          <SeasonProgress kpis={result.kpis} />
          <InfectionTimeline
            seasonProgress={result.seasonProgress}
            infectionPeriods={result.infectionPeriods}
          />
          <InfectionTable infectionPeriods={result.infectionPeriods} />
        </>
      )}
    </div>
  );
}
