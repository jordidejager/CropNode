
'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileUp, CheckCircle, AlertTriangle } from 'lucide-react';
import { parseCtgbFileAndImport } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImportSuccess: () => void;
}

export function ImportDialog({ open, onOpenChange, onImportSuccess }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isImporting, startImportTransition] = useTransition();
    const { toast } = useToast();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
        }
    };

    const handleImport = () => {
        if (!selectedFile) return;

        startImportTransition(async () => {
            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const result = await parseCtgbFileAndImport(formData);

                if (result.success) {
                    toast({
                        title: 'Import Succesvol',
                        description: result.message,
                    });
                    onImportSuccess();
                    onOpenChange(false);
                    setSelectedFile(null);
                } else {
                     throw new Error(result.message);
                }

            } catch (error: any) {
                const errorMessage = error.message || 'Onbekende fout.';
                console.error(`Fout bij importeren van ${selectedFile.name}:`, errorMessage, error);
                toast({
                    variant: 'destructive',
                    title: `Import Mislukt: ${selectedFile.name}`,
                    description: errorMessage,
                    fullError: error.stack,
                });
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            if (!isImporting) {
                onOpenChange(isOpen);
                if (!isOpen) setSelectedFile(null);
            }
        }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Importeer Middelen Database</DialogTitle>
                    <DialogDescription>
                        Selecteer een Excel-bestand (.xlsx) van de CTGB website om de middelen te importeren.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="excel-file">Excel-bestand</Label>
                        <Input id="excel-file" type="file" accept=".xlsx" onChange={handleFileChange} />
                    </div>
                    {selectedFile && (
                        <div className="text-sm text-muted-foreground">
                            Geselecteerd: <span className="font-medium">{selectedFile.name}</span>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isImporting}
                    >
                        Annuleren
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!selectedFile || isImporting}
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importeren...
                            </>
                        ) : (
                            <>
                                <FileUp className="mr-2 h-4 w-4" />
                                Start Import
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

