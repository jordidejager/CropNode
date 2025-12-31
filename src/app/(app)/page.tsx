'use client';

import { InvoerInterface } from '@/components/invoer-interface';
import { LogbookTable } from '@/components/logbook-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore } from '@/firebase';
import { getLogbookEntries } from '@/lib/store';
import type { LogbookEntry } from '@/lib/types';
import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function InvoerPage() {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const db = useFirestore();

  const loadEntries = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    const fetchedEntries = await getLogbookEntries(db);
    setEntries(fetchedEntries);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleEntryDeleted = useCallback((deletedEntryId: string) => {
    setEntries(prevEntries => prevEntries.filter(entry => entry.id !== deletedEntryId));
  }, []);
  
  const handleEntryConfirmed = useCallback(() => {
    loadEntries(); // Re-fetch all entries to show the updated status
  }, [loadEntries])

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
                <LogbookTable 
                  entries={entries} 
                  onEntryDeleted={handleEntryDeleted} 
                  onEntryConfirmed={handleEntryConfirmed}
                />
              )}
            </CardContent>
          </Card>
      </TabsContent>
    </Tabs>
  );
}
