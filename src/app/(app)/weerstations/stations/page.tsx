import { Suspense } from 'react';
import { WeerstationsHub } from '@/components/weerstations/WeerstationsHub';

export const metadata = {
  title: 'Stations · CropNode',
  description: 'Beheer je eigen LoRaWAN weerstations',
};

export default function WeerstationsStationsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-48 bg-white/5 rounded animate-pulse" />
          <div className="h-48 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <WeerstationsHub />
    </Suspense>
  );
}
