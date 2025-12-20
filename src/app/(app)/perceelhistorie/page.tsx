'use client';

import { useEffect, useState } from 'react';
import { getParcelHistoryEntries, getParcels } from '@/lib/store';
import { HistoryDashboard } from '@/components/history-dashboard';
import type { Parcel, ParcelHistoryEntry } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/firebase';

export default function PerceelHistoriePage() {
  const [historyEntries, setHistoryEntries] = useState<ParcelHistoryEntry[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const db = useFirestore();

  const cropVarieties = [...new Set(parcels.map(p => p.variety))];
  const parcelNames = [...new Set(parcels.map(p => p.name))];

  useEffect(() => {
    async function loadHistory() {
      if (!db) return;
      setLoading(true);
      const [fetchedEntries, fetchedParcels] = await Promise.all([
        getParcelHistoryEntries(db),
        getParcels(db)
      ]);
      setHistoryEntries(fetchedEntries);
      setParcels(fetchedParcels);
      setLoading(false);
    }
    loadHistory();
  }, [db]);

  if (loading) {
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
