import { getParcelHistoryEntries } from '@/lib/store';
import { parcels } from '@/lib/data';
import { HistoryDashboard } from '@/components/history-dashboard';

export const dynamic = 'force-dynamic';

export default function PerceelHistoriePage() {
  const historyEntries = getParcelHistoryEntries();
  const cropVarieties = [...new Set(parcels.map(p => p.variety))];
  const parcelNames = [...new Set(parcels.map(p => p.name))];

  return (
     <HistoryDashboard 
        entries={historyEntries}
        initialVarieties={cropVarieties}
        initialParcels={parcelNames}
      />
  );
}
