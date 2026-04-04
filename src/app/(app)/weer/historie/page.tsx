import { Suspense } from 'react';
import { HistorieOverview } from '@/components/weather/historie/HistorieOverview';
import { WeatherDashboardSkeleton } from '@/components/weather/WeatherDashboardSkeleton';

export default function HistoriePage() {
  return (
    <div className="max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white">
          Weerhistorie (KNMI)
        </h1>
      </div>
      <Suspense fallback={<WeatherDashboardSkeleton />}>
        <HistorieOverview />
      </Suspense>
    </div>
  );
}
