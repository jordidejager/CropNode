'use client';

import * as React from 'react';
import { Plus, Filter, Loader2, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
    useBatches,
    useBatchSeasons,
    useCreateBatch,
} from '@/hooks/use-data';
import { BatchCard } from '@/components/afzetstromen/batch-card';
import { BatchFormDialog } from '@/components/afzetstromen/batch-form-dialog';
import { SorteerrapportUploadButton } from '@/components/afzetstromen/sorteerrapport-upload-button';
import { STATUS_LABELS } from '@/components/afzetstromen/constants';
import type { BatchInput, BatchStatus } from '@/lib/types';

const ALL_SEASONS = '__all_seasons__';
const ALL_STATUSES = '__all_statuses__';

export default function AfzetstromenOverzichtPage() {
    const { toast } = useToast();

    const [selectedSeason, setSelectedSeason] = React.useState<string>(ALL_SEASONS);
    const [selectedStatus, setSelectedStatus] = React.useState<string>(ALL_STATUSES);
    const [search, setSearch] = React.useState('');
    const [debouncedSearch, setDebouncedSearch] = React.useState('');
    const [isFormOpen, setIsFormOpen] = React.useState(false);

    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(t);
    }, [search]);

    const { data: seasons = [] } = useBatchSeasons();
    const { data: batches = [], isLoading } = useBatches({
        season: selectedSeason !== ALL_SEASONS ? selectedSeason : undefined,
        status: selectedStatus !== ALL_STATUSES ? (selectedStatus as BatchStatus) : undefined,
        search: debouncedSearch || undefined,
    });

    const createMutation = useCreateBatch();

    const handleCreate = async (data: BatchInput) => {
        try {
            await createMutation.mutateAsync(data);
            toast({
                title: 'Partij aangemaakt',
                description: 'De nieuwe partij is klaar voor events.',
            });
            setIsFormOpen(false);
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er is een fout opgetreden.',
                variant: 'destructive',
            });
        }
    };

    const totals = React.useMemo(() => {
        return batches.reduce(
            (acc, b) => ({
                count: acc.count + 1,
                revenue: acc.revenue + (b.totalRevenueEur ?? 0),
                margin: acc.margin + (b.marginEur ?? 0),
            }),
            { count: 0, revenue: 0, margin: 0 }
        );
    }, [batches]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <CardTitle>Afzetstromen</CardTitle>
                    <CardDescription>
                        Beheer post-oogst: transport, sortering, afzet en koelcel-bewegingen per partij.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <SorteerrapportUploadButton />
                    <Button
                        onClick={() => setIsFormOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nieuwe partij
                    </Button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Zoek op label…"
                        className="pl-9"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Seizoen" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_SEASONS}>Alle seizoenen</SelectItem>
                            {seasons.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-[170px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_STATUSES}>Alle statussen</SelectItem>
                        {(Object.keys(STATUS_LABELS) as BatchStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Totals chip */}
                {batches.length > 0 && (
                    <div className="ml-auto flex items-center gap-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[12px]">
                        <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                Partijen
                            </span>
                            <div className="text-white font-semibold">{totals.count}</div>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                Totaal marge
                            </span>
                            <div
                                className={
                                    totals.margin >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'
                                }
                            >
                                {new Intl.NumberFormat('nl-NL', {
                                    style: 'currency',
                                    currency: 'EUR',
                                    maximumFractionDigits: 0,
                                }).format(totals.margin)}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/10 rounded-lg">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <Package className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Nog geen partijen</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                        Partijen ontstaan automatisch uit oogstregistraties, door een sorteerrapport te
                        uploaden, of handmatig voor gemengde voorraad.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <SorteerrapportUploadButton />
                        <Button
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => setIsFormOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Handmatig aanmaken
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {batches.map((batch) => (
                        <BatchCard key={batch.id} batch={batch} />
                    ))}
                </div>
            )}

            <BatchFormDialog
                open={isFormOpen}
                onOpenChange={setIsFormOpen}
                onSubmit={handleCreate}
                isSubmitting={createMutation.isPending}
            />
        </div>
    );
}
