'use client';

import { useEffect, useState } from 'react';
import { getLogbookEntries } from '@/lib/store';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LogbookEntry } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirebase } from '@/firebase/client-provider';

export default function LogboekPage() {
  const { db } = useFirebase();
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEntries() {
      if (!db) return; // Wacht tot db beschikbaar is
      setLoading(true);
      const fetchedEntries = await getLogbookEntries(db);
      setEntries(fetchedEntries);
      setLoading(false);
    }
    loadEntries();
  }, [db]); // Voeg db toe als dependency

  return (
    <Card>
      <CardHeader>
        <CardTitle>Volledig Logboek</CardTitle>
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
          <LogbookTable entries={entries} />
        )}
      </CardContent>
    </Card>
  );
}
