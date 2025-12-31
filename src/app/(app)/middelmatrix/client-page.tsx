
'use client';

import * as React from 'react';
import { useState, useMemo, useTransition } from 'react';
import type { Middel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Upload, Loader2, Trash2, ArrowUpDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteAllMiddelen } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ImportDialog } from './import-dialog';

type SortConfig = {
  key: string;
  direction: 'ascending' | 'descending';
} | null;


function CollapsibleCell({ content }: { content: string }) {
  const isLongText = content.length > 50;

  if (!isLongText) {
    return <>{content}</>;
  }

  return (
    <Collapsible>
      <div className="truncate">
        {`${content.substring(0, 50)}...`}
        <CollapsibleTrigger asChild>
          <Button variant="link" className="p-0 pl-1 text-xs h-auto">
            meer
          </Button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
}

export function MiddelMatrixClientPage({ initialData }: { initialData: Middel[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isDeleting, startDeleteTransition] = useTransition();
    const [sortConfig, setSortConfig] = useState<SortConfig>(null);
    const router = useRouter();
    const { toast } = useToast();
    
    const handleDeleteAll = () => {
        startDeleteTransition(async () => {
            const result = await deleteAllMiddelen();
            if (result.success) {
                toast({
                    title: 'Database Geleegd',
                    description: 'Alle middelen zijn succesvol uit de database verwijderd.',
                });
                router.refresh();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Verwijderen Mislukt',
                    description: result.message,
                });
            }
        });
    };

    const displayHeaders = ['Toelatingsnummer', 'Middelnaam', 'Werkzame stof(fen)', 'Maximum middeldosis'];
    
    const filteredData = useMemo(() => {
        if (!searchTerm) return initialData;
        const searchLower = searchTerm.toLowerCase();
        return initialData.filter(item => 
            Object.values(item).some(val => 
                String(val).toLowerCase().includes(searchLower)
            )
        );
    }, [searchTerm, initialData]);

    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
        }
        if (sortConfig.direction === 'ascending') {
            return <ArrowUpDown className="ml-2 h-4 w-4" />; // Or an up arrow
        }
        return <ArrowUpDown className="ml-2 h-4 w-4" />; // Or a down arrow
    };


    const handleImportSuccess = () => {
        router.refresh();
    };
    
    const handleRowClick = (middelId: string) => {
        router.push(`/middelmatrix/${middelId}`);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start flex-wrap gap-4">
                        <div>
                            <CardTitle>MiddelMatrix Database</CardTitle>
                            <CardDescription>
                                Doorzoekbare database van alle geïmporteerde middelen.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button onClick={() => setIsImportOpen(true)}>
                                <Upload className="mr-2 h-4 w-4" /> Importeren
                            </Button>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" disabled={initialData.length === 0}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Database Legen
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Deze actie kan niet ongedaan worden gemaakt. Dit zal de volledige middelen-database permanent verwijderen.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteAll} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                            Ja, verwijder alles
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                     <div className="relative mt-4">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Zoek in de volledige database..."
                            className="w-full rounded-lg bg-background pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="w-full whitespace-nowrap">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {displayHeaders.map(header => (
                                          <TableHead key={header}>
                                            <Button variant="ghost" onClick={() => requestSort(header)}>
                                                {header}
                                                {getSortIndicator(header)}
                                            </Button>
                                          </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedData.length > 0 ? (
                                        sortedData.map(item => (
                                            <TableRow key={item.id} onClick={() => handleRowClick(item.id)} className="cursor-pointer">
                                                {displayHeaders.map(header => (
                                                    <TableCell key={`${item.id}-${header}`} className="max-w-[200px] align-top">
                                                       <CollapsibleCell content={String(item[header] || '-')} />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={displayHeaders.length || 1} className="h-24 text-center">
                                                {initialData.length === 0 ? "Geen data gevonden. Importeer een Excel-bestand om te beginnen." : "Geen resultaten voor uw zoekopdracht."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>
            <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportSuccess={handleImportSuccess} />
        </>
    );
}
