'use server';

import React from 'react';
import { initializeFirebase } from '@/firebase';
import { getInventoryMovements } from '@/lib/store';
import { InventoryMovement } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return format(d, 'dd-MM-yyyy HH:mm', { locale: nl });
};

// This is a server component, but we're extracting the logic to a separate
// component to use `use` hook for params.
const VoorraadMutatieContent = async ({ productName }: { productName: string }) => {
    const { firestore } = initializeFirebase();
    const allMovements = await getInventoryMovements(firestore);
    
    const productMovements = allMovements
        .filter(m => m.productName === productName)
        .sort((a, b) => {
            const dateA = a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime();
            const dateB = b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime();
            return dateB - dateA;
        });

    const currentStock = productMovements.reduce((sum, m) => sum + m.quantity, 0);
    const unit = productMovements.find(m => m.unit)?.unit || 'onbekend';

    return (
        <Card>
            <CardHeader>
                <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                    <Link href="/voorraad">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Terug naar Voorraad
                    </Link>
                </Button>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Mutaties voor {productName}</CardTitle>
                        <CardDescription>Volledige geschiedenis van toevoegingen en verbruik.</CardDescription>
                    </div>
                    <div className="text-right">
                         <p className="text-sm text-muted-foreground">Huidige Voorraad</p>
                         <p className={cn("text-2xl font-bold", currentStock < 0 ? "text-destructive" : "text-foreground")}>
                            {currentStock.toFixed(3)} {unit}
                         </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Omschrijving</TableHead>
                                <TableHead className="text-right">Hoeveelheid</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {productMovements.length > 0 ? (
                                productMovements.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell className="text-muted-foreground">{formatDate(item.date)}</TableCell>
                                        <TableCell>
                                             <span className={cn("text-sm font-medium", item.type === 'addition' ? 'text-green-500' : 'text-red-500')}>
                                                {item.type === 'addition' ? 'Toevoeging' : 'Verbruik'}
                                             </span>
                                        </TableCell>
                                        <TableCell className="text-sm">{item.description}</TableCell>
                                        <TableCell className={cn("text-right font-mono", item.quantity > 0 ? 'text-green-500' : 'text-red-500')}>
                                            {item.quantity > 0 ? `+${item.quantity.toFixed(3)}` : item.quantity.toFixed(3)} {item.unit}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        Geen mutaties gevonden voor dit product.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};


export default function VoorraadMutatiePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = React.use(params);
    const productName = decodeURIComponent(id);
    
    return <VoorraadMutatieContent productName={productName} />;
}
