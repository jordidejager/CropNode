'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, Parcel, LogStatus } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Timestamp } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from './ui/button';
import { MoreHorizontal, Trash2, Pencil, CheckCircle, ChevronDown } from 'lucide-react';
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
import { useState, useTransition } from 'react';
import { deleteLogbookEntry, confirmLogbookEntry } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

function ActionsCell({ entry, onDeleted, onConfirmed }: { entry: LogbookEntry; onDeleted: (id: string) => void; onConfirmed: () => void }) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleDelete = () => {
    startTransition(async () => {
      await deleteLogbookEntry(entry.id);
      toast({
        title: 'Verwijderd',
        description: 'De logboekregel is succesvol verwijderd.',
      });
      onDeleted(entry.id);
      setIsDeleteDialogOpen(false);
    });
  }
  
  const handleConfirm = () => {
    startTransition(async () => {
        const result = await confirmLogbookEntry(entry.id);
        if (result.success) {
            toast({
                title: 'Bevestigd!',
                description: 'De logboekregel is als "Akkoord" gemarkeerd.',
            });
            onConfirmed();
        } else {
             toast({
                variant: 'destructive',
                title: 'Fout bij bevestigen',
                description: result.message || 'Kon de regel niet bevestigen.',
            });
        }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entry.status === 'Te Controleren' && (
            <DropdownMenuItem onSelect={handleConfirm} disabled={isPending || !!entry.validationMessage}>
              <CheckCircle className="mr-2 h-4 w-4" />
              <span>Bevestigen</span>
            </DropdownMenuItem>
          )}
          <Link href={`/logboek/${entry.id}/bewerken`} passHref>
             <DropdownMenuItem>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Bewerken</span>
              </DropdownMenuItem>
          </Link>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Verwijderen</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan worden gemaakt. Dit zal de logboekregel permanent verwijderen en de bijbehorende historie van percelen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
              {isPending ? 'Verwijderen...' : 'Verwijderen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ParcelListCollapsible({ plotIds, allParcels }: { plotIds: string[] | undefined, allParcels: Parcel[] }) {
    if (!plotIds || plotIds.length === 0) {
        return <span>-</span>;
    }

    const parcelNames = plotIds.map(id => allParcels.find(p => p.id === id)?.name || id);
    const count = parcelNames.length;

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
  onEntryDeleted: (entryId: string) => void;
  onEntryConfirmed: () => void;
}


export function LogbookTable({ entries, allParcels, onEntryDeleted, onEntryConfirmed }: LogbookTableProps) {
  
  if (!entries || entries.length === 0) {
    return <p className="text-center text-muted-foreground py-10">Nog geen invoer in het logboek.</p>;
  }

  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Datum</TableHead>
              <TableHead>Invoer</TableHead>
              <TableHead>Percelen</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[50px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground text-sm">{formatDate(entry.date)}</TableCell>
                <TableCell>
                  <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                          <p className="truncate max-w-[200px] md:max-w-xs font-medium">{entry.rawInput}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                          <p className="font-semibold mb-2">Volledige Invoer:</p>
                          <p className='mb-2'>{entry.rawInput}</p>
                          {entry.validationMessage && <p className="mt-2 p-2 bg-secondary rounded-md text-secondary-foreground text-sm">{entry.validationMessage}</p>}
                      </TooltipContent>
                  </Tooltip>
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
                  <ActionsCell 
                    entry={entry} 
                    onDeleted={onEntryDeleted}
                    onConfirmed={onEntryConfirmed}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
