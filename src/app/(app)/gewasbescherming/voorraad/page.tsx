'use client';

import * as React from 'react';
import { useStockOverview, useInvalidateQueries } from '@/hooks/use-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Boxes } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AddStockDialog } from '@/components/add-stock-dialog';
import { cn } from '@/lib/utils';
import { InventorySkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';

export default function VoorraadPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isAddStockOpen, setIsAddStockOpen] = React.useState(false);
    const router = useRouter();

    // Use React Query for data fetching
    const { stock, allProducts, isLoading, isError, error, refetch } = useStockOverview();
    const { invalidateInventory } = useInvalidateQueries();

    const filteredStock = React.useMemo(() => {
        if (!searchTerm) return stock;
        return stock.filter(item =>
            item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, stock]);

    const handleRowClick = (productName: string) => {
        const encodedProductName = encodeURIComponent(productName);
        router.push(`/crop-care/inventory/${encodedProductName}`);
    };

    const handleStockAdded = () => {
        invalidateInventory();
        setIsAddStockOpen(false);
    };

    // Loading state
    if (isLoading) {
        return (
            <>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <CardTitle>Voorraadbeheer</CardTitle>
                        <CardDescription>Overzicht van de huidige voorraad gewasbeschermingsmiddelen en meststoffen.</CardDescription>
                    </div>
                    <Button disabled>
                        <PlusCircle className="mr-2 h-4 w-4" /> Levering Toevoegen
                    </Button>
                </div>
                <Card>
                    <CardContent className="py-6">
                        <InventorySkeleton />
                    </CardContent>
                </Card>
            </>
        );
    }

    // Error state
    if (isError) {
        return (
            <>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <CardTitle>Voorraadbeheer</CardTitle>
                        <CardDescription>Overzicht van de huidige voorraad gewasbeschermingsmiddelen en meststoffen.</CardDescription>
                    </div>
                </div>
                <Card>
                    <CardContent className="py-6">
                        <ErrorState
                            title="Kon voorraad niet laden"
                            message={error?.message || 'Er is een fout opgetreden bij het ophalen van de voorraad.'}
                            onRetry={() => refetch()}
                        />
                    </CardContent>
                </Card>
            </>
        );
    }

    return (
        <>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <CardTitle>Voorraadbeheer</CardTitle>
                    <CardDescription>Overzicht van de huidige voorraad gewasbeschermingsmiddelen en meststoffen.</CardDescription>
                </div>
                <Button onClick={() => setIsAddStockOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Levering Toevoegen
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Zoek een middel..."
                            className="w-full rounded-lg bg-background pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Middel</TableHead>
                                    <TableHead className="text-right">Huidige Voorraad</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStock.length > 0 ? (
                                    filteredStock.map(item => (
                                        <TableRow key={item.productName} onClick={() => handleRowClick(item.productName)} className="cursor-pointer">
                                            <TableCell className="font-medium">{item.productName}</TableCell>
                                            <TableCell className={cn("text-right", item.stock < 0 ? "text-destructive" : "")}>
                                                {item.stock.toFixed(3)} {item.unit}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={2} className="py-8">
                                            {stock.length === 0 ? (
                                                <EmptyState
                                                    icon={Boxes}
                                                    title="Geen voorraad gevonden"
                                                    description="Voeg een levering toe om uw voorraad bij te houden."
                                                    action={
                                                        <Button onClick={() => setIsAddStockOpen(true)}>
                                                            <PlusCircle className="mr-2 h-4 w-4" />
                                                            Levering Toevoegen
                                                        </Button>
                                                    }
                                                />
                                            ) : (
                                                <div className="text-center text-muted-foreground">
                                                    Geen resultaten voor uw zoekopdracht.
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AddStockDialog
                open={isAddStockOpen}
                onOpenChange={setIsAddStockOpen}
                allProducts={allProducts}
                onStockAdded={handleStockAdded}
            />
        </>
    );
}
