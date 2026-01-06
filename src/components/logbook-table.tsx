'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, Parcel, LogStatus, ProductEntry } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { MoreHorizontal, Trash2, Pencil, CheckCircle, ChevronDown } from 'lucide-react';
import { deleteLogbookEntries, confirmLogbookEntries } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
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

const statusVariant: Record<LogStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  'Nieuw': 'outline',
  'Analyseren...': 'secondary',
  'Te Controleren': 'secondary',
  'Akkoord': 'default',
  'Fout': 'destructive',
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
    const firstProduct = products[0];
    const firstProductText = `${firstProduct.product} (${firstProduct.dosage} ${firstProduct.unit})`;

    if (count === 1) {
      return <span>{firstProductText}</span>;
    }

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
                        <li key={index}>{product.product} ({product.dosage} {product.unit})</li>
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

  const handleSelectAll = (checked: boolean) => {
    setSelectedRowIds(checked ? entries.map(entry => entry.id) : []);
  };
  
  const numSelected = selectedRowIds.length;
  const canConfirmSelection = useMemo(() => {
    if (selectedRowIds.length === 0) return false;
    return selectedRowIds.every(id => {
      const entry = entries.find(e => e.id === id);
      return entry && (entry.status === 'Te Controleren' || entry.status === 'Nieuw') && !entry.validationMessage;
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
                    indeterminate={numSelected > 0 && numSelected < entries.length}
                    onCheckedChange={handleSelectAll}
                    aria-label="Selecteer alle rijen"
                  />
                </TableHead>
                <TableHead className="w-[150px]">Datum</TableHead>
                <TableHead>Invoer</TableHead>
                <TableHead>Middelen</TableHead>
                <TableHead>Percelen</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead className="w-[50px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow 
                    key={entry.id}
                    data-state={selectedRowIds.includes(entry.id) ? 'selected' : undefined}
                >
                  <TableCell>
                      <Checkbox
                        checked={selectedRowIds.includes(entry.id)}
                        onCheckedChange={() => handleSelectRow(entry.id)}
                        aria-label={`Selecteer rij ${entry.id}`}
                      />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(entry.date)}</TableCell>
                  <TableCell>
                      <p className="truncate max-w-[200px] md:max-w-xs font-medium" title={entry.rawInput}>{entry.rawInput}</p>
                      {entry.validationMessage && <p className="text-xs text-destructive truncate max-w-[200px] md:max-w-xs" title={entry.validationMessage}>{entry.validationMessage}</p>}
                  </TableCell>
                  <TableCell className="text-sm">
                      <ProductListCollapsible products={entry.parsedData?.products} />
                  </TableCell>
                  <TableCell className="text-sm">
                      <ParcelListCollapsible plotIds={entry.parsedData?.plots} allParcels={allParcels} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant[entry.status]}
                      className={cn('capitalize', entry.status === 'Analyseren...' && 'animate-pulse')}
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link href={`/logboek/${entry.id}/bewerken`} passHref>
                           <DropdownMenuItem>
                              <Pencil className="mr-2 h-4 w-4" />
                              <span>Bewerken</span>
                            </DropdownMenuItem>
                        </Link>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
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
