import { Suspense } from "react";
import { ResearchDashboardClient } from "../client-page-signals";

function PapersSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-8 bg-white/5 rounded w-48" />
            <div className="grid grid-cols-3 gap-4">
                <div className="h-32 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
            </div>
        </div>
    );
}

export default function PapersPage() {
    return (
        <Suspense fallback={<PapersSkeleton />}>
            <ResearchDashboardClient forcedTab="papers" />
        </Suspense>
    );
}
