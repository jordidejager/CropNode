'use client';

import { Skeleton } from '@/components/ui/data-states';

export function WeatherDashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Station selector placeholder */}
      <Skeleton className="h-10 w-48" />

      {/* Spray window indicator */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
        <div className="text-center mb-5">
          <Skeleton className="h-8 w-64 mx-auto mb-2" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Today summary */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>

      {/* 48-hour strip */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-[52px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>

      {/* Buienradar + Upcoming spray windows (side by side on desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <Skeleton className="h-[100px] w-full" />
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* 7-day forecast */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
