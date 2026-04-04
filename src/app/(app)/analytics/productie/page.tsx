'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ProductieHeader } from '@/components/analytics/productie/ProductieHeader';
import { ProductieKPIs } from '@/components/analytics/productie/ProductieKPIs';

// Lazy-load chart components
const YearTrendChart = dynamic(() => import('@/components/analytics/productie/YearTrendChart').then(m => ({ default: m.YearTrendChart })), { ssr: false });
const VarietyBreakdownChart = dynamic(() => import('@/components/analytics/productie/VarietyBreakdownChart').then(m => ({ default: m.VarietyBreakdownChart })), { ssr: false });
const ParcelProductionChart = dynamic(() => import('@/components/analytics/productie/ParcelProductionChart').then(m => ({ default: m.ParcelProductionChart })), { ssr: false });
const VarietyRankingChart = dynamic(() => import('@/components/analytics/productie/VarietyRankingChart').then(m => ({ default: m.VarietyRankingChart })), { ssr: false });
const HistoricalDataForm = dynamic(() => import('@/components/analytics/productie/HistoricalDataForm').then(m => ({ default: m.HistoricalDataForm })), { ssr: false });
const ProductionDataTable = dynamic(() => import('@/components/analytics/productie/ProductionDataTable').then(m => ({ default: m.ProductionDataTable })), { ssr: false });
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import { fetchAvailableHarvestYears } from '@/lib/analytics/queries';
import {
  fetchProductionSummaries,
  fetchMultiYearHarvests,
  upsertProductionSummary,
  deleteProductionSummary,
  type ProductionSummaryRow,
  type ProductionSummaryInput,
} from '@/lib/analytics/production-queries';
import {
  buildYearlyProduction,
  calculateYearTrends,
  calculateVarietyByYear,
  calculateParcelProduction,
  calculateVarietyRanking,
  calculateProductionKPIs,
} from '@/lib/analytics/production-calculations';
import type { AnalyticsHarvest, AnalyticsSubParcel } from '@/lib/analytics/types';
import { createClient } from '@/lib/supabase/client';

export default function ProductiePage() {
  const currentYear = getCurrentHarvestYear();

  const [summaries, setSummaries] = useState<ProductionSummaryRow[]>([]);
  const [harvests, setHarvests] = useState<AnalyticsHarvest[]>([]);
  const [subParcels, setSubParcels] = useState<AnalyticsSubParcel[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [perHectare, setPerHectare] = useState(false);
  const [parcelYear, setParcelYear] = useState(currentYear);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ProductionSummaryRow | null>(null);

  // Fetch all data
  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [summariesData, yearsData, subParcelsRes] = await Promise.all([
      fetchProductionSummaries(),
      fetchAvailableHarvestYears(),
      supabase.from('sub_parcels').select('id, parcel_id, name, crop, variety, area').order('name'),
    ]);

    const sps = (subParcelsRes.data || []) as AnalyticsSubParcel[];
    setSummaries(summariesData);
    setSubParcels(sps);

    // Determine all years to fetch harvests for
    const summaryYears = [...new Set(summariesData.map((s) => s.harvest_year))];
    const allYears = [...new Set([...yearsData, ...summaryYears, currentYear])].sort((a, b) => b - a);
    setAvailableYears(allYears);

    // Fetch harvests for all years with data
    if (yearsData.length > 0) {
      const harvestData = await fetchMultiYearHarvests(yearsData);
      setHarvests(harvestData as AnalyticsHarvest[]);
    }

    setLoading(false);
  }, [currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build unified production data
  const yearlyData = useMemo(
    () => buildYearlyProduction(summaries, harvests, subParcels),
    [summaries, harvests, subParcels]
  );

  const yearTrends = useMemo(() => calculateYearTrends(yearlyData), [yearlyData]);
  const { data: varietyData, varieties } = useMemo(() => calculateVarietyByYear(yearlyData), [yearlyData]);
  const parcelData = useMemo(() => calculateParcelProduction(yearlyData, parcelYear, perHectare), [yearlyData, parcelYear, perHectare]);
  const varietyRanking = useMemo(() => calculateVarietyRanking(yearlyData, perHectare), [yearlyData, perHectare]);

  const kpis = useMemo(
    () => calculateProductionKPIs(yearlyData, currentYear, currentYear - 1),
    [yearlyData, currentYear]
  );

  // Existing years with data (for form indicator)
  const existingYears = useMemo(
    () => [...new Set([...summaries.map((s) => s.harvest_year), ...harvests.map((h) => h.harvest_year)])],
    [summaries, harvests]
  );

  const handleSubmit = async (input: ProductionSummaryInput) => {
    const result = await upsertProductionSummary(input);
    if (result.success) {
      await loadData(); // refresh
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteProductionSummary(id);
    if (result.success) {
      await loadData();
    }
  };

  const handleEdit = (entry: ProductionSummaryRow) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-white/5 rounded" />
        <div className="flex gap-3"><div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" /><div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" /><div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" /><div className="h-24 flex-1 bg-white/[0.02] rounded-xl border border-white/5" /></div>
        <div className="h-80 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <ProductieHeader
        onAddHistorical={() => { setEditingEntry(null); setFormOpen(true); }}
        perHectare={perHectare}
        onTogglePerHectare={() => setPerHectare((p) => !p)}
      />

      {/* KPIs */}
      <ProductieKPIs
        totalTon={kpis.totalTon}
        prevTotalTon={kpis.prevTotalTon}
        avgKgPerHa={kpis.avgKgPerHa}
        prevAvgKgPerHa={kpis.prevAvgKgPerHa}
        varietyCount={kpis.varietyCount}
        bestVariety={kpis.bestVariety}
        bestKgHa={kpis.bestKgHa}
      />

      {/* Year trend chart — full width */}
      <YearTrendChart data={yearTrends} perHectare={perHectare} />

      {/* Variety + Parcel charts — 2 col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VarietyBreakdownChart data={varietyData} varieties={varieties} perHectare={perHectare} />
        <VarietyRankingChart data={varietyRanking} perHectare={perHectare} />
      </div>

      {/* Parcel production — full width */}
      <ParcelProductionChart
        data={parcelData}
        year={parcelYear}
        availableYears={availableYears.length > 0 ? availableYears : [currentYear]}
        onYearChange={setParcelYear}
        perHectare={perHectare}
      />

      {/* Data table */}
      <ProductionDataTable
        data={summaries}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Form dialog */}
      <HistoricalDataForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingEntry(null); }}
        onSubmit={handleSubmit}
        subParcels={subParcels}
        existingYears={existingYears}
        editingEntry={editingEntry}
      />
    </div>
  );
}
