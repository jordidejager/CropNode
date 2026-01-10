'use client';

import { InvoerInterface } from '@/components/invoer-interface';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { getLogbookEntries, getParcels } from '@/lib/store';
import type { LogbookEntry, Parcel } from '@/lib/types';
import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

export default function InvoerPage() {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const db = useFirestore();

  const loadData = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    const [fetchedEntries, fetchedParcels] = await Promise.all([
      getLogbookEntries(db),
      getParcels(db)
    ]);
    setEntries(fetchedEntries);
    setParcels(fetchedParcels);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEntryDeleted = useCallback((deletedEntryIds: string[]) => {
    setEntries(prevEntries => prevEntries.filter(entry => !deletedEntryIds.includes(entry.id)));
  }, []);
  
  const handleEntryConfirmed = useCallback(() => {
    loadData(); // Re-fetch all entries to show the updated status
  }, [loadData]);

  return (
    <div className="flex flex-col gap-8 h-full">
      <InvoerInterface onNewEntry={loadData} />
      
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Recent Logboek</CardTitle>
          <CardDescription>
            {loading ? 'Laden...' : `Totaal ${entries.length} regels, met de nieuwste bovenaan.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <LogbookTable 
              entries={entries} 
              allParcels={parcels}
              onEntryDeleted={handleEntryDeleted} 
              onEntryConfirmed={handleEntryConfirmed}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
