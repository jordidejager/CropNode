'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  History, Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight,
  Apple, TrendingUp, TrendingDown, BarChart3, Calendar, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import {
  fetchProductionSummaries,
  upsertProductionSummary,
  deleteProductionSummary,
  type ProductionSummaryRow,
  type ProductionSummaryInput,
} from '@/lib/analytics/production-queries';
import { HistoricalDataForm } from '@/components/analytics/productie/HistoricalDataForm';
import type { AnalyticsSubParcel } from '@/lib/analytics/types';

// ============================================================================
// TYPES
// ============================================================================

interface ParcelYearData {
  [year: number]: ProductionSummaryRow | undefined;
}

interface ParcelGroup {
  subParcel: AnalyticsSubParcel;
  yearData: ParcelYearData;
  avgKgPerHa: number;
  totalEntries: number;
}

interface HoofdPerceelGroup {
  id: string;
  name: string;
  totalHa: number;
  subParcels: ParcelGroup[];
}

// ============================================================================
// HELPER: format number
// ============================================================================

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ============================================================================
// MINI SPARKLINE (inline SVG)
// ============================================================================

function MiniSparkline({ values, color = '#10b981' }: { values: (number | null)[]; color?: string }) {
  const nums = values.filter((v): v is number => v !== null && v > 0);
  if (nums.length < 2) return null;

  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const step = w / (nums.length - 1);

  const points = nums.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');

  return (
    <svg width={w} height={h} className="inline-block ml-2 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================================================
// YEAR CELL — clickable cell in the grid
// ============================================================================

function YearCell({
  entry,
  year,
  subParcel,
  onAdd,
  onEdit,
  onDelete,
}: {
  entry: ProductionSummaryRow | undefined;
  year: number;
  subParcel: AnalyticsSubParcel;
  onAdd: () => void;
  onEdit: (entry: ProductionSummaryRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);

  if (!entry) {
    return (
      <td
        className="py-2 px-2 text-center group cursor-pointer hover:bg-emerald-500/5 transition-colors"
        onClick={onAdd}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="flex items-center justify-center h-8">
          {hover ? (
            <Plus className="size-3.5 text-emerald-500/60" />
          ) : (
            <span className="text-slate-700">—</span>
          )}
        </div>
      </td>
    );
  }

  const kgPerHa = entry.hectares && entry.hectares > 0 ? entry.total_kg / entry.hectares : null;

  return (
    <td
      className="py-2 px-2 text-center relative group hover:bg-white/[0.03] transition-colors"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold text-slate-200">{fmt(entry.total_kg / 1000, 1)}</span>
        <span className="text-[10px] text-slate-500">ton</span>
        {kgPerHa !== null && (
          <span className="text-[9px] text-slate-600">{fmt(kgPerHa, 0)} kg/ha</span>
        )}
      </div>

      {/* Hover actions */}
      {hover && (
        <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(entry)} className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300">
            <Pencil className="size-3" />
          </button>
          <button onClick={() => onDelete(entry.id)} className="p-0.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400">
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </td>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GeschiedenisPage() {
  const currentYear = getCurrentHarvestYear();
    // Grid toont t/m vorig oogstjaar (huidig jaar is nog niet geplukt)
  const lastDisplayYear = currentYear - 1;
  const displayYears = useMemo(() => Array.from({ length: lastDisplayYear - 2016 }, (_, i) => lastDisplayYear - i), [lastDisplayYear]);

  const [summaries, setSummaries] = useState<ProductionSummaryRow[]>([]);
  const [subParcels, setSubParcels] = useState<AnalyticsSubParcel[]>([]);
  const [parcels, setParcels] = useState<{ id: string; name: string; area: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ProductionSummaryRow | null>(null);
  const [prefillYear, setPrefillYear] = useState<number | null>(null);
  const [prefillSubParcel, setPrefillSubParcel] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [summariesData, spRes, pRes] = await Promise.all([
      fetchProductionSummaries(),
      supabase.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').order('name'),
      supabase.from('parcels').select('id, name, area').order('name'),
    ]);

    setSummaries(summariesData);
    setSubParcels((spRes.data || []) as AnalyticsSubParcel[]);
    setParcels((pRes.data || []) as { id: string; name: string; area: number }[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group summaries by hoofdperceel → subpercelen
  const { hoofdPerceelGroups, stats } = useMemo(() => {
    const parcelMap = new Map<string, ParcelGroup>();

    subParcels.forEach((sp) => {
      parcelMap.set(sp.id, {
        subParcel: sp,
        yearData: {},
        avgKgPerHa: 0,
        totalEntries: 0,
      });
    });

    summaries.forEach((s) => {
      if (!s.sub_parcel_id) return;
      const group = parcelMap.get(s.sub_parcel_id);
      if (group) {
        group.yearData[s.harvest_year] = s;
        group.totalEntries++;
      }
    });

    // Calculate avg kg/ha
    parcelMap.forEach((group) => {
      const entries = Object.values(group.yearData).filter((e): e is ProductionSummaryRow => !!e && !!e.hectares && e.hectares > 0);
      if (entries.length > 0) {
        group.avgKgPerHa = entries.reduce((sum, e) => sum + e.total_kg / e.hectares!, 0) / entries.length;
      }
    });

    // Group by hoofdperceel NAME (not ID) — multiple parcels can share a name
    const hoofdMap = new Map<string, HoofdPerceelGroup>();

    parcelMap.forEach((group) => {
      const hoofdId = group.subParcel.parcel_id || 'onbekend';
      const hoofdPerceel = parcels.find((p) => p.id === hoofdId);
      const naam = hoofdPerceel?.name || 'Onbekend perceel';

      if (!hoofdMap.has(naam)) {
        hoofdMap.set(naam, {
          id: hoofdId,
          name: naam,
          totalHa: 0,
          subParcels: [],
        });
      }
      const hg = hoofdMap.get(naam)!;
      hg.subParcels.push(group);
      hg.totalHa += group.subParcel.area || 0;
    });

    // Sort sub-parcels within each hoofdperceel
    hoofdMap.forEach((hg) => hg.subParcels.sort((a, b) => a.subParcel.name.localeCompare(b.subParcel.name)));

    // Sort hoofdpercelen by name
    const sorted = [...hoofdMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    // Stats
    const totalEntries = summaries.filter((s) => s.sub_parcel_id).length;
    const yearsWithData = [...new Set(summaries.map((s) => s.harvest_year))].length;
    const parcelsWithData = [...new Set(summaries.filter((s) => s.sub_parcel_id).map((s) => s.sub_parcel_id))].length;

    return {
      hoofdPerceelGroups: sorted,
      stats: { totalEntries, yearsWithData, parcelsWithData, totalParcels: subParcels.length },
    };
  }, [summaries, subParcels, parcels]);

  // Existing years with data
  const existingYears = useMemo(
    () => [...new Set(summaries.map((s) => s.harvest_year))],
    [summaries]
  );

  const handleAdd = (year?: number, subParcelId?: string) => {
    setEditingEntry(null);
    setPrefillYear(year || null);
    setPrefillSubParcel(subParcelId || null);
    setFormOpen(true);
  };

  const handleEdit = (entry: ProductionSummaryRow) => {
    setEditingEntry(entry);
    setPrefillYear(null);
    setPrefillSubParcel(null);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    await deleteProductionSummary(id);
    setConfirmDelete(null);
    await loadData();
  };

  const handleSubmit = async (input: ProductionSummaryInput) => {
    await upsertProductionSummary(input);
    await loadData();
  };

  const toggleCrop = (crop: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(crop)) next.delete(crop);
      else next.add(crop);
      return next;
    });
  };

  // Auto-expand all on first load
  useEffect(() => {
    if (hoofdPerceelGroups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(hoofdPerceelGroups.map((h) => h.name)));
    }
  }, [hoofdPerceelGroups, expandedGroups.size]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-white/5 rounded" />
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 flex-1 bg-white/[0.02] rounded-xl border border-white/5" />)}
        </div>
        <div className="h-96 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <History className="size-5 text-emerald-400" />
            Productiegeschiedenis
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Voer productiecijfers in per perceel per oogstjaar — klik op een lege cel om data toe te voegen
          </p>
        </div>
        <Button
          onClick={() => handleAdd()}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          <Plus className="size-4 mr-1.5" /> Toevoegen
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 min-w-[130px]">
          <div className="flex items-center gap-1.5"><BarChart3 className="size-3.5 text-emerald-400" /><span className="text-[10px] font-semibold text-slate-500 uppercase">Registraties</span></div>
          <span className="text-lg font-semibold text-slate-100">{stats.totalEntries}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 min-w-[130px]">
          <div className="flex items-center gap-1.5"><Calendar className="size-3.5 text-blue-400" /><span className="text-[10px] font-semibold text-slate-500 uppercase">Oogstjaren</span></div>
          <span className="text-lg font-semibold text-slate-100">{stats.yearsWithData}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 min-w-[130px]">
          <div className="flex items-center gap-1.5"><Apple className="size-3.5 text-amber-400" /><span className="text-[10px] font-semibold text-slate-500 uppercase">Percelen</span></div>
          <span className="text-lg font-semibold text-slate-100">{stats.parcelsWithData} <span className="text-sm font-normal text-slate-500">/ {stats.totalParcels}</span></span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-3 min-w-[130px]">
          <div className="flex items-center gap-1.5"><TrendingUp className="size-3.5 text-purple-400" /><span className="text-[10px] font-semibold text-slate-500 uppercase">Dekking</span></div>
          <span className="text-lg font-semibold text-slate-100">{stats.totalParcels > 0 ? Math.round((stats.parcelsWithData / stats.totalParcels) * 100) : 0}%</span>
        </div>
      </div>

      {/* Production Grid per Hoofdperceel */}
      {hoofdPerceelGroups.map((hoofd) => (
        <div key={hoofd.name} className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
          {/* Hoofdperceel Header */}
          <button
            onClick={() => toggleCrop(hoofd.name)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors border-b border-white/5"
          >
            {expandedGroups.has(hoofd.name) ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
            <MapPin className="size-4 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-200">{hoofd.name}</span>
            <span className="text-xs text-slate-500 ml-1">{hoofd.totalHa.toFixed(2)} ha · {hoofd.subParcels.length} {hoofd.subParcels.length === 1 ? 'blok' : 'blokken'}</span>
          </button>

          {/* Grid */}
          {expandedGroups.has(hoofd.name) && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-wider sticky left-0 bg-[#020617] z-10 min-w-[180px]">Subperceel</th>
                    <th className="text-right py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider w-14">Ha</th>
                    {displayYears.map((y) => (
                      <th key={y} className="text-center py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider min-w-[80px]">
                        {y}
                      </th>
                    ))}
                    <th className="text-center py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider min-w-[80px]">Gem.</th>
                    <th className="text-center py-2 px-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider w-20">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {hoofd.subParcels.map((group) => {
                    const yearValues = displayYears.map((y) => {
                      const e = group.yearData[y];
                      return e && e.hectares && e.hectares > 0 ? e.total_kg / e.hectares : null;
                    });

                    return (
                      <tr key={group.subParcel.id} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                        {/* Sub-parcel name (sticky) */}
                        <td className="py-2 px-3 sticky left-0 bg-[#020617] z-10">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-200 truncate max-w-[170px]">{group.subParcel.name}</span>
                            <span className="text-[10px] text-slate-600">{group.subParcel.crop} · {group.subParcel.variety}</span>
                          </div>
                        </td>

                        {/* Hectares */}
                        <td className="py-2 px-2 text-right text-xs text-slate-500">{group.subParcel.area.toFixed(2)}</td>

                        {/* Year cells */}
                        {displayYears.map((y) => (
                          <YearCell
                            key={y}
                            entry={group.yearData[y]}
                            year={y}
                            subParcel={group.subParcel}
                            onAdd={() => handleAdd(y, group.subParcel.id)}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        ))}

                        {/* Average */}
                        <td className="py-2 px-2 text-center">
                          {group.avgKgPerHa > 0 ? (
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-semibold text-emerald-400">{fmt(group.avgKgPerHa / 1000, 1)}</span>
                              <span className="text-[9px] text-slate-600">ton/ha</span>
                            </div>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>

                        {/* Trend sparkline */}
                        <td className="py-2 px-2 text-center">
                          <MiniSparkline values={yearValues} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Empty state if no sub-parcels */}
      {subParcels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
            <Apple className="size-8 text-emerald-500/60" />
          </div>
          <h3 className="text-base font-medium text-slate-100 mb-2">Geen percelen gevonden</h3>
          <p className="text-sm text-slate-400 max-w-md mb-4">
            Voeg eerst percelen toe om productiegeschiedenis bij te houden.
          </p>
          <a href="/percelen" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
            Naar Percelen
          </a>
        </div>
      )}

      {/* Hint */}
      {subParcels.length > 0 && stats.totalEntries === 0 && (
        <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 flex items-start gap-3">
          <TrendingUp className="size-5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Tip: vul je productiegeschiedenis aan</p>
            <p className="text-xs text-slate-400 mt-1">
              Klik op een lege cel in het grid om direct een productiecijfer toe te voegen.
              Hoe meer jaren je invult, hoe beter de trendanalyse in Analytics werkt.
            </p>
          </div>
        </div>
      )}

      {/* Form dialog — reuse existing HistoricalDataForm */}
      <HistoricalDataForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) { setEditingEntry(null); setPrefillYear(null); setPrefillSubParcel(null); } }}
        onSubmit={handleSubmit}
        subParcels={subParcels}
        parcels={parcels}
        existingYears={existingYears}
        editingEntry={editingEntry || (prefillYear || prefillSubParcel ? {
          harvest_year: prefillYear || currentYear,
          sub_parcel_id: prefillSubParcel || '',
        } : undefined)}
      />
    </div>
  );
}
