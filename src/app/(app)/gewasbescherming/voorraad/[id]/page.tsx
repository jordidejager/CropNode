'use client';

import * as React from 'react';
import { useProductMovements } from '@/hooks/use-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowLeft, History } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { useParams } from 'next/navigation';

const formatDate = (date: Date) => {
    return format(date, 'dd-MM-yyyy HH:mm', { locale: nl });
};

export default function VoorraadMutatiePage() {
    const params = useParams();
    const productName = decodeURIComponent(params.id as string);

    // Use React Query for data fetching
    const { movements, currentStock, unit, isLoading, isError, error, refetch } = useProductMovements(productName);

    // Loading state
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                        <Link href="/gewasbescherming/voorraad">
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
                            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <TableSkeleton rows={5} columns={4} />
                </CardContent>
            </Card>
        );
    }

    // Error state
    if (isError) {
        return (
            <Card>
                <CardHeader>
                    <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                        <Link href="/gewasbescherming/voorraad">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Terug naar Voorraad
                        </Link>
                    </Button>
                    <CardTitle>Mutaties voor {productName}</CardTitle>
                    <CardDescription>Volledige geschiedenis van toevoegingen en verbruik.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ErrorState
                        title="Kon mutaties niet laden"
                        message={error?.message || 'Er is een fout opgetreden bij het ophalen van de mutaties.'}
                        onRetry={() => refetch()}
                    />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <Button asChild variant="ghost" className="mb-4 w-fit -ml-4">
                    <Link href="/gewasbescherming/voorraad">
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
                            {movements.length > 0 ? (
                                movements.map(item => (
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
                                    <TableCell colSpan={4} className="py-8">
                                        <EmptyState
                                            icon={History}
                                            title="Geen mutaties gevonden"
                                            description="Er zijn nog geen mutaties geregistreerd voor dit product."
                                        />
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
