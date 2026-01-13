'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Droplet, Sprout, Combine } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { FertilizerProduct } from '@/lib/types';
import { useDebounce } from '@/hooks/use-debounce';

type Category = 'Leaf' | 'Soil' | 'Fertigation';

const categoryConfig: Record<Category, { label: string, icon: React.ElementType, color: string }> = {
    'Leaf': { label: 'Blad', icon: Droplet, color: 'bg-green-600' },
    'Soil': { label: 'Bodem', icon: Combine, color: 'bg-yellow-700' },
    'Fertigation': { label: 'Fertigatie', icon: Sprout, color: 'bg-blue-600' },
}

const formatComposition = (composition: FertilizerProduct['composition']): string => {
    if (!composition || Object.keys(composition).length === 0) {
        return '-';
    }
    const npk: string[] = [];
    const others: string[] = [];

    if (composition.N !== undefined) npk[0] = String(composition.N);
    if (composition.P !== undefined) npk[1] = String(composition.P);
    if (composition.K !== undefined) npk[2] = String(composition.K);

    if (composition.MgO) others.push(`${composition.MgO} MgO`);
    if (composition.SO3) others.push(`${composition.SO3} SO3`);

    let result = '';
    if (npk.length > 0) {
        result += `NPK ${npk.join('-')}`;
    }
    if (others.length > 0) {
        result += result ? ' + ' : '';
        result += others.join(' + ');
    }
    return result || '-';
};

export function FertilizersClientPage({ fertilizers }: { fertilizers: FertilizerProduct[] }) {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<Category | null>(null);
    
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const filteredFertilizers = React.useMemo(() => {
        let results = fertilizers;
        
        if (selectedCategory) {
            results = results.filter(f => f.category === selectedCategory);
        }

        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            results = results.filter(f => f.name.toLowerCase().includes(lowercasedFilter));
        }

        return results;
    }, [debouncedSearchTerm, selectedCategory, fertilizers]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pt-0">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Zoek op naam..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {Object.entries(categoryConfig).map(([key, { label, icon: Icon }]) => (
                            <Button
                                key={key}
                                variant={selectedCategory === key ? 'secondary' : 'outline'}
                                onClick={() => setSelectedCategory(prev => prev === key ? null : key as Category)}
                                className="flex-1"
                            >
                                <Icon className="mr-2 h-4 w-4"/>
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>
                 <CardDescription>
                    Totaal {fertilizers.length} meststoffen gevonden in de database.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="rounded-md border">
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Meststof</TableHead>
                                    <TableHead>Categorie</TableHead>
                                    <TableHead>Samenstelling</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredFertilizers.length > 0 ? (
                                    filteredFertilizers.map((fertilizer) => {
                                        const catConfig = categoryConfig[fertilizer.category] || { label: fertilizer.category, color: 'bg-gray-500' };
                                        return (
                                            <TableRow key={fertilizer.id}>
                                                <TableCell>
                                                    <div className="font-bold">{fertilizer.name}</div>
                                                    <div className="text-xs text-muted-foreground">{fertilizer.manufacturer}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={cn("text-primary-foreground", catConfig.color)}>{catConfig.label}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-mono font-medium">{formatComposition(fertilizer.composition)}</span>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            Geen meststoffen gevonden die aan uw criteria voldoen.
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