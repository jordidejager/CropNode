
'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, Parcel, LogStatus, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { MoreHorizontal, Trash2, Pencil, CheckCircle, ChevronDown, RefreshCcw, AlertTriangle, ShieldAlert, X, Loader2, Check } from 'lucide-react';
import { deleteLogbookEntries, confirmLogbookEntries, retryAnalysis, updateAndConfirmEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getProducts } from '@/lib/store';
import { useFirestore } from '@/firebase';
import { EditParcels } from './edit-parcels';
import { EditProducts } from './edit-products';
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
  } catch (e) {
    return 'Ongeldige datum';
  }
}

function ProductListCollapsible({ products }: { products: ProductEntry[] | undefined }) {
    if (!products || products.length === 0) {
        return <span>-</span>;
    }

    const count = products.length;
    const getProductText = (p: ProductEntry) => `${p.product} (${p.dosage} ${p.unit})`;

    if (count < 4) {
        return (
            <div className="flex flex-col gap-1">
                {products.map((p, i) => <span key={i}>{getProductText(p)}</span>)}
            </div>
        );
    }
    
    const firstProductText = getProductText(products[0]);

    return (
        <Collapsible>
            <div className="flex items-center space-x-2">
                <span className="text-sm truncate max-w-[200px]" title={firstProductText}>{firstProductText}</span>
                 <CollapsibleTrigger asChild>
                    <span className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        en {count - 1} ander{count - 2 === 0 ? '' : 'e'}
                    </span>
                 </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
                    {products.slice(1).map((product, index) => (
                        <li key={index}>{getProductText(product)}</li>
                    ))}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
}


function ParcelListCollapsible({ plotIds, allParcels }: { plotIds: string[] | undefined, allParcels: Parcel[] }) {
    if (!plotIds || plotIds.length === 0) {
        return <span>-</span>;
    }

    const parcelNames = plotIds.map(id => allParcels.find(p => p.id === id)?.name || id);
    const count = parcelNames.length;

    if (count <= 2) {
      return <span>{parcelNames.join(', ')}</span>;
    }

    return (
        <Collapsible>
            <div className="flex items-center space-x-2">
                <span className="text-sm">{count} perce{count > 1 ? 'len' : 'el'}</span>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                        <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                        <span className="sr-only">{count} percelen</span>
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-muted-foreground">
                    {parcelNames.map((name, index) => (
                        <li key={index}>{name}</li>
                    ))}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
}

interface LogbookTableProps {
  entries: LogbookEntry[];
  allParcels: Parcel[];
  onEntryDeleted: (entryIds: string[]) => void;
  onEntryConfirmed: () => void;
}

const LogbookTableRow = ({ entry, allParcels, onSelectRow, isSelected }: { entry: LogbookEntry, allParcels: Parcel[], onSelectRow: (id: string) => void, isSelected: boolean }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [editedEntry, setEditedEntry] = useState<LogbookEntry>(entry);
    const [allProducts, setAllProducts] = useState<string[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const db = useFirestore();
    const { toast } = useToast();

    const config = statusConfig[entry.status] || statusConfig['Fout'];

    useEffect(() => {
        setEditedEntry(entry);
    }, [entry]);

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

    const handleEditToggle = async () => {
        if (!isEditing) {
            setLoadingProducts(true);
            const products = await getProducts(db);
            setAllProducts(products);
            setLoadingProducts(false);
        }
        setIsEditing(!isEditing);
    };

    const handleParcelsChange = (selectedIds: string[]) => {
        if (editedEntry && editedEntry.parsedData) {
            setEditedEntry({
                ...editedEntry,
                parsedData: { ...editedEntry.parsedData, plots: selectedIds }
            });
        }
    };

    const handleProductsChange = (products: ProductEntry[]) => {
        if (editedEntry && editedEntry.parsedData) {
            setEditedEntry({
                ...editedEntry,
                parsedData: { ...editedEntry.parsedData, products: products }
            });
        }
    };

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateAndConfirmEntry(editedEntry, entry.parsedData?.products || []);
            toast({
                title: result.entry?.status === 'Akkoord' ? 'Opgeslagen!' : 'Bijgewerkt',
                description: result.message,
            });
            setIsEditing(false);
        });
    }

    if (isEditing) {
        return (
            <TableRow data-state="selected">
                <TableCell colSpan={7} className="p-0">
                    <div className="p-4 space-y-4">
                        <h4 className="font-semibold">Logboekregel bewerken</h4>
                        <p className="text-sm text-muted-foreground">{entry.rawInput}</p>
                        {loadingProducts ? <Skeleton className="h-40 w-full" /> : (
                            <div className="grid md:grid-cols-2 gap-6">
                                {editedEntry.parsedData && allProducts.length > 0 && (
                                    <>
                                    <EditProducts
                                        allProducts={allProducts}
                                        selectedProducts={editedEntry.parsedData.products}
                                        onProductsChange={handleProductsChange}
                                    />
                                    <EditParcels
                                        allParcels={allParcels}
                                        selectedParcelIds={editedEntry.parsedData.plots}
                                        onSelectionChange={handleParcelsChange}
                                    />
                                    </>
                                )}
                            </div>
                        )}
                        {entry.validationMessage && (
                            <div className={cn("flex items-start gap-3 rounded-md border p-3 text-sm border-yellow-500/50 bg-yellow-500/10 text-yellow-200")}>
                                <AlertTriangle className="size-5 mt-0.5" />
                                <p className="flex-1">{entry.validationMessage}</p>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={isPending}>
                                <X className="mr-2" /> Annuleren
                            </Button>
                            <Button onClick={handleSave} disabled={!editedEntry.parsedData || isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2"/>}
                                Bevestigen en Opslaan
                            </Button>
                        </div>
                    </div>
                </TableCell>
            </TableRow>
        );
    }

    return (
        <TableRow
            key={entry.id}
            data-state={isSelected ? 'selected' : undefined}
        >
            <TableCell>
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onSelectRow(entry.id)}
                    aria-label={`Selecteer rij ${entry.id}`}
                />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{formatDate(entry.date)}</TableCell>
            <TableCell>
                <p className="truncate max-w-[200px] md:max-w-xs font-medium" title={entry.rawInput}>{entry.rawInput}</p>
                {entry.validationMessage && <p className={cn("text-xs truncate max-w-[200px] md:max-w-xs", entry.status === 'Afgekeurd' ? 'text-destructive' : 'text-yellow-400')} title={entry.validationMessage}>{entry.validationMessage}</p>}
            </TableCell>
            <TableCell className="text-sm">
                <ParcelListCollapsible plotIds={entry.parsedData?.plots} allParcels={allParcels} />
            </TableCell>
            <TableCell className="text-sm align-top">
                <ProductListCollapsible products={entry.parsedData?.products} />
            </TableCell>
            <TableCell>
                <Badge
                    variant={config.variant}
                    className={cn('capitalize', entry.status === 'Analyseren...' && 'animate-pulse', config.colorClass)}
                >
                    {config.icon && <config.icon className="mr-1.5 h-3 w-3"/>}
                    {config.label}
                </Badge>
            </TableCell>
            <TableCell className="text-right">
                {entry.status === 'Fout' ? (
                    <Button variant="ghost" size="icon" onClick={() => handleRetry(entry.id)} disabled={isPending} title="Opnieuw proberen">
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                ) : (
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={entry.status === 'Analyseren...'}>
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={entry.status === 'Analyseren...'} onClick={handleEditToggle}>
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>Bewerken</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </TableCell>
        </TableRow>
    );
};

export function LogbookTable({ entries, allParcels, onEntryDeleted, onEntryConfirmed }: LogbookTableProps) {
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', description: '', onConfirm: () => {} });
  const { toast } = useToast();

  const handleSelectRow = (id: string) => {
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean | string) => {
    setSelectedRowIds(checked ? entries.map(entry => entry.id) : []);
  };

  const numSelected = selectedRowIds.length;
  const canConfirmSelection = useMemo(() => {
    if (selectedRowIds.length === 0) return false;
    return selectedRowIds.every(id => {
      const entry = entries.find(e => e.id === id);
      return entry && (entry.status === 'Te Controleren' || entry.status === 'Waarschuwing') && !entry.validationMessage?.includes('overschrijdt');
    });
  }, [selectedRowIds, entries]);


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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={numSelected === entries.length && entries.length > 0}
                    indeterminate={numSelected > 0 && numSelected < entries.length ? "indeterminate" : false}
                    onCheckedChange={handleSelectAll}
                    aria-label="Selecteer alle rijen"
                  />
                </TableHead>
                <TableHead className="w-[150px]">Datum</TableHead>
                <TableHead>Invoer</TableHead>
                <TableHead>Percelen</TableHead>
                <TableHead>Middelen</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead className="w-[50px] text-right"></TableHead>
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
