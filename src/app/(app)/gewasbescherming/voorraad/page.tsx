'use client';

import * as React from 'react';
import { useStockOverview, useInvalidateQueries } from '@/hooks/use-data';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, Boxes, AlertTriangle, Package, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AddStockDialog } from '@/components/add-stock-dialog';
import { cn } from '@/lib/utils';
import { InventorySkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { SectionHeader, SpotlightCard, GlowOrb, type PaletteColor } from '@/components/ui/premium';

type StockLevel = 'critical' | 'low' | 'ok';

function getStockLevel(stock: number, max: number): StockLevel {
    if (stock < 0) return 'critical';
    if (max > 0 && stock / max < 0.15) return 'low';
    return 'ok';
}

function getStockColor(level: StockLevel): PaletteColor {
    if (level === 'critical') return 'purple';
    if (level === 'low') return 'orange';
    return 'emerald';
}

export default function VoorraadPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [isAddStockOpen, setIsAddStockOpen] = React.useState(false);
    const router = useRouter();

    const { stock, allProducts, isLoading, isError, error, refetch } = useStockOverview();
    const { invalidateInventory } = useInvalidateQueries();

    const filteredStock = React.useMemo(() => {
        if (!searchTerm) return stock;
        return stock.filter(item =>
            item.productName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, stock]);

    const maxStock = React.useMemo(() => {
        return Math.max(1, ...stock.map(s => Math.max(0, s.stock)));
    }, [stock]);

    const lowStockCount = React.useMemo(() => {
        return stock.filter(s => getStockLevel(s.stock, maxStock) !== 'ok').length;
    }, [stock, maxStock]);

    const handleRowClick = (productName: string) => {
        const encodedProductName = encodeURIComponent(productName);
        router.push(`/gewasbescherming/voorraad/${encodedProductName}`);
    };

    const handleStockAdded = () => {
        invalidateInventory();
        setIsAddStockOpen(false);
    };

    const header = (
        <SectionHeader
            eyebrow="Magazijn"
            title="Voorraadbeheer"
            titleGradient={stock.length > 0 ? `${stock.length} producten${lowStockCount > 0 ? ` · ${lowStockCount} let op` : ''}` : undefined}
            description="Huidige voorraad van gewasbeschermingsmiddelen en meststoffen."
            color="amber"
            action={
                <Button
                    size="lg"
                    onClick={() => setIsAddStockOpen(true)}
                    className="h-12 px-6 text-base font-semibold hidden sm:inline-flex"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Levering toevoegen
                </Button>
            }
        />
    );

    if (isLoading) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="amber" position="top-left" size="w-[450px] h-[300px]" blur="blur-[140px]" opacity={0.07} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <InventorySkeleton />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="amber" position="top-left" size="w-[450px] h-[300px]" blur="blur-[140px]" opacity={0.07} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState
                            title="Kon voorraad niet laden"
                            message={error?.message || 'Er is een fout opgetreden bij het ophalen van de voorraad.'}
                            onRetry={() => refetch()}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <>
            <div className="relative space-y-8 pb-24 sm:pb-0">
                <GlowOrb color="amber" position="top-left" size="w-[500px] h-[320px]" blur="blur-[140px]" opacity={0.07} />
                <GlowOrb color="orange" position="top-right" size="w-[360px] h-[260px]" blur="blur-[140px]" opacity={0.04} />

                {header}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Zoek een middel..."
                        className="pl-12 h-14 text-base bg-white/[0.02] border-white/10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Stock cards */}
                {filteredStock.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredStock.map(item => {
                            const level = getStockLevel(item.stock, maxStock);
                            const palette = getStockColor(level);
                            const pct = Math.max(0, Math.min(100, (item.stock / Math.max(maxStock, 1)) * 100));

                            return (
                                <SpotlightCard
                                    key={item.productName}
                                    color={palette}
                                    padding="p-0"
                                    interactive
                                    onClick={() => handleRowClick(item.productName)}
                                >
                                    <div className="p-5 flex items-center gap-4">
                                        <div className={cn(
                                            'w-12 h-12 rounded-xl border flex items-center justify-center shrink-0',
                                            level === 'critical' && 'bg-purple-500/10 border-purple-500/30',
                                            level === 'low' && 'bg-orange-500/10 border-orange-500/30',
                                            level === 'ok' && 'bg-emerald-500/10 border-emerald-500/30',
                                        )}>
                                            {level === 'critical' ? (
                                                <AlertTriangle className="h-6 w-6 text-purple-400" />
                                            ) : level === 'low' ? (
                                                <AlertTriangle className="h-6 w-6 text-orange-400" />
                                            ) : (
                                                <Package className="h-6 w-6 text-emerald-400" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-semibold text-white truncate">{item.productName}</h3>
                                            <div className="flex items-baseline gap-2 mt-0.5">
                                                <p className={cn(
                                                    'text-2xl font-bold tabular-nums',
                                                    level === 'critical' && 'text-purple-400',
                                                    level === 'low' && 'text-orange-400',
                                                    level === 'ok' && 'text-white',
                                                )}>
                                                    {item.stock.toFixed(2)}
                                                </p>
                                                <p className="text-base text-slate-400">{item.unit}</p>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mt-3 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full transition-all duration-500',
                                                        level === 'critical' && 'bg-gradient-to-r from-purple-500 to-purple-400',
                                                        level === 'low' && 'bg-gradient-to-r from-orange-500 to-amber-400',
                                                        level === 'ok' && 'bg-gradient-to-r from-emerald-500 to-emerald-400',
                                                    )}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>

                                            {level === 'critical' && (
                                                <p className="text-sm text-purple-400 font-medium mt-2">Voorraad tekort — bestel bij</p>
                                            )}
                                            {level === 'low' && (
                                                <p className="text-sm text-orange-400 font-medium mt-2">Bijna op — bestel bij</p>
                                            )}
                                        </div>

                                        <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                                    </div>
                                </SpotlightCard>
                            );
                        })}
                    </div>
                ) : stock.length === 0 ? (
                    <SpotlightCard color="amber">
                        <EmptyState
                            icon={Boxes}
                            title="Geen voorraad gevonden"
                            description="Voeg een levering toe om uw voorraad bij te houden."
                            action={
                                <Button size="lg" onClick={() => setIsAddStockOpen(true)} className="h-12 text-base">
                                    <Plus className="h-5 w-5 mr-2" />
                                    Levering toevoegen
                                </Button>
                            }
                        />
                    </SpotlightCard>
                ) : (
                    <div className="text-center text-muted-foreground py-12 text-base">
                        Geen resultaten voor &quot;{searchTerm}&quot;.
                    </div>
                )}
            </div>

            {/* Mobile FAB */}
            <Button
                size="lg"
                onClick={() => setIsAddStockOpen(true)}
                className="fixed bottom-6 right-6 sm:hidden h-16 w-16 rounded-full shadow-2xl shadow-amber-500/30 bg-amber-500 hover:bg-amber-400 text-slate-900 z-40 p-0"
                aria-label="Levering toevoegen"
            >
                <Plus className="h-7 w-7" />
            </Button>

            <AddStockDialog
                open={isAddStockOpen}
                onOpenChange={setIsAddStockOpen}
                allProducts={allProducts}
                onStockAdded={handleStockAdded}
            />
        </>
    );
}
