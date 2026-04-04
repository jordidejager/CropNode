'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AnalyticsHero } from '@/components/analytics/AnalyticsHero';
import { AnalyticsFilterBar } from '@/components/analytics/AnalyticsFilterBar';

// Lazy-load chart-heavy components (Recharts) — only loaded when data is ready
const SeasonDashboard = dynamic(() => import('@/components/analytics/SeasonDashboard').then(m => ({ default: m.SeasonDashboard })), { ssr: false });
const CropProtectionAnalysis = dynamic(() => import('@/components/analytics/CropProtectionAnalysis').then(m => ({ default: m.CropProtectionAnalysis })), { ssr: false });
const FertilizerAnalysis = dynamic(() => import('@/components/analytics/FertilizerAnalysis').then(m => ({ default: m.FertilizerAnalysis })), { ssr: false });
const HarvestYieldAnalysis = dynamic(() => import('@/components/analytics/HarvestYieldAnalysis').then(m => ({ default: m.HarvestYieldAnalysis })), { ssr: false });
const ParcelComparison = dynamic(() => import('@/components/analytics/ParcelComparison').then(m => ({ default: m.ParcelComparison })), { ssr: false });
const WeatherImpact = dynamic(() => import('@/components/analytics/WeatherImpact').then(m => ({ default: m.WeatherImpact })), { ssr: false });
const ReportsExport = dynamic(() => import('@/components/analytics/ReportsExport').then(m => ({ default: m.ReportsExport })), { ssr: false });
import { getCurrentHarvestYear } from '@/lib/analytics/harvest-year-utils';
import { fetchAnalyticsData, fetchAvailableHarvestYears, fetchWeatherData } from '@/lib/analytics/queries';
import { calculateKPIComparison } from '@/lib/analytics/calculations';
import type { AnalyticsData, AnalyticsFilters, KPIComparison } from '@/lib/analytics/types';

function SectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-48 bg-white/5 rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-white/[0.02] rounded-xl border border-white/5" />
        <div className="h-64 bg-white/[0.02] rounded-xl border border-white/5" />
      </div>
    </div>
  );
}


export default function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    harvestYear: getCurrentHarvestYear(),
    parcelIds: [],
  });

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [weatherData, setWeatherData] = useState<any[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch available years once
  useEffect(() => {
    fetchAvailableHarvestYears().then((years) => {
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(filters.harvestYear)) {
        setFilters((prev) => ({ ...prev, harvestYear: years[0] }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data when filters change
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAnalyticsData(filters),
      fetchWeatherData(filters.harvestYear),
    ]).then(([analyticsData, weather]) => {
      setData(analyticsData);
      setWeatherData(weather);
      setLoading(false);
    }).catch((err) => {
      console.error('Analytics fetch error:', err);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.harvestYear, filters.parcelIds.join(','), filters.dateRange?.start?.getTime(), filters.dateRange?.end?.getTime()]);

  const kpiComparison = useMemo<KPIComparison | null>(() => {
    if (!data) return null;
    return calculateKPIComparison(data);
  }, [data]);

  return (
    <div className="flex flex-col gap-0 -m-4 md:-m-6">
      {/* Hero */}
      <div className="px-4 md:px-6 pt-4 md:pt-6">
        <AnalyticsHero kpiComparison={kpiComparison} harvestYear={filters.harvestYear} />
      </div>

      {/* Filter Bar */}
      <div className="px-4 md:px-6">
        <AnalyticsFilterBar filters={filters} onFiltersChange={setFilters} availableYears={availableYears} parcels={data?.parcels || []} />
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-4 md:px-6 space-y-8">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      )}

      {/* Content Sections */}
      {!loading && data && (
        <div className="px-4 md:px-6 pb-8 space-y-12">
          {kpiComparison && <SeasonDashboard data={data} kpiComparison={kpiComparison} />}

          <CropProtectionAnalysis data={data} />
          <FertilizerAnalysis data={data} />
          <HarvestYieldAnalysis data={data} />
          <ParcelComparison data={data} />
          <WeatherImpact data={data} weatherData={weatherData} />
          <ReportsExport data={data} harvestYear={filters.harvestYear} />
        </div>
      )}
    </div>
  );
}
