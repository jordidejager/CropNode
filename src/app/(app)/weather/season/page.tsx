'use client';

import { BarChart3 } from 'lucide-react';

export default function SeasonAnalysisPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="p-4 bg-blue-500/10 rounded-2xl mb-6">
        <BarChart3 className="h-12 w-12 text-blue-400" />
      </div>
      <h1 className="text-2xl font-black text-white mb-2">Seizoensanalyse</h1>
      <p className="text-white/40 text-sm">Komt binnenkort beschikbaar</p>
    </div>
  );
}
