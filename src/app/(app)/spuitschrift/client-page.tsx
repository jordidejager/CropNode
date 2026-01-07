'use client';

import * as React from 'react';
import { LogbookEntry, Parcel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getParcelHistoryEntries } from '@/lib/store';
import { useFirestore } from '@/firebase';

const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return format(d, 'dd MMMM yyyy HH:mm', { locale: nl });
};

interface SpuitschriftClientPageProps {
    initialEntries: LogbookEntry[];
    allParcels: Parcel[];
}

function ChronologicalView({ entries, allParcels }: { entries: LogbookEntry[], allParcels: Parcel[] }) {
    const calculateTotals = (entry: LogbookEntry) => {
        const selectedParcels = allParcels.filter(p => entry.parsedData?.plots.includes(p.id));
        const totalArea = selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);

        const productsWithTotals = entry.parsedData?.products.map(product => ({
            ...product,
            totalUsed: (product.dosage * totalArea).toFixed(3)
        })) || [];

        return { selectedParcels, totalArea, productsWithTotals };
    };

    const generateProductSummary = (entry: LogbookEntry) => {
        if (!entry.parsedData || !entry.parsedData.products || entry.parsedData.products.length === 0) {
            return entry.rawInput;
        }
        return entry.parsedData.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };
    
    return (
        <Accordion type="single" collapsible className="w-full">
            {entries.map(entry => {
                const { selectedParcels, totalArea, productsWithTotals } = calculateTotals(entry);
                const productSummary = generateProductSummary(entry);
                
                return (
                    <AccordionItem value={entry.id} key={entry.id}>
                        <AccordionTrigger>
                            <div className="flex justify-between items-center w-full pr-4">
                                <div className="text-left">
                                    <p className="font-semibold">{formatDate(entry.date)}</p>
                                    <p className="text-sm text-muted-foreground truncate max-w-xs md:max-w-md" title={productSummary}>
                                        {productSummary}
                                    </p>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm">{selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}</p>
                                    <p className="text-sm text-muted-foreground">{totalArea.toFixed(4)} ha</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pt-2 pb-4 space-y-4 bg-muted/50 rounded-b-md">
                            <div>
                                <h4 className="font-semibold mb-2">Percelen ({totalArea.toFixed(4)} ha totaal)</h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                    {selectedParcels.map(p => (
                                        <div key={p.id} className="flex justify-between">
                                            <span>{p.name} <span className="text-xs">({p.variety})</span></span>
                                            <span>{p.area ? p.area.toFixed(4) : '0.0000'} ha</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Middelen</h4>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Middel</TableHead>
                                                <TableHead className="text-right">Dosering per ha</TableHead>
                                                <TableHead className="text-right">Totaal Gebruikt</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {productsWithTotals.map((p, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="font-medium">{p.product}</TableCell>
                                                    <TableCell className="text-right">{p.dosage} {p.unit}/ha</TableCell>
                                                    <TableCell className="text-right">{p.totalUsed} {p.unit}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}

function ParcelHistoryView({ allParcels }: { allParcels: Parcel[] }) {
    const [selectedParcelId, setSelectedParcelId] = React.useState<string | null>(null);
    const [history, setHistory] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const db = useFirestore();

    React.useEffect(() => {
        if (!selectedParcelId || !db) {
            setHistory([]);
            return;
        };

        async function fetchHistory() {
            setLoading(true);
            const allHistory = await getParcelHistoryEntries(db);
            const parcelHistory = allHistory.filter(h => h.parcelId === selectedParcelId);
            setHistory(parcelHistory);
            setLoading(false);
        }

        fetchHistory();
    }, [selectedParcelId, db]);
    
    return (
         <div className="space-y-4">
            <Select onValueChange={setSelectedParcelId}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Kies een perceel om de historie te zien" />
              </SelectTrigger>
              <SelectContent>
                {allParcels.map(parcel => (
                  <SelectItem key={parcel.id} value={parcel.id}>
                    {parcel.name} ({parcel.variety})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {loading && <p>Historie laden...</p>}

            {!loading && selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Geen bespuitingen gevonden voor dit perceel.</p>
                </div>
            )}

            {!loading && history.length > 0 && (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Middel</TableHead>
                                <TableHead className="text-right">Dosering</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.date, 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.dosage} {item.unit}/ha</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}

export function SpuitschriftClientPage({ initialEntries, allParcels }: SpuitschriftClientPageProps) {
    
    if (initialEntries.length === 0 && allParcels.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-muted-foreground py-10">
                        <p>Er zijn nog geen bevestigde bespuitingen of percelen gevonden.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Spuitschrift</CardTitle>
                <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen, chronologisch of per perceel.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="chronological">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="chronological">Chronologisch</TabsTrigger>
                        <TabsTrigger value="by_parcel">Per Perceel</TabsTrigger>
                    </TabsList>
                    <TabsContent value="chronological" className="mt-6">
                        {initialEntries.length > 0 ? (
                           <ChronologicalView entries={initialEntries} allParcels={allParcels} />
                        ) : (
                             <div className="text-center text-muted-foreground py-10">
                                <p>Er zijn nog geen bevestigde bespuitingen in het logboek gevonden.</p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="by_parcel" className="mt-6">
                       <ParcelHistoryView allParcels={allParcels} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
