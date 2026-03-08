'use client';

import { Suspense } from 'react';
import { WeatherDashboard } from '@/components/weather/WeatherDashboard';
import { WeatherDashboardSkeleton } from '@/components/weather/WeatherDashboardSkeleton';

export default function WeatherDashboardPage() {
  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white">
          Weather Dashboard
        </h1>
      </div>

      <Suspense fallback={<WeatherDashboardSkeleton />}>
        <WeatherDashboard />
      </Suspense>
    </div>
  );
}
