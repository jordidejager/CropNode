
'use client';

import React, { useState, useTransition, useMemo, useEffect, useCallback, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, Parcel, LogStatus, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Trash2, CheckCircle, RefreshCcw, AlertTriangle, ShieldAlert, Loader2, Edit } from 'lucide-react';
import { deleteLogbookEntry, retryAnalysis, updateAndConfirmEntry, confirmLogbookEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getAllCtgbProducts } from '@/lib/store';
import { useFirestore } from '@/firebase';
import { InlineEditParcels } from './inline-edit-parcels';
import { InlineEditProducts } from './inline-edit-products';
import { InlineEditDate } from './inline-edit-date';
import { Skeleton } from './ui/skeleton';
import { Label } from './ui/label';
import { useDebounce } from '@/hooks/use-debounce';

const statusConfig: Record<LogStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon?: React.ElementType, label: string, colorClass: string }> = {
  'Nieuw': { variant: 'outline', label: 'Nieuw', colorClass: '' },
  'Analyseren...': { variant: 'secondary', label: 'Analyseren...', colorClass: '' },
  'Te Controleren': { variant: 'secondary', label: 'Te Controleren', colorClass: 'text-yellow-400', icon: AlertTriangle },
  'Waarschuwing': { variant: 'secondary', label: 'Waarschuwing', colorClass: 'text-yellow-400', icon: AlertTriangle },
  'Akkoord': { variant: 'default', label: 'Akkoord', colorClass: 'bg-green-600 text-primary-foreground', icon: CheckCircle },
  'Fout': { variant: 'destructive', label: 'Fout', colorClass: '', icon: AlertTriangle },
  'Afgekeurd': { variant: 'destructive', label: 'Afgekeurd', colorClass: '', icon: ShieldAlert },
};

const LogbookTableRow = ({
    entry,
    allParcels,
    allProducts,
    onDelete,
    onUpdate
}: {
    entry: LogbookEntry,
    allParcels: Parcel[],
    allProducts: string[],
    onDelete: (id: string) => void,
    onUpdate: () => void,
}) => {
    const [isSaving, startSaveTransition] = useTransition();
    const [isActionPending, startActionTransition] = useTransition();

    const [editedParcels, setEditedParcels] = useState<string[]>([]);
    const [editedProducts, setEditedProducts] = useState<ProductEntry[]>([]);
    const [editedDate, setEditedDate] = useState<Date | Timestamp | undefined>();
    
    // Store original state to compare against for changes
    const originalStateRef = useRef<{ parcels: string[], products: ProductEntry[] }>();
    
    const { toast } = useToast();

    // Determine if it's the initial load
    const isInitialLoad = useRef(true);

    // Sync state when entry changes
    useEffect(() => {
        if (entry.parsedData) {
            const parcels = entry.parsedData.plots || [];
            const products = entry.parsedData.products || [];
            setEditedParcels(parcels);
            setEditedProducts(products);
            originalStateRef.current = { parcels, products };
        }
        setEditedDate(entry.date);
        // After first sync, it's no longer the initial load
        isInitialLoad.current = true; 
        setTimeout(() => isInitialLoad.current = false, 500);

    }, [entry]);

    const hasChanged = useMemo(() => {
        if (!entry.parsedData || !editedDate || !originalStateRef.current) return false;
        
        const originalDate = entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date);
        const newDate = editedDate instanceof Timestamp ? editedDate.toDate() : new Date(editedDate);
        
        const dateChanged = originalDate.getTime() !== newDate.getTime();
        const parcelsChanged = JSON.stringify(originalStateRef.current.parcels.sort()) !== JSON.stringify(editedParcels.sort());
        const productsChanged = JSON.stringify(originalStateRef.current.products) !== JSON.stringify(editedProducts);

        return dateChanged || parcelsChanged || productsChanged;
    }, [entry, editedDate, editedParcels, editedProducts]);
    
    const debouncedState = useDebounce({ date: editedDate, parcels: editedParcels, products: editedProducts, hasChanged }, 500);

    // Auto-save effect
    useEffect(() => {
        // Don't save on initial render or if nothing has changed
        if (isInitialLoad.current || !debouncedState.hasChanged) {
            return;
        }

        const updatedEntry: LogbookEntry = {
            ...entry,
            date: debouncedState.date ? (debouncedState.date instanceof Timestamp ? debouncedState.date.toDate() : new Date(debouncedState.date)) : new Date(),
            createdAt: entry.createdAt,
            parsedData: {
                ...entry.parsedData!,
                plots: debouncedState.parcels,
                products: debouncedState.products
            }
        };

        startSaveTransition(async () => {
            const result = await updateAndConfirmEntry(updatedEntry, originalStateRef.current?.products || []);
            toast({
                title: 'Automatisch opgeslagen',
                description: 'De regel is opnieuw gevalideerd.',
            });
            onUpdate();
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedState]);


    const handleRetry = (entryId: string) => {
        startActionTransition(async () => {
            const result = await retryAnalysis(entryId);
            toast({ title: result.success ? 'Analyse gestart' : 'Opnieuw proberen mislukt', description: result.message });
            if (result.success) onUpdate();
        });
    }

    const handleConfirm = (entryId: string) => {
        startActionTransition(async () => {
            const result = await confirmLogbookEntry(entryId);
            toast({
                title: result.success ? 'Regel Bevestigd' : 'Bevestigen Mislukt',
                description: result.message,
                variant: result.success ? 'default' : 'destructive',
            });
            if (result.success) onUpdate();
        });
    };
    
    const config = statusConfig[entry.status] || statusConfig['Fout'];
    const isPending = isSaving || isActionPending;

    return (
        <>
            <TableRow data-state={isSaving ? 'selected' : undefined}>
                <TableCell className="min-w-[140px] text-muted-foreground text-sm align-top whitespace-pre-wrap">
                   <InlineEditDate date={editedDate} onDateChange={setEditedDate} />
                </TableCell>
                <TableCell className="align-top max-w-sm">
                    <p className="font-medium text-sm whitespace-pre-wrap break-words">
                        {entry.rawInput}
                    </p>
                    {entry.validationMessage && (
                        <p className={cn(
                            "text-xs mt-1",
                            entry.status === 'Afgekeurd' || entry.status === 'Fout' ? 'text-destructive' : 'text-yellow-400'
                        )} title={entry.validationMessage}>
                            {entry.validationMessage}
                        </p>
                    )}
                </TableCell>
                 <TableCell className="min-w-[200px] max-w-xs align-top whitespace-pre-wrap break-words">
                    {entry.parsedData ? (
                        <InlineEditParcels 
                            allParcels={allParcels}
                            selectedParcelIds={editedParcels}
                            onSelectionChange={setEditedParcels}
                        />
                    ) : '-'}
                </TableCell>
                <TableCell className="min-w-[300px] max-w-md align-top">
                     {entry.parsedData?.products && allProducts.length > 0 ? (
                        <InlineEditProducts
                            allProducts={allProducts}
                            selectedProducts={editedProducts}
                            onProductsChange={setEditedProducts}
                            isEditing={false} // Always use popover mode
                        />
                    ) : (entry.parsedData?.products ? <span className="whitespace-pre-wrap">{entry.parsedData.products.map(p => `${p.product} (${p.dosage} ${p.unit})`).join(', ')}</span> : '-')}
                </TableCell>
                <TableCell className="align-top">
                    <Badge
                        variant={config.variant}
                        className={cn('capitalize whitespace-nowrap', (entry.status === 'Analyseren...' || isSaving) && 'animate-pulse', config.colorClass)}
                    >
                        {isSaving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin"/> : (config.icon && <config.icon className="mr-1.5 h-3 w-3"/>)}
                        {isSaving ? 'Opslaan...' : config.label}
                    </Badge>
                </TableCell>
                <TableCell className="text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                       {entry.status === 'Fout' && (
                            <Button variant="ghost" size="icon" onClick={() => handleRetry(entry.id)} disabled={isPending} title="Opnieuw proberen" className="h-8 w-8">
                                <RefreshCcw className="h-4 w-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleConfirm(entry.id)} disabled={isPending || hasChanged} title="Bevestigen" className="h-8 w-8 text-green-500 hover:text-green-600 disabled:text-muted-foreground disabled:hover:text-muted-foreground">
                           <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(entry.id)} disabled={isPending} title="Verwijderen" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
        </>
    );
};

export function LogbookTable({ entries, allParcels, onEntryDeleted, onEntryConfirmed }: {
  entries: LogbookEntry[];
  allParcels: Parcel[];
  onEntryDeleted: (entryIds: string[]) => void;
  onEntryConfirmed: () => void;
}) {
  const [allProducts, setAllProducts] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', description: '', onConfirm: () => {} });
  const { toast } = useToast();
  const db = useFirestore();

  useEffect(() => {
    async function loadProducts() {
        if (db) {
            const products = await getAllCtgbProducts(db);
            setAllProducts(products.map(p => p.naam));
        }
    }
    loadProducts();
  }, [db]);
  
  const handleSingleDelete = (id: string) => {
    setAlertContent({
        title: `Weet u het zeker?`,
        description: `Deze actie kan niet ongedaan gemaakt worden. Dit zal deze logboekregel permanent verwijderen.`,
        onConfirm: () => {
          startTransition(async () => {
            await deleteLogbookEntry(id);
            toast({ title: `Regel verwijderd` });
            onEntryDeleted([id]);
          });
        }
    });
    setIsAlertOpen(true);
  }

  if (!entries || entries.length === 0) {
    return <p className="text-center text-muted-foreground py-10">Nog geen invoer in het logboek.</p>;
  }

  return (
      <div className="space-y-4">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Datum</TableHead>
                <TableHead className="w-full">Invoer</TableHead>
                <TableHead>Percelen</TableHead>
                <TableHead>Middelen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[150px] text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <LogbookTableRow
                  key={entry.id}
                  entry={entry}
                  allParcels={allParcels}
                  allProducts={allProducts}
                  onDelete={handleSingleDelete}
                  onUpdate={onEntryConfirmed}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{alertContent.title}</AlertDialogTitle>
                <AlertDialogDescription>{alertContent.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={() => { alertContent.onConfirm(); setIsAlertOpen(false); }} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
                  {isPending ? 'Verwerken...' : 'Doorgaan'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}
