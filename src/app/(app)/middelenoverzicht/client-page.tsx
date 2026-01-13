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
import type { CtgbGebruiksvoorschrift } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { CtgbCategoryBadge } from '@/components/ctgb-category-badge';


type ProductInList = {
    id: string;
    toelatingsnummer: string;
    naam: string;
    werkzameStoffen: string[];
    status: string;
    gebruiksvoorschriften: CtgbGebruiksvoorschrift[];
    categorie: string;
};

interface MiddelenOverzichtClientPageProps {
    products: ProductInList[];
}


const DosageSelector: React.FC<{ voorschriften: CtgbGebruiksvoorschrift[] }> = ({ voorschriften }) => {
    const relevantCrops = ['appel', 'peer', 'pitvruchten'];
    
    const pomeFruitVoorschriften = voorschriften.filter(v => 
        v.gewas && relevantCrops.some(crop => v.gewas.toLowerCase().includes(crop))
    );

    const allVoorschriften = pomeFruitVoorschriften.length > 0 ? pomeFruitVoorschriften : voorschriften;

    const [selectedVoorschrift, setSelectedVoorschrift] = React.useState(allVoorschriften[0]);

    if (!selectedVoorschrift) {
        return <span className="text-muted-foreground">-</span>;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="font-mono text-primary font-semibold h-auto p-1 -ml-1">
                    {selectedVoorschrift.dosering || '-'}
                    {allVoorschriften.length > 1 && <ChevronDown className="ml-2 h-4 w-4" />}
                </Button>
            </DropdownMenuTrigger>
            {allVoorschriften.length > 1 && (
                <DropdownMenuContent align="start">
                    {allVoorschriften.map((item, index) => (
                        <DropdownMenuItem key={index} onSelect={() => setSelectedVoorschrift(item)}>
                           <div className="flex flex-col">
                               <span className="font-semibold">{item.gewas}</span>
                               <span className="text-muted-foreground">{item.dosering}</span>
                               {item.maxToepassingen && <span className="text-xs text-muted-foreground/80">Max. {item.maxToepassingen}x per jaar</span>}
                           </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
};


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
        <Card className="h-full flex flex-col">
            <CardHeader className="pt-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Filter op naam of werkzame stof..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                 <CardDescription>
                    Gefilterd op hardfruit. Totaal {products.length} relevante middelen gevonden.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Middel</TableHead>
                                    <TableHead>Categorie</TableHead>
                                    <TableHead>Dosering (Appel/Peer)</TableHead>
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
                                                <CtgbCategoryBadge category={product.categorie} />
                                            </TableCell>
                                            <TableCell>
                                                <DosageSelector voorschriften={product.gebruiksvoorschriften} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                 <Badge variant={product.status === 'Valid' ? 'default' : 'destructive'} className={cn(product.status === 'Valid' && 'bg-green-600')}>{product.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">
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
