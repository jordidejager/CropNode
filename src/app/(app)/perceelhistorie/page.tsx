'use client';

import { useEffect, useState } from 'react';
import { getParcelHistoryEntries } from '@/lib/store';
import { parcels } from '@/lib/data';
import { HistoryDashboard } from '@/components/history-dashboard';
import type { ParcelHistoryEntry } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirebase } from '@/firebase/client-provider';

export default function PerceelHistoriePage() {
  const { db } = useFirebase();
  const [historyEntries, setHistoryEntries] = useState<ParcelHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const cropVarieties = [...new Set(parcels.map(p => p.variety))];
  const parcelNames = [...new Set(parcels.map(p => p.name))];

  useEffect(() => {
    async function loadHistory() {
      if (!db) return; // Wacht tot db beschikbaar is
      setLoading(true);
      const fetchedEntries = await getParcelHistoryEntries(db);
      setHistoryEntries(fetchedEntries);
      setLoading(false);
    }
    loadHistory();
  }, [db]); // Voeg db toe als dependency

  if (loading || !db) { // Wacht ook tot db beschikbaar is voordat je iets rendert
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
     <HistoryDashboard 
        entries={historyEntries}
        initialVarieties={cropVarieties}
        initialParcels={parcelNames}
      />
  );
}
