'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AddStockDialog } from '@/components/add-stock-dialog';
import { cn } from '@/lib/utils';

type StockItem = {
    productName: string;
    stock: number;
    unit: string;
};

interface VoorraadClientPageProps {
    initialStock: StockItem[];
    allProducts: string[];
}

export function VoorraadClientPage({ initialStock, allProducts }: VoorraadClientPageProps) {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isAddStockOpen, setIsAddStockOpen] = React.useState(false);
    const router = useRouter();

    const filteredStock = React.useMemo(() => {
        if (!searchTerm) return initialStock;
        return initialStock.filter(item =>
            item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, initialStock]);

    const handleRowClick = (productName: string) => {
        const encodedProductName = encodeURIComponent(productName);
        router.push(`/voorraad/${encodedProductName}`);
    };

    return (
        <>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <CardTitle>Voorraadbeheer</CardTitle>
                    <CardDescription>Overzicht van de huidige voorraad gewasbeschermingsmiddelen.</CardDescription>
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
                                        <TableCell colSpan={2} className="h-24 text-center">
                                            {initialStock.length === 0 ? "Geen voorraad gevonden. Voeg een levering toe om te beginnen." : "Geen resultaten voor uw zoekopdracht."}
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
                onStockAdded={() => router.refresh()}
            />
        </>
    );
}
