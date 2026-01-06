'use client';

import * as React from 'react';
import { LogbookEntry, Parcel, ProductEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return format(d, 'dd MMMM yyyy HH:mm', { locale: nl });
};

interface SpuitschriftClientPageProps {
    initialEntries: LogbookEntry[];
    allParcels: Parcel[];
}

export function SpuitschriftClientPage({ initialEntries, allParcels }: SpuitschriftClientPageProps) {
    if (initialEntries.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-muted-foreground py-10">
                        <p>Er zijn nog geen bevestigde bespuitingen in het logboek gevonden.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const calculateTotals = (entry: LogbookEntry) => {
        const selectedParcels = allParcels.filter(p => entry.parsedData?.plots.includes(p.id));
        const totalArea = selectedParcels.reduce((sum, p) => sum + p.area, 0);

        const productsWithTotals = entry.parsedData?.products.map(product => ({
            ...product,
            totalUsed: (product.dosage * totalArea).toFixed(3)
        })) || [];

        return { selectedParcels, totalArea, productsWithTotals };
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Spuitschrift</CardTitle>
                <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="single" collapsible className="w-full">
                    {initialEntries.map(entry => {
                        const { selectedParcels, totalArea, productsWithTotals } = calculateTotals(entry);
                        
                        return (
                            <AccordionItem value={entry.id} key={entry.id}>
                                <AccordionTrigger>
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <div className="text-left">
                                            <p className="font-semibold">{formatDate(entry.date)}</p>
                                            <p className="text-sm text-muted-foreground truncate max-w-xs md:max-w-md" title={entry.rawInput}>
                                                {entry.rawInput}
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
                                        <h4 className="font-semibold mb-1">Percelen ({totalArea.toFixed(4)} ha totaal)</h4>
                                        <p className="text-sm text-muted-foreground">
                                            {selectedParcels.map(p => p.name).join(', ')}
                                        </p>
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
                                     {/* Later can add target organism here */}
                                     {/* <div>
                                         <h4 className="font-semibold mb-1">Doel van bespuiting</h4>
                                         <p className="text-sm text-muted-foreground">Schurft, Meeldauw</p>
                                     </div> */}
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            </CardContent>
        </Card>
    );
}
