
'use client';

import * as React from 'react';
import { useState, useMemo, useTransition, useRef } from 'react';
import type { Middel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Upload, Loader2, File, Trash2, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { parseCtgbFileAndImport, deleteAllMiddelen } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";


function ImportDialog({ open, onOpenChange, onImportSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onImportSuccess: () => void }) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isImporting, startImportTransition] = useTransition();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleImport = () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'Geen bestand', description: 'Selecteer een bestand om te importeren.' });
            return;
        }

        onOpenChange(false);
        toast({
            title: 'Import Gestart',
            description: `Verwerking van ${selectedFile.name} is op de achtergrond gestart.`,
        });

        startImportTransition(async () => {
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);

                const result = await parseCtgbFileAndImport(formData);

                if (result.success) {
                    toast({
                        title: 'Import Succesvol',
                        description: result.message || `${selectedFile.name} is succesvol geïmporteerd.`,
                    });
                    onImportSuccess();
                } else {
                    throw new Error(result.message || `Onbekende fout bij verwerken van ${selectedFile.name}`);
                }
            } catch (error: any) {
                const errorMessage = error.message || 'Onbekende fout.';
                console.error(`Fout bij importeren van ${selectedFile.name}:`, errorMessage, error);
                toast({
                    variant: 'destructive',
                    title: `Import Mislukt: ${selectedFile.name}`,
                    description: errorMessage,
                    fullError: (error.stack || errorMessage) as string,
                });
            } finally {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
            }
        });
    };

    const acceptedFileTypes = '.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel';
    
    const onDialogOpenChange = (isOpen: boolean) => {
        onOpenChange(isOpen);
        if (!isOpen) {
            setSelectedFile(null);
             if (fileInputRef.current) {
                fileInputRef.current.value = '';
             }
        }
    }

    return (
        <Dialog open={open} onOpenChange={onDialogOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Importeer CTGB Lijst</DialogTitle>
                    <DialogDescription>
                        Upload de Excel-lijst van de CTGB-website. De data wordt automatisch verwerkt.
                    </DialogDescription>
                </DialogHeader>
                
                 <Card className="mt-4 border-dashed">
                     <CardContent className="p-6 text-center">
                        <Label htmlFor="file-upload-excel" className="cursor-pointer">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <p className="font-semibold">Sleep een Excel-bestand hierheen of klik om te selecteren</p>
                            <p className="text-sm text-muted-foreground">Alleen Excel-bestanden (.xlsx, .csv) worden ondersteund.</p>
                          </div>
                          <Input id="file-upload-excel" ref={fileInputRef} type="file" className="hidden" accept={acceptedFileTypes} onChange={handleFileChange}/>
                        </Label>
                     </CardContent>
                 </Card>
                
                {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                        <File className="h-4 w-4" />
                        <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
                    </div>
                )}

                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Annuleren</Button>
                    </DialogClose>
                    <Button onClick={handleImport} disabled={isImporting || !selectedFile}>
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Importeer en Verwerk
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CollapsibleCell({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLongText = content.length > 50;

  if (!isLongText) {
    return <>{content}</>;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <p>
        {isOpen ? content : `${content.substring(0, 50)}...`}
        <CollapsibleTrigger asChild>
          <Button variant="link" className="p-0 pl-1 text-xs h-auto">
            {isOpen ? 'minder' : 'meer'}
          </Button>
        </CollapsibleTrigger>
      </p>
    </Collapsible>
  );
}

export function MiddelMatrixClientPage({ initialData }: { initialData: Middel[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isDeleting, startDeleteTransition] = useTransition();
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

    const groupedData = useMemo(() => {
        const groups: { [key: string]: Middel } = {};
        initialData.forEach(item => {
            const key = item['Middelnaam'];
            if (!key) return;

            if (!groups[key]) {
                groups[key] = item;
            }
        });
        return Object.values(groups);
    }, [initialData]);
    
    const headers = ['Toelatingsnummer', 'Middelnaam', 'Werkzame stof(fen)', 'Aard werking'];
    
    const filteredData = useMemo(() => {
        if (!searchTerm) return groupedData;
        
        // This search logic now needs to check against the full dataset, not just the grouped one
        const searchLower = searchTerm.toLowerCase();
        const matchingMiddelnamen = new Set<string>();

        initialData.forEach(item => {
             const searchableValues = Object.values(item).join(' ').toLowerCase();
             if (searchableValues.includes(searchLower)) {
                 matchingMiddelnamen.add(item['Middelnaam']);
             }
        });

        return groupedData.filter(item => matchingMiddelnamen.has(item['Middelnaam']));
    }, [searchTerm, initialData, groupedData]);


    const handleImportSuccess = () => {
        router.refresh();
    };
    
    const handleRowClick = (middelnaam: string) => {
        // Encode the middelnaam to handle special characters in the URL
        router.push(`/middelmatrix/${encodeURIComponent(middelnaam)}`);
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
                                        {headers.map(header => <TableHead key={header}>{header}</TableHead>)}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredData.length > 0 ? (
                                        filteredData.map(item => (
                                            <TableRow key={item.id} onClick={() => handleRowClick(item['Middelnaam'])} className="cursor-pointer">
                                                {headers.map(header => (
                                                    <TableCell key={`${item.id}-${header}`} className="max-w-xs align-top">
                                                       <CollapsibleCell content={String(item[header] || '-')} />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={headers.length || 1} className="h-24 text-center">
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
