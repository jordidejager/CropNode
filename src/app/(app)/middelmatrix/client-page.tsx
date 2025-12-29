
'use client';

import { useState, useMemo, useTransition, useRef } from 'react';
import type { Middel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight, Upload, Loader2, File } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { importVoorschrift } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

function ImportDialog({ open, onOpenChange, onImportSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onImportSuccess: () => void }) {
    const [isImporting, startImportTransition] = useTransition();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleImport = async () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'Geen bestand', description: 'Selecteer een PDF-bestand om te importeren.' });
            return;
        }

        const formData = new FormData();
        formData.append('voorschriftPdf', selectedFile);

        startImportTransition(async () => {
            const result = await importVoorschrift(formData);
            if (result.success) {
                toast({ title: 'Import geslaagd!', description: result.message });
                onImportSuccess();
                onOpenChange(false);
                setSelectedFile(null);
            } else {
                toast({ variant: 'destructive', title: 'Import mislukt', description: result.message });
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            onOpenChange(isOpen);
            if (!isOpen) setSelectedFile(null);
        }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Importeer Voorschrift via PDF</DialogTitle>
                    <DialogDescription>
                        Upload een PDF-bestand van een gebruikersvoorschrift. De AI zal de gegevens extraheren en opslaan.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Label htmlFor="voorschrift-pdf">PDF-bestand</Label>
                    <Input
                        id="voorschrift-pdf"
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="cursor-pointer"
                    />
                    {selectedFile && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                            <File className="h-4 w-4" />
                            <span>{selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)</span>
                        </div>
                    )}
                </div>
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

export function MiddelMatrixClientPage({ initialData }: { initialData: Middel[] }) {
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
                let merged = false;

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
                        merged = true;
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
        // Force a server-side data refresh by reloading the page
        router.refresh();
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Middelen Database</CardTitle>
                            <CardDescription>
                                Doorzoekbare database van toegelaten middelen voor pitfruit, live vanuit de database.
                            </CardDescription>
                        </div>
                         <Button onClick={() => setIsImporting(true)}>
                            <Upload className="mr-2 h-4 w-4" /> Voorschrift Importeren
                        </Button>
                    </div>
                    <div className="relative mt-4">
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
                                                    <TableCell>{regel.disease || '-'}</TableCell>
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
                                                <>
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
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                    </TableRow>
                                                    <CollapsibleContent asChild>
                                                        <>
                                                            {regels.map((regel, index) => (
                                                                <TableRow key={`${regel.id}-${index}`} className="bg-background hover:bg-muted/50">
                                                                    <TableCell className="pl-12 text-muted-foreground"></TableCell>
                                                                    <TableCell>{regel.crop}</TableCell>
                                                                    <TableCell>{regel.disease || '-'}</TableCell>
                                                                    <TableCell className="text-right">{`${regel.maxDosage.toFixed(2)} ${regel.unit}`}</TableCell>
                                                                    <TableCell className="text-right">{regel.minIntervalDays ?? '-'}</TableCell>
                                                                    <TableCell className="text-right">{regel.maxApplicationsPerYear ?? '-'}</TableCell>
                                                                    <TableCell className="text-right">{regel.maxDosePerYear ? `${regel.maxDosePerYear} ${regel.unit}` : '-'}</TableCell>
                                                                    <TableCell className="text-right">{regel.safetyPeriodDays ?? '-'}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </>
                                                    </CollapsibleContent>
                                                </>
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
            <ImportDialog open={isImporting} onOpenChange={setIsImporting} onImportSuccess={handleImportSuccess} />
        </>
    );
}
    