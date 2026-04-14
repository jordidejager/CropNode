'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const CalendarPage = dynamic(
  () => import('@/components/calendar/CalendarPage').then(mod => mod.CalendarPage),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    ),
  }
);

export default function KalenderPage() {
  return <CalendarPage />;
}
