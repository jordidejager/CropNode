import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardClient } from './dashboard-client';

function DashboardSkeleton() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-8">
            <div className="space-y-2">
                <Skeleton className="h-9 w-72" />
                <Skeleton className="h-5 w-56" />
            </div>
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-2.5">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
            </div>
        </div>
    );
}

export default function CommandCenterPage() {
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <DashboardClient />
        </Suspense>
    );
}
