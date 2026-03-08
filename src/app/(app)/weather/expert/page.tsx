'use client';

import { Suspense } from 'react';
import { ExpertForecast } from '@/components/weather/expert/ExpertForecast';
import { Skeleton } from '@/components/ui/data-states';

function ExpertPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[300px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default function ExpertForecastPage() {
  return (
    <div className="max-w-4xl mx-auto w-full">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white">
          Expert Forecast
        </h1>
      </div>

      <Suspense fallback={<ExpertPageSkeleton />}>
        <ExpertForecast />
      </Suspense>
    </div>
  );
}
