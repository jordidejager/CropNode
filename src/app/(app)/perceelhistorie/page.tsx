import { getParcelHistoryEntries } from '@/lib/store';
import { parcels } from '@/lib/data';
import { HistoryDashboard } from '@/components/history-dashboard';

export const dynamic = 'force-dynamic';

export default function PerceelHistoriePage() {
  const historyEntries = getParcelHistoryEntries();
  const cropVarieties = [...new Set(parcels.map(p => p.variety))];
  const parcelNames = [...new Set(parcels.map(p => p.name))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Perceelhistorie</h1>
        <p className="text-muted-foreground">Interactief dashboard met filters om je spuithistorie te analyseren.</p>
      </div>
      <HistoryDashboard 
        entries={historyEntries}
        initialVarieties={cropVarieties}
        initialParcels={parcelNames}
      />
    </div>
  );
}
