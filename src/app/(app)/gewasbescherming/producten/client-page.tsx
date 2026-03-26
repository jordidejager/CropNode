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
import { ChevronDown, Building2, Hash, Droplets, Bug, Sprout, TrendingUp, HelpCircle } from 'lucide-react';
import { CtgbCategoryBadge } from '@/components/ctgb-category-badge';
import { ProductCard } from '@/components/product-card';
import { useDebounce } from '@/hooks/use-debounce';

type ProductInList = {
    id: string;
    toelatingsnummer: string;
    naam: string;
    werkzameStoffen: string[];
    status: string;
    gebruiksvoorschriften: CtgbGebruiksvoorschrift[];
    categorie: string;
    toelatingshouder?: string;
    productTypes?: string[];
};

interface MiddelenOverzichtClientPageProps {
    products: ProductInList[];
}

const filterConfig = [
    { id: 'fungicide', label: 'Fungicide', icon: Droplets, color: 'hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30' },
    { id: 'insecticide', label: 'Insecticide', icon: Bug, color: 'hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30' },
    { id: 'herbicide', label: 'Herbicide', icon: Sprout, color: 'hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30' },
    { id: 'groeiregulator', label: 'Groeiregulator', icon: TrendingUp, color: 'hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30' },
] as const;

type FilterType = typeof filterConfig[number]['id'];

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
                <Button variant="ghost" className="font-mono text-primary font-bold h-7 p-0 px-2 flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 hover:text-primary rounded-md border border-primary/20">
                    <span className="text-[10px] text-primary/60 font-bold uppercase tracking-tight">Valid</span>
                    <span className="text-sm">{selectedVoorschrift.dosering || '-'}</span>
                    {allVoorschriften.length > 1 && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
                </Button>
            </DropdownMenuTrigger>
            {allVoorschriften.length > 1 && (
                <DropdownMenuContent align="end" className="w-56">
                    {allVoorschriften.map((item, index) => (
                        <DropdownMenuItem key={index} onSelect={() => setSelectedVoorschrift(item)} className="cursor-pointer">
                            <div className="flex flex-col gap-0.5 py-1">
                                <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">{item.gewas}</span>
                                <span className="font-mono font-bold text-primary">{item.dosering}</span>
                                {item.maxToepassingen && <span className="text-[10px] text-muted-foreground/80 mt-1">Max. {item.maxToepassingen}x per jaar</span>}
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
    const [selectedType, setSelectedType] = React.useState<FilterType | null>(null);
    const router = useRouter();

    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const filteredProducts = React.useMemo(() => {
        let results = products;

        if (selectedType) {
            results = results.filter(product => {
                const types = product.productTypes?.map(t => t.toLowerCase()) || [];
                const cat = product.categorie.toLowerCase();
                return types.some(t => t.includes(selectedType)) || cat.includes(selectedType);
            });
        }

        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            results = results.filter(product =>
                product.naam.toLowerCase().includes(lowercasedFilter) ||
                product.werkzameStoffen.some(stof => stof.toLowerCase().includes(lowercasedFilter))
            );
        }

        return results;
    }, [debouncedSearchTerm, selectedType, products]);

    const handleRowClick = (productId: string) => {
        router.push(`/gewasbescherming/producten/${productId}`);
    };

    return (
        <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="pt-0 px-0">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Filter op naam of werkzame stof..."
                            className="pl-10 h-12 bg-card/40 border-border/40"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {filterConfig.map(({ id, label, icon: Icon, color }) => (
                            <Button
                                key={id}
                                variant={selectedType === id ? 'secondary' : 'outline'}
                                onClick={() => setSelectedType(prev => prev === id ? null : id)}
                                className={cn(
                                    "flex-1 h-12 px-4 border-dashed transition-all duration-200",
                                    selectedType === id ? "bg-secondary/40 border-secondary" : color
                                )}
                            >
                                <Icon className={cn("mr-2 h-4 w-4", selectedType === id && "text-primary")} />
                                <span className="hidden lg:inline">{label}</span>
                            </Button>
                        ))}
                    </div>
                </div>
                <CardDescription className="pt-2">
                    Gefilterd op hardfruit. Totaal {filteredProducts.length} relevante middelen gevonden.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden px-0">
                <ScrollArea className="h-full px-0">
                    {filteredProducts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
                            {filteredProducts.map(product => (
                                <ProductCard
                                    key={product.id}
                                    title={product.naam}
                                    subtitle={product.werkzameStoffen.join(', ')}
                                    labels={[
                                        {
                                            label: 'Houder',
                                            value: product.toelatingshouder || '-',
                                            verified: true,
                                            icon: <Building2 className="h-3 w-3" />
                                        },
                                        {
                                            label: 'Toelatingsnr',
                                            value: product.toelatingsnummer,
                                            icon: <Hash className="h-3 w-3" />
                                        },
                                    ]}
                                    categoryBadge={
                                        <CtgbCategoryBadge
                                            category={product.categorie}
                                            productTypes={product.productTypes}
                                        />
                                    }
                                    status={{
                                        label: product.status,
                                        variant: product.status === 'Valid' ? 'default' : 'destructive',
                                        className: product.status === 'Valid' ? 'bg-green-600/30 text-green-400 border-green-500/50' : undefined
                                    }}
                                    footerExtra={<DosageSelector voorschriften={product.gebruiksvoorschriften} />}
                                    onAction={() => handleRowClick(product.toelatingsnummer)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-48 text-muted-foreground border rounded-lg border-dashed border-border/40">
                            Geen middelen gevonden voor uw zoekopdracht.
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
