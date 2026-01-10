
'use client';

import React, { useState, useTransition, useMemo, useEffect, useCallback } from 'react';
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
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, startSaveTransition] = useTransition();
    const [isActionPending, startActionTransition] = useTransition();

    const [editedParcels, setEditedParcels] = useState<string[]>([]);
    const [editedProducts, setEditedProducts] = useState<ProductEntry[]>([]);
    const [editedDate, setEditedDate] = useState<Date | undefined>();
    
    const { toast } = useToast();

    // Sync state when entry changes or when editing starts
    useEffect(() => {
        if (entry.parsedData) {
            setEditedParcels(entry.parsedData.plots || []);
            setEditedProducts(entry.parsedData.products || []);
        }
        if (entry.date) {
            setEditedDate(entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date));
        }
    }, [entry, isEditing]);


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

        startSaveTransition(async () => {
            const result = await updateAndConfirmEntry(updatedEntry, entry.parsedData?.products || []);
            toast({
                title: 'Wijzigingen opgeslagen',
                description: result.message,
            });
            setIsEditing(false);
            onUpdate();
        });
    }, [entry, editedParcels, editedProducts, editedDate, toast, onUpdate]);
    
    const handleCancel = () => {
        setIsEditing(false);
    }

    const config = statusConfig[entry.status] || statusConfig['Fout'];
    const isPending = isSaving || isActionPending;

    return (
        <>
            <TableRow data-state={isEditing ? 'selected' : undefined}>
                <TableCell className="min-w-[140px] text-muted-foreground text-sm align-top">
                   {formatDate(entry.date)}
                </TableCell>
                <TableCell className="align-top max-w-sm">
                    <p className="font-medium text-sm whitespace-pre-wrap break-words" title={entry.rawInput}>
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
                    {entry.parsedData?.plots?.map(id =>
                        allParcels.find(p => p.id === id)?.name || id
                    ).join(', ') || '-'}
                </TableCell>
                <TableCell className="min-w-[300px] max-w-md align-top">
                     {entry.parsedData?.products && allProducts.length > 0 ? (
                        <InlineEditProducts
                            allProducts={allProducts}
                            selectedProducts={editedProducts}
                            onProductsChange={setEditedProducts}
                            isEditing={isEditing}
                        />
                    ) : (entry.parsedData?.products ? <span>{entry.parsedData.products.map(p => `${p.product} (${p.dosage} ${p.unit})`).join(', ')}</span> : '-')}
                </TableCell>
                <TableCell className="align-top">
                    <Badge
                        variant={config.variant}
                        className={cn('capitalize whitespace-nowrap', entry.status === 'Analyseren...' && 'animate-pulse', config.colorClass)}
                    >
                        {config.icon && <config.icon className="mr-1.5 h-3 w-3"/>}
                        {config.label}
                    </Badge>
                </TableCell>
                <TableCell className="text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                       {entry.status === 'Fout' && (
                            <Button variant="ghost" size="icon" onClick={() => handleRetry(entry.id)} disabled={isPending} title="Opnieuw proberen" className="h-8 w-8">
                                <RefreshCcw className="h-4 w-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleConfirm(entry.id)} disabled={isPending} title="Bevestigen" className="h-8 w-8 text-green-500 hover:text-green-600">
                           <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsEditing(prev => !prev)} disabled={isPending} title="Bewerken" className="h-8 w-8">
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(entry.id)} disabled={isPending} title="Verwijderen" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
            {isEditing && (
                <TableRow>
                    <TableCell colSpan={6} className="p-0">
                        <div className="p-4 bg-muted/50 space-y-4">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                               <div className="space-y-2">
                                   <Label>Datum & Tijd</Label>
                                   <InlineEditDate date={editedDate} onDateChange={setEditedDate} />
                               </div>
                                <div className="space-y-2">
                                    <Label>Percelen</Label>
                                    <InlineEditParcels
                                        allParcels={allParcels}
                                        selectedParcelIds={editedParcels}
                                        onSelectionChange={setEditedParcels}
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label>Middelen</Label>
                                    {allProducts.length > 0 ? (
                                        <InlineEditProducts
                                            allProducts={allProducts}
                                            selectedProducts={editedProducts}
                                            onProductsChange={setEditedProducts}
                                            isEditing={true}
                                        />
                                    ) : (
                                        <Skeleton className="h-9 w-full" />
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>Annuleren</Button>
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                    Wijzigingen Opslaan
                                </Button>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            )}
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
