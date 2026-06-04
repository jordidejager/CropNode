import { Suspense } from 'react';
import { SensorOverview } from '@/components/weerstations/SensorOverview';

export const metadata = {
  title: 'Sensor-overzicht · CropNode',
  description: 'Alle meetwaarden van je sensoren bij elkaar',
};

export default function WeerstationsOverzichtPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-56 bg-white/5 rounded animate-pulse" />
          <div className="h-40 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <SensorOverview />
    </Suspense>
  );
}
