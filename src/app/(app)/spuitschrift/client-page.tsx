
'use client';

import * as React from 'react';
import { SpuitschriftEntry, Parcel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { deleteSpuitschriftEntry, moveSpuitschriftEntryToLogbook } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return format(d, 'dd MMMM yyyy HH:mm', { locale: nl });
};

function ActionsMenu({ entry, onAction }: { entry: SpuitschriftEntry; onAction: () => void }) {
    const [isPendiing, startTransition] = React.useTransition();
    const [isAlertOpen, setIsAlertOpen] = React.useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const handleEdit = () => {
        startTransition(async () => {
            const result = await moveSpuitschriftEntryToLogbook(entry.id);
            if (result.success) {
                toast({ title: 'Regel verplaatst', description: result.message });
                onAction();
                router.push('/');
            } else {
                toast({ variant: 'destructive', title: 'Fout bij verplaatsen', description: result.message });
            }
        });
    };

    const handleDelete = () => {
        startTransition(async () => {
            await deleteSpuitschriftEntry(entry.id);
            toast({ title: 'Regel verwijderd', description: 'De registratie is permanent verwijderd.' });
            onAction();
        });
    };

    return (
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPendiing}>
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEdit}>
                        <Edit className="mr-2 h-4 w-4" />
                        Bewerken (terug naar logboek)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} asChild>
                         <AlertDialogAction asChild>
                             <button className="w-full text-red-500 relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Verwijderen
                            </button>
                        </AlertDialogAction>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de registratie permanent uit het spuitschrift verwijderen en de voorraadmutatie terugdraaien.
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

interface SpuitschriftClientPageProps {
    initialEntries: SpuitschriftEntry[];
    allParcels: Parcel[];
}

function ChronologicalView({ entries, allParcels, onAction }: { entries: SpuitschriftEntry[], allParcels: Parcel[], onAction: () => void }) {
    const calculateTotals = (entry: SpuitschriftEntry) => {
        const selectedParcels = allParcels.filter(p => entry.plots.includes(p.id));
        const totalArea = selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);

        const productsWithTotals = entry.products.map(product => ({
            ...product,
            totalUsed: (product.dosage * totalArea).toFixed(3)
        })) || [];

        return { selectedParcels, totalArea, productsWithTotals };
    };

    const generateProductSummary = (entry: SpuitschriftEntry) => {
        if (!entry.products || entry.products.length === 0) {
            return 'Geen middelen';
        }
        return entry.products.map(p => `${p.product} (${p.dosage} ${p.unit}/ha)`).join(', ');
    };
    
    return (
        <Accordion type="single" collapsible className="w-full">
            {entries.map(entry => {
                const { selectedParcels, totalArea, productsWithTotals } = calculateTotals(entry);
                const productSummary = generateProductSummary(entry);
                
                return (
                    <AccordionItem value={entry.id} key={entry.id}>
                        <AccordionTrigger>
                            <div className="flex justify-between items-center w-full pr-4">
                                <div className="text-left">
                                    <p className="font-semibold">{formatDate(entry.date)}</p>
                                    <p className="text-sm text-muted-foreground truncate max-w-xs md:max-w-md" title={productSummary}>
                                        {productSummary}
                                    </p>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm">{selectedParcels.length} perce{selectedParcels.length !== 1 ? 'len' : 'el'}</p>
                                    <p className="text-sm text-muted-foreground">{totalArea.toFixed(4)} ha</p>
                                </div>
                            </div>
                        </AccordionTrigger>
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
                                <h4 className="font-semibold mb-2">Middelen</h4>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Middel</TableHead>
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
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}

function ParcelHistoryView({ allParcels, initialEntries }: { allParcels: Parcel[], initialEntries: SpuitschriftEntry[] }) {
    const [selectedParcelId, setSelectedParcelId] = React.useState<string | null>(null);
    
    const history = React.useMemo(() => {
        if (!selectedParcelId) return [];

        return initialEntries
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
            .sort((a, b) => (b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime()) - (a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime()));
            
    }, [selectedParcelId, initialEntries]);
    
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
                    <p>Kies een perceel om de historie te bekijken.</p>
                </div>
            )}

            {selectedParcelId && history.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    <p>Geen bespuitingen gevonden voor dit perceel.</p>
                </div>
            )}

            {history.length > 0 && (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Middel</TableHead>
                                <TableHead className="text-right">Dosering</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.date instanceof Timestamp ? item.date.toDate() : item.date, 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="font-medium">{item.product}</TableCell>
                                    <TableCell className="text-right">{item.dosage} {item.unit}/ha</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}

export function SpuitschriftClientPage({ initialEntries, allParcels }: SpuitschriftClientPageProps) {
    const router = useRouter();

    if (initialEntries.length === 0 && allParcels.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Spuitschrift</CardTitle>
                    <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-muted-foreground py-10">
                        <p>Er zijn nog geen bevestigde bespuitingen of percelen gevonden.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const handleAction = () => {
        router.refresh();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Spuitschrift</CardTitle>
                <CardDescription>Overzicht van alle definitief geregistreerde bespuitingen, chronologisch of per perceel.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="chronological">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="chronological">Chronologisch</TabsTrigger>
                        <TabsTrigger value="by_parcel">Per Perceel</TabsTrigger>
                    </TabsList>
                    <TabsContent value="chronological" className="mt-6">
                        {initialEntries.length > 0 ? (
                           <ChronologicalView entries={initialEntries} allParcels={allParcels} onAction={handleAction} />
                        ) : (
                             <div className="text-center text-muted-foreground py-10">
                                <p>Er zijn nog geen bevestigde bespuitingen in het logboek gevonden.</p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="by_parcel" className="mt-6">
                       <ParcelHistoryView allParcels={allParcels} initialEntries={initialEntries} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
