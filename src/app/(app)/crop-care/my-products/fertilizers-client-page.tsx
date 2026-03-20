'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Droplet, Sprout, Combine, Building2, Tag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { FertilizerProduct } from '@/lib/types';
import { useDebounce } from '@/hooks/use-debounce';
import { FertilizerCard } from '@/components/fertilizer-card';
import { FertilizerDetailDialog } from '@/components/fertilizer-detail-dialog';
import { compositionMatchesSearch } from '@/lib/element-info';

type Category = 'Leaf' | 'Soil' | 'Fertigation';

const categoryConfig: Record<Category, { label: string, icon: React.ElementType, color: string }> = {
    'Leaf': { label: 'Blad', icon: Droplet, color: 'bg-green-600/30 text-green-400 border-green-500/50' },
    'Soil': { label: 'Bodem', icon: Combine, color: 'bg-amber-600/30 text-amber-400 border-amber-500/50' },
    'Fertigation': { label: 'Fertigatie', icon: Sprout, color: 'bg-blue-600/30 text-blue-400 border-blue-500/50' },
}

export function FertilizersClientPage({ fertilizers }: { fertilizers: FertilizerProduct[] }) {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<Category | null>(null);
    const [selectedFertilizer, setSelectedFertilizer] = React.useState<FertilizerProduct | null>(null);
    const [dialogOpen, setDialogOpen] = React.useState(false);

    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const filteredFertilizers = React.useMemo(() => {
        let results = fertilizers;

        if (selectedCategory) {
            results = results.filter(f => f.category === selectedCategory);
        }

        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            results = results.filter(f =>
                // Zoek op productnaam
                f.name.toLowerCase().includes(lowercasedFilter) ||
                // Zoek op fabrikant
                f.manufacturer.toLowerCase().includes(lowercasedFilter) ||
                // Zoek op element in samenstelling (bijv. "koper", "ijzer", "borium")
                compositionMatchesSearch(f.composition, lowercasedFilter)
            );
        }

        return results;
    }, [debouncedSearchTerm, selectedCategory, fertilizers]);

    const handleShowDetails = (fertilizer: FertilizerProduct) => {
        setSelectedFertilizer(fertilizer);
        setDialogOpen(true);
    };

    return (
        <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
            <CardHeader className="pt-0 px-0">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Zoek op naam, element of fabrikant..."
                            className="w-full pl-10 h-12 bg-card/40 border border-border/40 rounded-md outline-none focus:border-primary/50 transition-colors"
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
                                className={cn(
                                    "flex-1 h-12 px-4 border-dashed",
                                    selectedCategory === key && "bg-secondary/40 border-secondary"
                                )}
                            >
                                <Icon className="mr-2 h-4 w-4" />
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>
                <CardDescription className="pt-2">
                    Totaal {fertilizers.length} meststoffen gevonden in de database.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden px-0">
                <ScrollArea className="h-full px-0">
                    {filteredFertilizers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
                            {filteredFertilizers.map((fertilizer) => (
                                <FertilizerCard
                                    key={fertilizer.id}
                                    fertilizer={fertilizer}
                                    onShowDetails={handleShowDetails}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-48 text-muted-foreground border rounded-lg border-dashed border-border/40">
                            Geen meststoffen gevonden die aan uw criteria voldoen.
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            <FertilizerDetailDialog
                fertilizer={selectedFertilizer}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
            />
        </Card>
    );
}