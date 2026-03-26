'use client';

import { RotateCcw } from 'lucide-react';
import { formatHarvestYear, getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import type { AnalyticsFilters, AnalyticsParcel } from '@/lib/analytics/types';

interface AnalyticsFilterBarProps {
  filters: AnalyticsFilters;
  onFiltersChange: (filters: AnalyticsFilters) => void;
  availableYears: number[];
  parcels: AnalyticsParcel[];
}

export function AnalyticsFilterBar({ filters, onFiltersChange, availableYears, parcels }: AnalyticsFilterBarProps) {
  const handleYearChange = (year: number) => onFiltersChange({ ...filters, harvestYear: year });

  const handleParcelToggle = (parcelId: string) => {
    const current = filters.parcelIds;
    const updated = current.includes(parcelId) ? current.filter((id) => id !== parcelId) : [...current, parcelId];
    onFiltersChange({ ...filters, parcelIds: updated });
  };

  const handleReset = () => onFiltersChange({ harvestYear: getCurrentHarvestYear(), parcelIds: [], dateRange: undefined });

  const yearsToShow = availableYears.length > 0 ? availableYears : [getCurrentHarvestYear()];
  const hasActiveFilters = filters.parcelIds.length > 0 || filters.dateRange !== undefined;

  return (
    <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#020617]/95 backdrop-blur-md px-4 py-3 mb-6">
      {/* Harvest Year Selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 whitespace-nowrap font-semibold uppercase tracking-wider">Oogstjaar</label>
        <select
          value={filters.harvestYear}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        >
          {yearsToShow.map((year) => (
            <option key={year} value={year}>{formatHarvestYear(year)}</option>
          ))}
        </select>
      </div>

      {/* Parcel Filter */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 whitespace-nowrap font-semibold uppercase tracking-wider">Percelen</label>
        <div className="flex flex-wrap gap-1.5">
          {parcels.length > 0 ? (
            <>
              {parcels.slice(0, 6).map((parcel) => {
                const isActive = filters.parcelIds.length === 0 || filters.parcelIds.includes(parcel.id);
                return (
                  <button
                    key={parcel.id}
                    onClick={() => handleParcelToggle(parcel.id)}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      filters.parcelIds.length === 0
                        ? 'bg-white/5 text-slate-400 hover:bg-white/10'
                        : isActive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-600 hover:bg-white/10'
                    }`}
                  >
                    {parcel.name}
                  </button>
                );
              })}
              {parcels.length > 6 && <span className="text-xs text-slate-600 self-center">+{parcels.length - 6}</span>}
            </>
          ) : (
            <span className="text-xs text-slate-600">Alle percelen</span>
          )}
        </div>
      </div>

      {/* Date Range (optional) */}
      <div className="flex items-center gap-2 ml-auto">
        <input
          type="date"
          value={filters.dateRange?.start?.toISOString().split('T')[0] || ''}
          onChange={(e) => {
            if (e.target.value) {
              onFiltersChange({ ...filters, dateRange: { start: new Date(e.target.value), end: filters.dateRange?.end || new Date() } });
            } else {
              onFiltersChange({ ...filters, dateRange: undefined });
            }
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 w-28"
        />
        <span className="text-xs text-slate-600">–</span>
        <input
          type="date"
          value={filters.dateRange?.end?.toISOString().split('T')[0] || ''}
          onChange={(e) => {
            if (e.target.value && filters.dateRange?.start) {
              onFiltersChange({ ...filters, dateRange: { start: filters.dateRange.start, end: new Date(e.target.value) } });
            }
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 w-28"
        />
      </div>

      {hasActiveFilters && (
        <button onClick={handleReset} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-white/5 transition-colors">
          <RotateCcw className="size-3" /> Reset
        </button>
      )}
    </div>
  );
}
