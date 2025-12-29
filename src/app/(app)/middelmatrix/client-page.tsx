
'use client';

import { useState, useMemo, useTransition, useRef } from 'react';
import type { Middel, UploadLog } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight, Upload, Loader2, File, Download } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { importVoorschrift, extractPdfText } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function ImportDialog({ open, onOpenChange, onImportSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onImportSuccess: () => void }) {
    const [isImporting, startImportTransition] = useTransition();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setSelectedFiles(Array.from(event.target.files));
        }
    };

    const handleImport = async () => {
        if (selectedFiles.length === 0) {
            toast({ variant: 'destructive', title: 'Geen bestanden', description: 'Selecteer een of meerdere PDF-bestanden om te importeren.' });
            return;
        }
    
        startImportTransition(async () => {
            let successfulImports = 0;
            const errorMessages: string[] = [];
    
            for (const file of selectedFiles) {
                try {
                    const formData = new FormData();
                    formData.append('pdf', file);
                    
                    const textResult = await extractPdfText(formData);
                    if (!textResult.success || !textResult.text) {
                        throw new Error(textResult.message || `Kon geen tekst uit ${file.name} extraheren.`);
                    }

                    const importResult = await importVoorschrift({
                        fileName: file.name,
                        pdfText: textResult.text,
                        pdfUrl: textResult.fileUrl,
                    });
    
                    if (importResult.success) {
                        successfulImports++;
                    } else {
                        throw new Error(importResult.message || `Onbekende fout bij verwerken van ${file.name}`);
                    }
                } catch (error: any) {
                    const errorMessage = error.message || 'Onbekende fout.';
                    console.error(`Fout bij ${file.name}:`, errorMessage);
                    errorMessages.push(`${file.name}: ${errorMessage}`);
                }
            }
            
            if (successfulImports > 0) {
                 toast({
                    title: 'Import Voltooid',
                    description: `${successfulImports} van de ${selectedFiles.length} voorschrift(en) succesvol geïmporteerd.`,
                });
            }
           
            if (errorMessages.length > 0) {
                 toast({
                    variant: 'destructive',
                    title: `Import mislukt`,
                    description: `De volgende fouten zijn opgetreden: ${errorMessages.join(', ')}`,
                });
            }
    
            if (successfulImports > 0) {
                onImportSuccess();
            }

            onOpenChange(false);
            setSelectedFiles([]);
        });
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            onOpenChange(isOpen);
            if (!isOpen) setSelectedFiles([]);
        }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Importeer Voorschrift(en) via PDF</DialogTitle>
                    <DialogDescription>
                        Upload één of meerdere PDF-bestanden van een gebruikersvoorschrift. De AI zal de gegevens extraheren en opslaan.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Label htmlFor="voorschrift-pdf">PDF-bestand(en)</Label>
                    <Input
                        id="voorschrift-pdf"
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="cursor-pointer"
                        multiple
                    />
                    {selectedFiles.length > 0 && (
                        <div className="flex flex-col gap-2 text-sm text-muted-foreground mt-2 max-h-32 overflow-y-auto">
                            {selectedFiles.map((file, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <File className="h-4 w-4" />
                                    <span>{file.name} ({Math.round(file.size / 1024)} KB)</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Annuleren</Button>
                    </DialogClose>
                    <Button onClick={handleImport} disabled={isImporting || selectedFiles.length === 0}>
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isImporting ? `Verwerken... (${selectedFiles.length})` : `Importeer en Analyseer (${selectedFiles.length})`}
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
    const [isImporting, setIsImporting] = useState(false);
    const router = useRouter();

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
                        <div className="flex items-center gap-4">
                            <TabsList>
                                <TabsTrigger value="database">Database</TabsTrigger>
                                <TabsTrigger value="log">Upload Logboek</TabsTrigger>
                            </TabsList>
                            <Button onClick={() => setIsImporting(true)}>
                                <Upload className="mr-2 h-4 w-4" /> Voorschrift Importeren
                            </Button>
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
                                            Object.entries(groupedAndFilteredMatrix).map(([product, regels]) => {
                                                const isCollapsible = regels.length > 1;

                                                if (!isCollapsible) {
                                                    const regel = regels[0];
                                                    return (
                                                        <TableRow key={regel.id}>
                                                            <TableCell className="font-medium">{regel.product}</TableCell>
                                                            <TableCell>{regel.crop}</TableCell>
                                                            <TableCell>{formatDisease(regel.disease)}</TableCell>
                                                            <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                                            <TableCell className="text-right">{regel.minIntervalDays ?? '-'}</TableCell>
                                                            <TableCell className="text-right">{regel.maxApplicationsPerYear ?? '-'}</TableCell>
                                                            <TableCell className="text-right">{regel.maxDosePerYear ? `${regel.maxDosePerYear} ${regel.unit}` : '-'}</TableCell>
                                                            <TableCell className="text-right">{regel.safetyPeriodDays ?? '-'}</TableCell>
                                                        </TableRow>
                                                    );
                                                }

                                                return (
                                                      <Collapsible asChild key={product} defaultOpen={false}>
                                                        <TableBody>
                                                          <TableRow className="font-medium bg-muted/50">
                                                            <TableCell>
                                                              <CollapsibleTrigger asChild>
                                                                <button className="flex items-center gap-2 w-full text-left">
                                                                  <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                                                                  {product}
                                                                </button>
                                                              </CollapsibleTrigger>
                                                            </TableCell>
                                                            <TableCell>{regels.length} regels</TableCell>
                                                            <TableCell colSpan={6}></TableCell>
                                                          </TableRow>
                                                          <CollapsibleContent asChild>
                                                            <>
                                                              {regels.map((regel, index) => (
                                                                <TableRow key={`${regel.id}-${index}`} className="bg-background hover:bg-muted/50">
                                                                  <TableCell className="pl-12 text-muted-foreground"></TableCell>
                                                                  <TableCell>{regel.crop}</TableCell>
                                                                  <TableCell>{formatDisease(regel.disease)}</TableCell>
                                                                  <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                                                  <TableCell className="text-right">{regel.minIntervalDays ?? '-'}</TableCell>
                                                                  <TableCell className="text-right">{regel.maxApplicationsPerYear ?? '-'}</TableCell>
                                                                  <TableCell className="text-right">{regel.maxDosePerYear ? `${regel.maxDosePerYear} ${regel.unit}` : '-'}</TableCell>
                                                                  <TableCell className="text-right">{regel.safetyPeriodDays ?? '-'}</TableCell>
                                                                </TableRow>
                                                              ))}
                                                            </>
                                                          </CollapsibleContent>
                                                        </TableBody>
                                                      </Collapsible>
                                                    );
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-24 text-center">
                                                    Geen middelen gevonden voor "{searchTerm}".
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
                            <CardDescription>Overzicht van alle geïmporteerde voorschriften.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Middel</TableHead>
                                            <TableHead>Upload Datum</TableHead>
                                            <TableHead>Toelating</TableHead>
                                            <TableHead>Versie</TableHead>
                                            <TableHead className="max-w-xs">Actieve Stof(fen)</TableHead>
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
                                                            <TooltipTrigger asChild>
                                                                <p className="truncate max-w-[200px]">{log.activeSubstances ?? '-'}</p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{log.activeSubstances}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                     <TableCell>
                                                        {log.pdfUrl ? (
                                                            <Button asChild variant="outline" size="sm">
                                                                <a href={log.pdfUrl} target="_blank" rel="noopener noreferrer">
                                                                    <Download className="mr-2 h-4 w-4" />
                                                                    Download
                                                                </a>
                                                            </Button>
                                                        ) : (
                                                            <Tooltip delayDuration={100}>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                                    <File className="h-4 w-4 flex-shrink-0" />
                                                                    <span className="truncate max-w-[150px]">{log.fileName}</span>
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{log.fileName}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    Nog geen voorschriften geïmporteerd.
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
            <ImportDialog open={isImporting} onOpenChange={setIsImporting} onImportSuccess={handleImportSuccess} />
        </>
    );
}
