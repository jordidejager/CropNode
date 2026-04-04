import { CloudSun } from 'lucide-react';

export default function DiseasePressurePage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="p-4 bg-amber-500/10 rounded-2xl mb-6">
        <CloudSun className="h-12 w-12 text-amber-400" />
      </div>
      <h1 className="text-2xl font-black text-white mb-2">Ziektedruk</h1>
      <p className="text-white/40 text-sm">Komt binnenkort beschikbaar</p>
    </div>
  );
}
