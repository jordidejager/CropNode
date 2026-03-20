'use client';

import * as React from 'react';
import { useFertilizationEntries, useSpuitschriftEntries, useParcels, useInvalidateQueries } from '@/hooks/use-data';
import { SpuitschriftEntry, ProductEntry } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import { isTankmixEntry } from '@/lib/fertilization-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Leaf, CalendarIcon, Search, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { deleteSpuitschriftEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { SpuitschriftSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { CropIcon } from '@/components/ui/crop-icon';

const formatDate = (date: Date) => {
    return format(date, 'dd MMMM yyyy HH:mm', { locale: nl });
};

// ============================================
// Actions Menu Component
// ============================================

function ActionsMenu({ entry, onAction }: { entry: SpuitschriftEntry; onAction: () => void }) {
    const [isPending, startTransition] = React.useTransition();
    const [isAlertOpen, setIsAlertOpen] = React.useState(false);
    const { toast } = useToast();
    const { invalidateSpuitschrift, invalidateInventory } = useInvalidateQueries();

    const handleDelete = () => {
        startTransition(async () => {
            await deleteSpuitschriftEntry(entry.id);
            toast({ title: 'Regel verwijderd', description: 'De bemestingsregistratie is verwijderd.' });
            invalidateSpuitschrift();
            invalidateInventory();
            onAction();
        });
    };

    return (
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                            e.preventDefault();
                            setIsAlertOpen(true);
                        }}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Verwijderen
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de bemestingsregistratie permanent verwijderen.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Verwijderen
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ============================================
// Fertilization Entry Card Component
// ============================================

interface FertilizationEntryCardProps {
    entry: SpuitschriftEntry;
    allParcels: SprayableParcel[];
    isTankmix: boolean;
    onAction: () => void;
}

function FertilizationEntryCard({ entry, allParcels, isTankmix, onAction }: FertilizationEntryCardProps) {
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
        if (!entry.products || entry.products.length === 0) {
            return 'Geen meststoffen';
        }
        return entry.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };

    return (
        <AccordionItem value={entry.id}>
            <div className="flex items-center">
                <AccordionTrigger className="flex-1">
                    <div className="flex justify-between items-center w-full pr-4">
                        <div className="flex items-center gap-2 text-left">
                            <CropIcon parcels={selectedParcels} />
                            <div>
                                <p className="font-semibold">{formatDate(entry.date)}</p>
                                <p className="text-sm text-muted-foreground truncate max-w-xs md:max-w-md" title={generateProductSummary()}>
                                    {generateProductSummary()}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {isTankmix && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                                    Tankmix
                                </Badge>
                            )}
                            {entry.registrationType === 'spreading' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400">
                                    Strooien
                                </Badge>
                            )}
                            <div className="text-right hidden sm:block">
                                <p className="text-sm">{selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}</p>
                                <p className="text-sm text-muted-foreground">{totalArea.toFixed(4)} ha</p>
                            </div>
                        </div>
                    </div>
                </AccordionTrigger>
                <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsDeleteAlertOpen(true);
                        }}
                        disabled={isDeleting}
                        title="Verwijderen"
                    >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Bemesting verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Weet je zeker dat je de bemestingsregistratie van {formatDate(entry.date)} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDirectDelete} className="bg-destructive hover:bg-destructive/90">
                                Verwijderen
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
            <AccordionContent className="px-4 pt-2 pb-4 space-y-4 bg-muted/50 rounded-b-md">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-semibold mb-2">Percelen ({totalArea.toFixed(4)} ha totaal)</h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                            {selectedParcels.map(p => (
                                <div key={p.id} className="flex justify-between">
                                    <span>{p.name} <span className="text-xs">({p.variety})</span></span>
                                    <span className="ml-4">{p.area ? p.area.toFixed(4) : '0.0000'} ha</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <ActionsMenu entry={entry} onAction={onAction} />
                </div>
                <div>
                    <h4 className="font-semibold mb-2">Meststoffen</h4>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Meststof</TableHead>
                                    <TableHead className="text-right">Dosering per ha</TableHead>
                                    <TableHead className="text-right">Totaal Gebruikt</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {productsWithTotals.map((p, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{p.product}</TableCell>
                                        <TableCell className="text-right">{p.dosage} {p.unit}/ha</TableCell>
                                        <TableCell className="text-right">{p.totalUsed} {p.unit}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                {isTankmix && (
                    <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30 text-sm">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span className="text-muted-foreground">
                                Deze registratie bevat ook gewasbeschermingsmiddelen. Die zijn zichtbaar in het <strong>Spuitschrift</strong>.
                            </span>
                        </div>
                    </div>
                )}
            </AccordionContent>
        </AccordionItem>
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
    // We need the original (unfiltered) entries to detect tankmix
    const tankmixIds = React.useMemo(() => {
        const ids = new Set<string>();
        for (const entry of originalEntries) {
            if (isTankmixEntry(entry)) {
                ids.add(entry.id);
            }
        }
        return ids;
    }, [originalEntries]);

    return (
        <Accordion type="single" collapsible className="w-full">
            {entries.map(entry => (
                <FertilizationEntryCard
                    key={entry.id}
                    entry={entry}
                    allParcels={allParcels}
                    isTankmix={tankmixIds.has(entry.id)}
                    onAction={onAction}
                />
            ))}
        </Accordion>
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
        <div className="space-y-4">
            <Select onValueChange={setSelectedParcelId}>
                <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Kies een perceel om de historie te zien" />
                </SelectTrigger>
                <SelectContent>
                    {allParcels.map(parcel => (
                        <SelectItem key={parcel.id} value={parcel.id}>
                            {parcel.name} ({parcel.variety})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!selectedParcelId && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Kies een perceel om de bemestingshistorie te bekijken.</p>
                </div>
            )}

            {selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Geen bemestingen gevonden voor dit perceel.</p>
                </div>
            )}

            {history.length > 0 && (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Meststof</TableHead>
                                <TableHead className="text-right">Dosering</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.date, 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.dosage} {item.unit}/ha</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
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

    // Raw spuitschrift entries to detect tankmix (same cache, no extra fetch)
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

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Bemestingsregister</CardTitle>
                    <CardDescription>Overzicht van alle bemestingsregistraties.</CardDescription>
                </CardHeader>
                <CardContent>
                    <SpuitschriftSkeleton />
                </CardContent>
            </Card>
        );
    }

    if (isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Bemestingsregister</CardTitle>
                    <CardDescription>Overzicht van alle bemestingsregistraties.</CardDescription>
                </CardHeader>
                <CardContent>
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
        );
    }

    if (entries.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Bemestingsregister</CardTitle>
                    <CardDescription>Overzicht van alle bemestingsregistraties.</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmptyState
                        icon={Leaf}
                        title="Geen bemestingen gevonden"
                        description="Er zijn nog geen bevestigde bemestingen gevonden. Voer bemestingen in via de Slimme Invoer — meststoffen worden automatisch herkend."
                    />
                </CardContent>
            </Card>
        );
    }

    const handleAction = () => {
        refetchEntries();
    };

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Bemestingsregister</CardTitle>
                    <CardDescription>Overzicht van alle bevestigde bemestingen, chronologisch of per perceel.</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="chronological">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="chronological">Chronologisch</TabsTrigger>
                        <TabsTrigger value="by_parcel">Per Perceel</TabsTrigger>
                    </TabsList>
                    <TabsContent value="chronological" className="mt-6">
                        <ChronologicalView
                            entries={entries}
                            allParcels={allParcels}
                            originalEntries={rawEntries}
                            onAction={handleAction}
                        />
                    </TabsContent>
                    <TabsContent value="by_parcel" className="mt-6">
                        <ParcelHistoryView allParcels={allParcels} entries={entries} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
