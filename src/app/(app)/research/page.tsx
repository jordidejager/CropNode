import { Suspense } from "react";
import { ResearchDashboardClient } from "./client-page";

function ResearchSkeleton() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            <div className="h-8 bg-white/5 rounded w-48" />
            <div className="grid grid-cols-3 gap-4">
                <div className="h-32 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
            </div>
        </div>
    );
}

export default function ResearchPage() {
    return (
        <Suspense fallback={<ResearchSkeleton />}>
            <ResearchDashboardClient />
        </Suspense>
    );
}
