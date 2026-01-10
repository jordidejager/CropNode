
'use client';

import React, { useState, useTransition, useMemo, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, Parcel, LogStatus, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Trash2, CheckCircle, RefreshCcw, AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { deleteLogbookEntries, confirmLogbookEntries, retryAnalysis, updateAndConfirmEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
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

const statusConfig: Record<LogStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon?: React.ElementType, label: string, colorClass: string }> = {
  'Nieuw': { variant: 'outline', label: 'Nieuw', colorClass: '' },
  'Analyseren...': { variant: 'secondary', label: 'Analyseren...', colorClass: '' },
  'Te Controleren': { variant: 'secondary', label: 'Te Controleren', colorClass: 'text-yellow-400', icon: AlertTriangle },
  'Waarschuwing': { variant: 'secondary', label: 'Waarschuwing', colorClass: 'text-yellow-400', icon: AlertTriangle },
  'Akkoord': { variant: 'default', label: 'Akkoord', colorClass: 'bg-green-600 text-primary-foreground', icon: CheckCircle },
  'Fout': { variant: 'destructive', label: 'Fout', colorClass: '', icon: AlertTriangle },
  'Afgekeurd': { variant: 'destructive', label: 'Afgekeurd', colorClass: '', icon: ShieldAlert },
};

const formatDate = (date: Date | Timestamp | undefined) => {
  if (!date) return '';
  const validDate = date instanceof Timestamp ? date.toDate() : new Date(date);
  try {
    return format(validDate, 'dd-MM-yyyy HH:mm');
  } catch {
    return 'Ongeldige datum';
  }
}

interface LogbookTableProps {
  entries: LogbookEntry[];
  allParcels: Parcel[];
  onEntryDeleted: (entryIds: string[]) => void;
  onEntryConfirmed: () => void;
}

const LogbookTableRow = ({
    entry,
    allParcels,
    onSelectRow,
    isSelected,
    allProducts,
    onDelete
}: {
    entry: LogbookEntry,
    allParcels: Parcel[],
    onSelectRow: (id: string) => void,
    isSelected: boolean,
    allProducts: string[],
    onDelete: (id: string) => void
}) => {
    const [isPending, startTransition] = useTransition();
    const [editedParcels, setEditedParcels] = useState<string[]>(entry.parsedData?.plots || []);
    const [editedProducts, setEditedProducts] = useState<ProductEntry[]>(entry.parsedData?.products || []);
    const [editedDate, setEditedDate] = useState<Date | undefined>(() => {
        if (!entry.date) return undefined;
        return entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date);
    });
    const { toast } = useToast();

    const config = statusConfig[entry.status] || statusConfig['Fout'];

    // Check if row is editable (not analyzing)
    const isEditable = entry.status !== 'Analyseren...' && entry.parsedData;

    // Sync state when entry changes (e.g., after save)
    useEffect(() => {
        setEditedParcels(entry.parsedData?.plots || []);
        setEditedProducts(entry.parsedData?.products || []);
        if (entry.date) {
            setEditedDate(entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date));
        }
    }, [entry]);

    // Check if there are unsaved changes
    const hasChanges = useMemo(() => {
        if (!entry.parsedData) return false;

        const parcelsChanged = JSON.stringify(editedParcels.sort()) !== JSON.stringify((entry.parsedData.plots || []).sort());
        const productsChanged = JSON.stringify(editedProducts) !== JSON.stringify(entry.parsedData.products || []);

        const originalDate = entry.date instanceof Timestamp ? entry.date.toDate() : entry.date ? new Date(entry.date) : undefined;
        const dateChanged = editedDate?.getTime() !== originalDate?.getTime();

        return parcelsChanged || productsChanged || dateChanged;
    }, [editedParcels, editedProducts, editedDate, entry.parsedData, entry.date]);

    const handleRetry = (entryId: string) => {
        startTransition(async () => {
            const result = await retryAnalysis(entryId);
            if (result.success) {
                toast({ title: 'Analyse gestart', description: 'De invoer wordt opnieuw geanalyseerd.' });
            } else {
                toast({ variant: 'destructive', title: 'Opnieuw proberen mislukt', description: result.message });
            }
        });
    }

    const handleSave = useCallback(() => {
        if (!entry.parsedData) return;

        const updatedEntry: LogbookEntry = {
            ...entry,
            date: editedDate ?? entry.date,
            parsedData: {
                ...entry.parsedData,
                plots: editedParcels,
                products: editedProducts
            }
        };

        startTransition(async () => {
            const result = await updateAndConfirmEntry(updatedEntry, entry.parsedData?.products || []);
            toast({
                title: result.entry?.status === 'Akkoord' ? 'Opgeslagen!' : 'Bijgewerkt',
                description: result.message,
            });
        });
    }, [entry, editedParcels, editedProducts, editedDate, toast]);

    return (
        <TableRow data-state={isSelected ? 'selected' : undefined}>
            <TableCell>
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onSelectRow(entry.id)}
                    aria-label={`Selecteer rij ${entry.id}`}
                    disabled={entry.status === 'Analyseren...'}
                />
            </TableCell>
            <TableCell className="min-w-[180px]">
                {isEditable ? (
                    <InlineEditDate
                        date={editedDate}
                        onDateChange={setEditedDate}
                    />
                ) : (
                    <span className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(entry.date)}
                    </span>
                )}
            </TableCell>
            <TableCell>
                <p className="truncate max-w-[150px] font-medium text-sm" title={entry.rawInput}>
                    {entry.rawInput}
                </p>
                {entry.validationMessage && (
                    <p className={cn(
                        "text-xs truncate max-w-[150px]",
                        entry.status === 'Afgekeurd' ? 'text-destructive' : 'text-yellow-400'
                    )} title={entry.validationMessage}>
                        {entry.validationMessage}
                    </p>
                )}
            </TableCell>
            <TableCell className="min-w-[200px]">
                {isEditable ? (
                    <InlineEditParcels
                        allParcels={allParcels}
                        selectedParcelIds={editedParcels}
                        onSelectionChange={setEditedParcels}
                    />
                ) : (
                    <span className="text-sm text-muted-foreground">
                        {entry.parsedData?.plots?.map(id =>
                            allParcels.find(p => p.id === id)?.name || id
                        ).join(', ') || '-'}
                    </span>
                )}
            </TableCell>
            <TableCell className="min-w-[280px]">
                {isEditable && allProducts.length > 0 ? (
                    <InlineEditProducts
                        allProducts={allProducts}
                        selectedProducts={editedProducts}
                        onProductsChange={setEditedProducts}
                    />
                ) : allProducts.length === 0 && isEditable ? (
                    <Skeleton className="h-8 w-full" />
                ) : (
                    <span className="text-sm text-muted-foreground">
                        {entry.parsedData?.products?.map(p =>
                            `${p.product} (${p.dosage} ${p.unit})`
                        ).join(', ') || '-'}
                    </span>
                )}
            </TableCell>
            <TableCell>
                <Badge
                    variant={config.variant}
                    className={cn('capitalize whitespace-nowrap', entry.status === 'Analyseren...' && 'animate-pulse', config.colorClass)}
                >
                    {config.icon && <config.icon className="mr-1.5 h-3 w-3"/>}
                    {config.label}
                </Badge>
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    {entry.status === 'Fout' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRetry(entry.id)}
                            disabled={isPending}
                            title="Opnieuw proberen"
                            className="h-8 w-8"
                        >
                            <RefreshCcw className="h-4 w-4" />
                        </Button>
                    )}
                    {isEditable && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSave}
                            disabled={isPending}
                            title="Bevestigen"
                            className="h-8 w-8 text-green-600 hover:text-green-600"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(entry.id)}
                        disabled={isPending || entry.status === 'Analyseren...'}
                        title="Verwijderen"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
};

export function LogbookTable({ entries, allParcels, onEntryDeleted, onEntryConfirmed }: LogbookTableProps) {
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
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

  const handleSelectRow = (id: string) => {
    setSelectedRowIds(prev =>
        prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean | string) => {
    const selectableIds = entries.filter(e => e.status !== 'Analyseren...').map(e => e.id);
    if (checked) {
        setSelectedRowIds(selectableIds);
    } else {
        setSelectedRowIds([]);
    }
  };

  const numSelected = selectedRowIds.length;
  const canConfirmSelection = useMemo(() => {
    if (selectedRowIds.length === 0) return false;
    return selectedRowIds.every(id => {
      const entry = entries.find(e => e.id === id);
      return entry && (entry.status === 'Te Controleren' || entry.status === 'Waarschuwing') && !entry.validationMessage?.includes('overschrijdt');
    });
  }, [selectedRowIds, entries]);


  const handleSingleDelete = (id: string) => {
    setAlertContent({
        title: `Weet u het zeker?`,
        description: `Deze actie kan niet ongedaan gemaakt worden. Dit zal deze logboekregel permanent verwijderen.`,
        onConfirm: () => {
          startTransition(async () => {
            await deleteLogbookEntries([id]);
            toast({ title: `Regel verwijderd` });
            onEntryDeleted([id]);
            setSelectedRowIds(prev => prev.filter(rowId => rowId !== id));
          });
        }
    });
    setIsAlertOpen(true);
  }

  const bulkDelete = () => {
    setAlertContent({
        title: `Weet u het zeker?`,
        description: `Deze actie kan niet ongedaan gemaakt worden. Dit zal ${numSelected} logboekregel(s) permanent verwijderen.`,
        onConfirm: () => {
          startTransition(async () => {
            await deleteLogbookEntries(selectedRowIds);
            toast({ title: `${numSelected} regel(s) verwijderd` });
            onEntryDeleted(selectedRowIds);
            setSelectedRowIds([]);
          });
        }
    });
    setIsAlertOpen(true);
  }

  const bulkConfirm = () => {
     setAlertContent({
        title: `Weet u het zeker?`,
        description: `U staat op het punt om ${numSelected} regel(s) te bevestigen.`,
        onConfirm: () => {
          startTransition(async () => {
            const result = await confirmLogbookEntries(selectedRowIds);
            if (result.success) {
                toast({ title: `${result.count} regel(s) bevestigd` });
                onEntryConfirmed();
                setSelectedRowIds([]);
            } else {
                toast({ variant: 'destructive', title: 'Bevestigen mislukt', description: result.message });
            }
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
        {numSelected > 0 && (
             <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50">
                 <p className="text-sm font-medium flex-grow">{numSelected} geselecteerd</p>
                 <Button variant="outline" size="sm" onClick={bulkConfirm} disabled={isPending || !canConfirmSelection}>
                     <CheckCircle className="mr-2 h-4 w-4" /> Bevestigen
                 </Button>
                 <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={isPending}>
                     <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
                 </Button>
             </div>
        )}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={numSelected > 0 && numSelected === entries.filter(e => e.status !== 'Analyseren...').length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Selecteer alle rijen"
                  />
                </TableHead>
                <TableHead className="min-w-[180px]">Datum</TableHead>
                <TableHead className="w-[150px]">Invoer</TableHead>
                <TableHead className="min-w-[200px]">Percelen</TableHead>
                <TableHead className="min-w-[280px]">Middelen</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[100px] text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <LogbookTableRow
                  key={entry.id}
                  entry={entry}
                  allParcels={allParcels}
                  isSelected={selectedRowIds.includes(entry.id)}
                  onSelectRow={handleSelectRow}
                  allProducts={allProducts}
                  onDelete={handleSingleDelete}
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
