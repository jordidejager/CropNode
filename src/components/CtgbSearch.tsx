'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { searchCtgbProducts, getCtgbSyncStats } from '@/lib/store';
import type { CtgbProduct } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, AlertTriangle, Sprout, TestTube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

function DetailView({ middel }: { middel: CtgbProduct | null }) {
  if (!middel) {
    return (
      <div className="flex h-full items-center justify-center text-center text-muted-foreground">
        <div>
          <Search className="mx-auto h-12 w-12" />
          <p className="mt-4">Selecteer een middel om de details te bekijken.</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
        <Card className="border-none shadow-none">
            <CardHeader>
                <CardTitle>{middel.naam}</CardTitle>
                <CardDescription>
                    {middel.toelatingsnummer} - Status: <span className={cn(middel.status === 'Valid' ? 'text-green-500' : 'text-red-500')}>{middel.status}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <h3 className="font-semibold text-lg mb-2">Algemene Informatie</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Toelatingshouder</p>
                            <p>{middel.toelatingshouder || '-'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-muted-foreground">Vervaldatum</p>
                            <p>{middel.vervaldatum ? new Date(middel.vervaldatum).toLocaleDateString('nl-NL') : '-'}</p>
                        </div>
                         <div className="col-span-2 space-y-1">
                            <p className="text-muted-foreground">Werkzame stoffen</p>
                            <div className="flex flex-wrap gap-2">
                                {middel.werkzameStoffen.map(stof => <Badge variant="secondary" key={stof}>{stof}</Badge>)}
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold text-lg mb-2">Gebruiksvoorschriften</h3>
                    {middel.gebruiksvoorschriften && middel.gebruiksvoorschriften.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead><div className="flex items-center gap-2"><Sprout /> Gewas</div></TableHead>
                                    <TableHead><div className="flex items-center gap-2"><TestTube /> Ziekte/Plaag</div></TableHead>
                                    <TableHead className="whitespace-nowrap">Max Toep.</TableHead>
                                    <TableHead>Veiligheidstermijn</TableHead>
                                    <TableHead>Dosering</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {middel.gebruiksvoorschriften.map((gebruik, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{gebruik.gewas || '-'}</TableCell>
                                        <TableCell>{gebruik.doelorganisme || '-'}</TableCell>
                                        <TableCell className="text-center">{gebruik.maxToepassingen || '-'}</TableCell>
                                        <TableCell>{gebruik.veiligheidstermijn || '-'}</TableCell>
                                        <TableCell className="font-bold whitespace-nowrap">{gebruik.dosering || '-'}</TableCell>
                                    </TableRow>
                                ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Geen gebruiksvoorschriften gevonden.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    </ScrollArea>
  );
}

export function CtgbSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CtgbProduct[]>([]);
  const [selectedMiddel, setSelectedMiddel] = useState<CtgbProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<{ count: number; lastSynced?: string } | null>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const db = useFirestore();

  useEffect(() => {
    if (!db) return;

    getCtgbSyncStats(db).then(stats => setSyncStats(stats));

    if (debouncedSearchTerm && debouncedSearchTerm.length > 2) {
      setLoading(true);
      setError(null);
      searchCtgbProducts(db, debouncedSearchTerm)
        .then(data => {
          setResults(data);
        })
        .catch(err => {
          console.error(err);
          setError(err.message || 'Kon geen verbinding maken met de database.');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setResults([]);
    }
  }, [debouncedSearchTerm, db]);

  return (
    <Card className="h-[calc(100vh-10rem)] flex flex-col">
        <CardHeader>
            <CardTitle>CTGB Database</CardTitle>
            <CardDescription>Zoek direct in de lokaal gesynchroniseerde CTGB database.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
            {/* Left Column: Search and Results */}
            <div className="md:col-span-1 flex flex-col gap-4 h-full">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                    type="text"
                    placeholder="Zoek middel op naam..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    />
                     {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-primary" />}
                </div>

                <div className="text-xs text-muted-foreground px-1 flex justify-between">
                     <span>
                        {results.length > 0 && `${results.length} resultaten`}
                     </span>
                     {syncStats?.lastSynced && (
                        <span>
                            Database geüpdatet: {format(parseISO(syncStats.lastSynced), 'dd-MM-yyyy HH:mm', { locale: nl })}
                        </span>
                     )}
                </div>
                
                <ScrollArea className="flex-grow border rounded-md">
                    <div className="p-2">
                        {results.length > 0 ? (
                            results.map(middel => (
                                <button
                                key={middel.id}
                                onClick={() => setSelectedMiddel(middel)}
                                className={cn(
                                    "w-full text-left p-2 rounded-md hover:bg-muted",
                                    selectedMiddel?.id === middel.id && 'bg-muted'
                                )}
                                >
                                <p className="font-semibold text-sm">{middel.naam}</p>
                                <p className="text-xs text-muted-foreground">{middel.toelatingsnummer} - {middel.status}</p>
                                </button>
                            ))
                        ) : !loading && debouncedSearchTerm && (
                            <div className="text-center p-4 text-sm text-muted-foreground">Geen resultaten</div>
                        )}
                    </div>
                </ScrollArea>
                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Zoekfout</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </div>

            {/* Right Column: Details */}
            <div className="md:col-span-2 border rounded-lg h-full overflow-hidden">
                <DetailView middel={selectedMiddel} />
            </div>
        </CardContent>
    </Card>
  );
}
