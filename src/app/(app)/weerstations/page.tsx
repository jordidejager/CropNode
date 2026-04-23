import { Suspense } from 'react';
import { WeerstationsHub } from '@/components/weerstations/WeerstationsHub';

export const metadata = {
  title: 'Weerstations · CropNode',
  description: 'Live data van je eigen LoRaWAN weerstations',
};

export default function WeerstationsPage() {
  return (
    <div className="max-w-5xl mx-auto w-full px-2 md:px-0">
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
    </div>
  );
}
