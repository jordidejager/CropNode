'use client';

import { InvoerInterface } from '@/components/invoer-interface';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore } from '@/firebase';
import { getLogbookEntries } from '@/lib/store';
import type { LogbookEntry } from '@/lib/types';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

function LogboekTab() {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const db = useFirestore();

  useEffect(() => {
    async function loadEntries() {
      if (!db) return;
      setLoading(true);
      const fetchedEntries = await getLogbookEntries(db);
      setEntries(fetchedEntries);
      setLoading(false);
    }
    loadEntries();
  }, [db]);

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

export default function InvoerPage() {
  return (
    <Tabs defaultValue="invoer">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="invoer">Slimme Invoer</TabsTrigger>
        <TabsTrigger value="logboek">Recent Logboek</TabsTrigger>
      </TabsList>
      <TabsContent value="invoer" className="mt-6">
        <div className="flex justify-center items-center h-full">
          <InvoerInterface />
        </div>
      </TabsContent>
      <TabsContent value="logboek" className="mt-6">
        <LogboekTab />
      </TabsContent>
    </Tabs>
  );
}
