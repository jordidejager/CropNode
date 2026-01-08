'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type ProductInList = {
    id: string;
    toelatingsnummer: string;
    naam: string;
    werkzameStoffen: string[];
    maxDosering: string;
    status: string;
};

interface MiddelenOverzichtClientPageProps {
    products: ProductInList[];
}

export function MiddelenOverzichtClientPage({ products }: MiddelenOverzichtClientPageProps) {
    const [searchTerm, setSearchTerm] = React.useState('');
    const router = useRouter();

    const filteredProducts = React.useMemo(() => {
        if (!searchTerm) {
            return products;
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        return products.filter(product =>
            product.naam.toLowerCase().includes(lowercasedFilter) ||
            product.werkzameStoffen.some(stof => stof.toLowerCase().includes(lowercasedFilter))
        );
    }, [searchTerm, products]);

    const handleRowClick = (productId: string) => {
        router.push(`/middelenoverzicht/${productId}`);
    };
    
    return (
        <Card className="h-[calc(100vh-10rem)] flex flex-col">
            <CardHeader>
                <CardTitle>Middelenoverzicht voor Hardfruit</CardTitle>
                <CardDescription>
                    Een gefilterd overzicht van alle middelen die relevant zijn voor de teelt van appel en peer.
                    Totaal {products.length} relevante middelen gevonden.
                </CardDescription>
                <div className="relative pt-4">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Filter op naam of werkzame stof..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Middel</TableHead>
                                    <TableHead>Max. Dosering (Appel/Peer)</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredProducts.length > 0 ? (
                                    filteredProducts.map(product => (
                                        <TableRow key={product.id} onClick={() => handleRowClick(product.toelatingsnummer)} className="cursor-pointer">
                                            <TableCell>
                                                <div className="font-bold">{product.naam}</div>
                                                <div className="text-xs text-muted-foreground truncate max-w-xs">{product.werkzameStoffen.join(', ')}</div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-primary font-semibold">{product.maxDosering}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                 <Badge variant={product.status === 'Valid' ? 'default' : 'destructive'} className={cn(product.status === 'Valid' && 'bg-green-600')}>{product.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            Geen middelen gevonden voor uw zoekopdracht.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
