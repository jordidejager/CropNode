'use client';

import { useEffect, useState } from 'react';
import { getParcelHistoryEntries, getParcels } from '@/lib/supabase-store';
import { HistoryDashboard } from '@/components/history-dashboard';
import type { Parcel, ParcelHistoryEntry } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function PerceelHistoriePage() {
  const [historyEntries, setHistoryEntries] = useState<ParcelHistoryEntry[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function loadHistory() {
      // if (!db) return;
      setLoading(true);
      const [fetchedEntries, fetchedParcels] = await Promise.all([
        getParcelHistoryEntries(),
        getParcels()
      ]);
      setHistoryEntries(fetchedEntries);
      setParcels(fetchedParcels);
      setLoading(false);
    }
    loadHistory();
  }, []);

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
    <Card>
      <CardHeader>
        <CardTitle>Perceelhistorie</CardTitle>
        <CardDescription>Deze pagina is niet meer in gebruik. De functionaliteit is verplaatst naar het Spuitschrift.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Ga naar het Spuitschrift om de historie per perceel te bekijken.</p>
      </CardContent>
    </Card>
  );
}
