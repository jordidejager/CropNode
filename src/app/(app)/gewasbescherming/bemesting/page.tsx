'use client';

import * as React from 'react';
import { useFertilizationEntries, useSpuitschriftEntries, useParcels, useInvalidateQueries } from '@/hooks/use-data';
import { SpuitschriftEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import { isTankmixEntry } from '@/lib/fertilization-utils';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Leaf, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { deleteSpuitschriftEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { SpuitschriftSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { CropIcon } from '@/components/ui/crop-icon';
import { SectionHeader, SpotlightCard, GlowOrb } from '@/components/ui/premium';
import { AnimatePresence, motion } from 'framer-motion';

const formatDate = (date: Date) => {
    return format(date, 'dd MMMM yyyy \'om\' HH:mm', { locale: nl });
};

// ============================================
// Fertilization Entry Card (SpotlightCard variant)
// ============================================

interface FertilizationEntryCardProps {
    entry: SpuitschriftEntry;
    allParcels: SprayableParcel[];
    isTankmix: boolean;
    onAction: () => void;
}

function FertilizationEntryCard({ entry, allParcels, isTankmix, onAction }: FertilizationEntryCardProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const selectedParcels = allParcels.filter(p => entry.plots.includes(p.id));
    const totalArea = selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);
    const { toast } = useToast();
    const { invalidateSpuitschrift, invalidateInventory } = useInvalidateQueries();
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = React.useState(false);
    const [isDeleting, startDeleteTransition] = React.useTransition();

    const handleDirectDelete = () => {
        startDeleteTransition(async () => {
            await deleteSpuitschriftEntry(entry.id);
            toast({ title: 'Bemesting verwijderd', description: 'De bemestingsregistratie is permanent verwijderd.' });
            invalidateSpuitschrift();
            invalidateInventory();
            onAction();
        });
    };

    const productsWithTotals = entry.products.map(product => ({
        ...product,
        totalUsed: (product.dosage * totalArea).toFixed(3)
    }));

    const generateProductSummary = () => {
        if (!entry.products || entry.products.length === 0) return 'Geen meststoffen';
        return entry.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };

    return (
        <SpotlightCard color="lime" padding="p-0">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-start gap-4 p-5 text-left focus-visible:outline-none focus-visible:bg-lime-500/5 transition-colors"
            >
                <div className="shrink-0 pt-0.5">
                    <CropIcon parcels={selectedParcels} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <p className="font-semibold text-lg text-white">{formatDate(entry.date)}</p>
                        {isTankmix && (
                            <Badge variant="outline" className="text-xs px-2.5 py-1 bg-blue-500/10 border-blue-500/30 text-blue-400">
                                Tankmix
                            </Badge>
                        )}
                        {entry.registrationType === 'spreading' && (
                            <Badge variant="outline" className="text-xs px-2.5 py-1 bg-teal-500/10 border-teal-500/30 text-teal-400">
                                Strooien
                            </Badge>
                        )}
                    </div>
                    {entry.products && entry.products.length > 0 ? (
                        <div className="space-y-1" title={generateProductSummary()}>
                            {(isExpanded ? entry.products : entry.products.slice(0, 2)).map((p, i) => (
                                <div key={i} className="flex items-baseline gap-2 text-sm">
                                    <span className="w-1 h-1 rounded-full bg-lime-500/40 shrink-0 translate-y-[-3px]" aria-hidden />
                                    <span className="text-slate-200 font-medium truncate">{p.product}</span>
                                    <span className="text-slate-500 tabular-nums shrink-0">{p.dosage} {p.unit}/ha</span>
                                </div>
                            ))}
                            {entry.products.length > 2 && !isExpanded && (
                                <div className="flex items-baseline gap-2 text-sm pt-0.5">
                                    <span className="w-1 h-1 shrink-0" aria-hidden />
                                    <span className="text-lime-400/90 font-semibold">
                                        + {entry.products.length - 2} {entry.products.length - 2 === 1 ? 'andere meststof' : 'andere meststoffen'}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">Geen meststoffen</p>
                    )}
                </div>
                <div className="hidden sm:flex flex-col items-end text-right mr-2 pt-0.5 shrink-0">
                    <p className="text-sm text-slate-300 font-medium">
                        {selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}
                    </p>
                    <p className="text-sm text-slate-500">{totalArea.toFixed(2)} ha</p>
                </div>
                <ChevronDown
                    className={cn(
                        'h-5 w-5 text-slate-400 transition-transform duration-300 shrink-0 mt-1',
                        isExpanded && 'rotate-180',
                    )}
                />
            </button>

            {!isExpanded && (
                <div className="flex gap-2 px-5 pb-4 pt-0">
                    <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-11 text-base border-white/10 text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteAlertOpen(true);
                            }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Trash2 className="h-5 w-5 mr-2" />}
                            Verwijderen
                        </Button>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Bemesting verwijderen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Weet je zeker dat je de bemestingsregistratie van {formatDate(entry.date)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="h-11 text-base">Annuleren</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDirectDelete} className="h-11 text-base bg-destructive hover:bg-destructive/90">
                                    Verwijderen
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-4 space-y-5 border-t border-white/[0.06]">
                            <div>
                                <h4 className="font-semibold text-base mb-2 text-white">Percelen ({totalArea.toFixed(2)} ha totaal)</h4>
                                <div className="text-sm text-slate-400 space-y-1.5">
                                    {selectedParcels.map(p => (
                                        <div key={p.id} className="flex justify-between gap-4">
                                            <span>{p.name} <span className="text-slate-500">({p.variety})</span></span>
                                            <span className="tabular-nums shrink-0">{p.area ? p.area.toFixed(2) : '0.00'} ha</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-semibold text-base mb-2 text-white">Meststoffen</h4>
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-white/10 hover:bg-transparent">
                                                <TableHead className="text-sm">Meststof</TableHead>
                                                <TableHead className="text-sm text-right">Dosering per ha</TableHead>
                                                <TableHead className="text-sm text-right">Totaal Gebruikt</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {productsWithTotals.map((p, index) => (
                                                <TableRow key={index} className="border-white/[0.06]">
                                                    <TableCell className="font-medium text-base">{p.product}</TableCell>
                                                    <TableCell className="text-right text-base tabular-nums">{p.dosage} {p.unit}/ha</TableCell>
                                                    <TableCell className="text-right text-base tabular-nums">{p.totalUsed} {p.unit}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            {isTankmix && (
                                <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30 text-base">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-blue-400" />
                                        <span className="text-slate-300">
                                            Deze registratie bevat ook gewasbeschermingsmiddelen. Die zijn zichtbaar in het <strong className="text-white">Spuitschrift</strong>.
                                        </span>
                                    </div>
                                </div>
                            )}

                            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="h-11 text-base border-white/10 text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                                    onClick={() => setIsDeleteAlertOpen(true)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Trash2 className="h-5 w-5 mr-2" />}
                                    Verwijderen
                                </Button>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Bemesting verwijderen?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Weet je zeker dat je de bemestingsregistratie van {formatDate(entry.date)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="h-11 text-base">Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDirectDelete} className="h-11 text-base bg-destructive hover:bg-destructive/90">
                                            Verwijderen
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </SpotlightCard>
    );
}

// ============================================
// Chronological View Component
// ============================================

function ChronologicalView({ entries, allParcels, originalEntries, onAction }: {
    entries: SpuitschriftEntry[];
    allParcels: SprayableParcel[];
    originalEntries: SpuitschriftEntry[];
    onAction: () => void;
}) {
    const tankmixIds = React.useMemo(() => {
        const ids = new Set<string>();
        for (const entry of originalEntries) {
            if (isTankmixEntry(entry)) ids.add(entry.id);
        }
        return ids;
    }, [originalEntries]);

    return (
        <div className="space-y-3">
            {entries.map(entry => (
                <FertilizationEntryCard
                    key={entry.id}
                    entry={entry}
                    allParcels={allParcels}
                    isTankmix={tankmixIds.has(entry.id)}
                    onAction={onAction}
                />
            ))}
        </div>
    );
}

// ============================================
// Parcel History View Component
// ============================================

function ParcelHistoryView({ allParcels, entries }: { allParcels: SprayableParcel[], entries: SpuitschriftEntry[] }) {
    const [selectedParcelId, setSelectedParcelId] = React.useState<string | null>(null);

    const history = React.useMemo(() => {
        if (!selectedParcelId) return [];

        return entries
            .filter(entry => entry.plots.includes(selectedParcelId))
            .flatMap(entry =>
                entry.products.map(product => ({
                    id: `${entry.id}-${product.product}`,
                    date: entry.date,
                    product: product.product,
                    dosage: product.dosage,
                    unit: product.unit,
                }))
            )
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedParcelId, entries]);

    return (
        <div className="space-y-5">
            <Select onValueChange={setSelectedParcelId}>
                <SelectTrigger className="w-full md:w-[360px] h-12 text-base">
                    <SelectValue placeholder="Kies een perceel om de historie te zien" />
                </SelectTrigger>
                <SelectContent>
                    {allParcels.map(parcel => (
                        <SelectItem key={parcel.id} value={parcel.id} className="text-base py-3">
                            {parcel.name} ({parcel.variety})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!selectedParcelId && (
                <div className="text-center text-muted-foreground py-12 text-base">
                    <p>Kies een perceel om de bemestingshistorie te bekijken.</p>
                </div>
            )}

            {selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-12 text-base">
                    <p>Geen bemestingen gevonden voor dit perceel.</p>
                </div>
            )}

            {history.length > 0 && (
                <SpotlightCard color="lime" padding="p-0" disableSpotlight>
                    <div className="rounded-2xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-sm px-5">Datum</TableHead>
                                    <TableHead className="text-sm">Meststof</TableHead>
                                    <TableHead className="text-sm text-right px-5">Dosering</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map(item => (
                                    <TableRow key={item.id} className="border-white/[0.06]">
                                        <TableCell className="text-base px-5">{format(item.date, 'dd-MM-yyyy')}</TableCell>
                                        <TableCell className="font-medium text-base">{item.product}</TableCell>
                                        <TableCell className="text-right text-base tabular-nums px-5">{item.dosage} {item.unit}/ha</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </SpotlightCard>
            )}
        </div>
    );
}

// ============================================
// Main Page Component
// ============================================

export default function BemestingsregisterPage() {
    const {
        data: entries = [],
        isLoading: isLoadingEntries,
        isError: isErrorEntries,
        error: errorEntries,
        refetch: refetchEntries
    } = useFertilizationEntries();

    const { data: rawEntries = [] } = useSpuitschriftEntries();

    const {
        data: allParcels = [],
        isLoading: isLoadingParcels,
        isError: isErrorParcels,
        error: errorParcels,
        refetch: refetchParcels
    } = useParcels();

    const isLoading = isLoadingEntries || isLoadingParcels;
    const isError = isErrorEntries || isErrorParcels;

    const currentYear = new Date().getFullYear();
    const entriesThisYear = entries.filter(e => new Date(e.date).getFullYear() === currentYear).length;

    const header = (
        <SectionHeader
            eyebrow="Bemesting"
            title="Bemestingsregister"
            titleGradient={entries.length > 0 ? `${entriesThisYear} in ${currentYear}` : undefined}
            description="Alle bevestigde bemestingen en strooiregistraties — chronologisch of per perceel."
            color="lime"
        />
    );

    if (isLoading) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="lime" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <SpuitschriftSkeleton />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="lime" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState
                            title="Kon bemestingsregister niet laden"
                            message={errorEntries?.message || errorParcels?.message || 'Er is een fout opgetreden.'}
                            onRetry={() => {
                                refetchEntries();
                                refetchParcels();
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="lime" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <SpotlightCard color="lime">
                    <EmptyState
                        icon={Leaf}
                        title="Geen bemestingen gevonden"
                        description="Er zijn nog geen bevestigde bemestingen gevonden. Voer bemestingen in via de Slimme Invoer — meststoffen worden automatisch herkend."
                    />
                </SpotlightCard>
            </div>
        );
    }

    const handleAction = () => {
        refetchEntries();
    };

    return (
        <div className="relative space-y-8">
            <GlowOrb color="lime" position="top-left" size="w-[500px] h-[320px]" blur="blur-[140px]" opacity={0.07} />
            <GlowOrb color="green" position="top-right" size="w-[360px] h-[260px]" blur="blur-[140px]" opacity={0.04} />

            {header}

            <Tabs defaultValue="chronological" className="space-y-6">
                <TabsList className="h-12 p-1 bg-white/[0.04] border border-white/10">
                    <TabsTrigger value="chronological" className="h-10 px-6 text-base data-[state=active]:bg-lime-500/15 data-[state=active]:text-lime-400">
                        Chronologisch
                    </TabsTrigger>
                    <TabsTrigger value="by_parcel" className="h-10 px-6 text-base data-[state=active]:bg-lime-500/15 data-[state=active]:text-lime-400">
                        Per perceel
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="chronological" className="mt-0">
                    <ChronologicalView
                        entries={entries}
                        allParcels={allParcels}
                        originalEntries={rawEntries}
                        onAction={handleAction}
                    />
                </TabsContent>
                <TabsContent value="by_parcel" className="mt-0">
                    <ParcelHistoryView allParcels={allParcels} entries={entries} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
