
'use client';

import * as React from 'react';
import { useState, useMemo, useTransition, useRef } from 'react';
import type { Middel, UploadLog } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight, Upload, Loader2, File, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { parseCtgbFileAndImport, deleteAllMiddelen } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
                            <p className="text-sm text-muted-foreground">Download de lijst als Excel van de CTGB-site en upload deze hier.</p>
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
                        Importeer en Analyseer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const areRegelsSimilar = (a: Middel, b: Middel) => {
    return a.disease === b.disease &&
        a.maxDosage === b.maxDosage &&
        a.unit === b.unit &&
        a.safetyPeriodDays === b.safetyPeriodDays &&
        a.maxApplicationsPerYear === b.maxApplicationsPerYear &&
        a.maxDosePerYear === b.maxDosePerYear &&
        a.minIntervalDays === b.minIntervalDays;
};

const formatDisease = (disease: string | undefined) => {
    if (!disease) return '-';
    return disease.split('(')[0].trim();
};

const formatDate = (date: Date) => {
    try {
        return format(date, 'dd-MM-yyyy HH:mm', { locale: nl });
    } catch {
        return 'Ongeldige datum';
    }
}

export function MiddelMatrixClientPage({ initialData, initialLogs }: { initialData: Middel[], initialLogs: UploadLog[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isDeleting, startDeleteTransition] = useTransition();
    const [openProducts, setOpenProducts] = useState<Record<string, boolean>>({});
    const router = useRouter();
    const { toast } = useToast();

    const toggleProduct = (productName: string) => {
        setOpenProducts(prev => ({ ...prev, [productName]: !prev[productName] }));
    };
    
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

    const groupedAndFilteredMatrix = useMemo(() => {
        const filtered = initialData.filter(regel =>
            regel.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
            regel.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (regel.disease && regel.disease.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        const groupedByProduct = filtered.reduce((acc, regel) => {
            (acc[regel.product] = acc[regel.product] || []).push(regel);
            return acc;
        }, {} as Record<string, Middel[]>);
        
        Object.keys(groupedByProduct).forEach(product => {
            const regels = groupedByProduct[product];
            const mergedRegels: Middel[] = [];
            const processedIndexes = new Set<number>();

            for (let i = 0; i < regels.length; i++) {
                if (processedIndexes.has(i)) continue;

                const currentRegel = regels[i];
                let mergedRegel: Middel = { ...currentRegel };

                for (let j = i + 1; j < regels.length; j++) {
                    if (processedIndexes.has(j)) continue;

                    const otherRegel = regels[j];
                    if (
                        (currentRegel.crop.toLowerCase() === 'appel' && otherRegel.crop.toLowerCase() === 'peer' ||
                         currentRegel.crop.toLowerCase() === 'peer' && otherRegel.crop.toLowerCase() === 'appel') &&
                        areRegelsSimilar(currentRegel, otherRegel)
                    ) {
                        mergedRegel.crop = 'Appel / Peer';
                        processedIndexes.add(j);
                    }
                }
                mergedRegels.push(mergedRegel);
                processedIndexes.add(i);
            }
            groupedByProduct[product] = mergedRegels;
        });

        return groupedByProduct;

    }, [searchTerm, initialData]);

    const handleImportSuccess = () => {
        router.refresh();
    };

    return (
        <>
        <TooltipProvider>
            <Tabs defaultValue="database">
                <CardHeader className="px-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Middelen</CardTitle>
                            <CardDescription>
                                Database van toegelaten middelen en upload-historie.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                             <TabsList>
                                <TabsTrigger value="database">Mijn Middelen</TabsTrigger>
                                <TabsTrigger value="log">Upload Logboek</TabsTrigger>
                            </TabsList>
                            <Button onClick={() => setIsImportOpen(true)}>
                                <Upload className="mr-2 h-4 w-4" /> Importeren
                            </Button>
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        <Trash2 className="mr-2 h-4 w-4" /> Verwijder Alles
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Weet je het zeker?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Deze actie kan niet ongedaan worden gemaakt. Dit zal de volledige middelen-database permanent verwijderen. Alle regels worden gewist.
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
                </CardHeader>

                <TabsContent value="database">
                    <Card>
                        <CardHeader>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Zoek op middel, gewas of ziekte..."
                                    className="w-full rounded-lg bg-background pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Middel</TableHead>
                                            <TableHead>Gewas</TableHead>
                                            <TableHead>Ziekte/Plaag</TableHead>
                                            <TableHead className="text-right">Max Dosis</TableHead>
                                            <TableHead className="text-right">Interval (dgn)</TableHead>
                                            <TableHead className="text-right">Max Toep./jr</TableHead>
                                            <TableHead className="text-right">Max Dosis/jr</TableHead>
                                            <TableHead className="text-right">Termijn (dgn)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Object.keys(groupedAndFilteredMatrix).length > 0 ? (
                                            Object.entries(groupedAndFilteredMatrix).flatMap(([product, regels]) => {
                                                const isCollapsible = regels.length > 1;
                                                const isOpen = openProducts[product] || false;

                                                const mainRow = (
                                                    <TableRow 
                                                        key={product} 
                                                        onClick={isCollapsible ? () => toggleProduct(product) : undefined}
                                                        className={cn(isCollapsible && 'cursor-pointer hover:bg-muted/50')}
                                                    >
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center gap-2">
                                                                {isCollapsible && <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />}
                                                                {regels[0].product}
                                                                {isCollapsible && <span className="text-muted-foreground text-xs">({regels.length} regels)</span>}
                                                            </div>
                                                        </TableCell>
                                                        {!isCollapsible && (
                                                            <>
                                                                <TableCell>{regels[0].crop}</TableCell>
                                                                <TableCell>{formatDisease(regels[0].disease)}</TableCell>
                                                                <TableCell className="text-right">{`${regels[0].maxDosage.toFixed(2)} ${regels[0].unit}`}</TableCell>
                                                                <TableCell className="text-right">{regels[0].minIntervalDays ?? '-'}</TableCell>
                                                                <TableCell className="text-right">{regels[0].maxApplicationsPerYear ?? '-'}</TableCell>
                                                                <TableCell className="text-right">{regels[0].maxDosePerYear ? `${regels[0].maxDosePerYear} ${regels[0].unit}` : '-'}</TableCell>
                                                                <TableCell className="text-right">{regels[0].safetyPeriodDays ?? '-'}</TableCell>
                                                            </>
                                                        )}
                                                        {isCollapsible && <TableCell colSpan={7}></TableCell>}
                                                    </TableRow>
                                                );

                                                const subRows = isOpen && isCollapsible ? regels.map((regel) => (
                                                    <TableRow key={regel.id} className="bg-background hover:bg-muted/50">
                                                        <TableCell className="pl-12">{regel.product}</TableCell>
                                                        <TableCell>{regel.crop}</TableCell>
                                                        <TableCell>{formatDisease(regel.disease)}</TableCell>
                                                        <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                                        <TableCell className="text-right">{regel.minIntervalDays ?? '-'}</TableCell>
                                                        <TableCell className="text-right">{regel.maxApplicationsPerYear ?? '-'}</TableCell>
                                                        <TableCell className="text-right">{regel.maxDosePerYear ? `${regel.maxDosePerYear} ${regel.unit}` : '-'}</TableCell>
                                                        <TableCell className="text-right">{regel.safetyPeriodDays ?? '-'}</TableCell>
                                                    </TableRow>
                                                )) : [];

                                                return [mainRow, ...subRows];
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-24 text-center">
                                                    Geen middelen gevonden. Importeer een CTGB Excel-lijst.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="log">
                    <Card>
                        <CardHeader>
                            <CardTitle>Upload Logboek</CardTitle>
                            <CardDescription>Overzicht van alle geïmporteerde bestanden.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Middel / Bron</TableHead>
                                            <TableHead>Upload Datum</TableHead>
                                            <TableHead>Toelating</TableHead>
                                            <TableHead>Versie</TableHead>
                                            <TableHead>Actieve Stof(fen)</TableHead>
                                            <TableHead>Bestand</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {initialLogs.length > 0 ? (
                                            initialLogs.map(log => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="font-medium">{log.productName}</TableCell>
                                                    <TableCell>{formatDate(log.uploadDate)}</TableCell>
                                                    <TableCell>{log.admissionNumber ?? '-'}</TableCell>
                                                    <TableCell>{log.labelVersion ?? '-'}</TableCell>
                                                    <TableCell className="max-w-xs truncate">
                                                        <Tooltip delayDuration={100}>
                                                            <TooltipTrigger >
                                                                <p className="truncate max-w-[200px]">{log.activeSubstances ?? '-'}</p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{log.activeSubstances}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                     <TableCell>
                                                        <Tooltip delayDuration={100}>
                                                            <TooltipTrigger >
                                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                                <File className="h-4 w-4 flex-shrink-0" />
                                                                <span className="truncate max-w-[150px]">{log.fileName}</span>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{log.fileName}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    Nog geen bestanden geïmporteerd.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </TooltipProvider>
            <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} onImportSuccess={handleImportSuccess} />
        </>
    );
}
