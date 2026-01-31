'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
    const [dragActive, setDragActive] = React.useState(false);
    const [file, setFile] = React.useState<File | null>(null);
    const [isUploading, setIsUploading] = React.useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.type === 'application/pdf') {
                setFile(droppedFile);
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const clearFile = () => {
        setFile(null);
    };

    const handleUpload = () => {
        setIsUploading(true);
        // Simulate upload
        setTimeout(() => {
            setIsUploading(false);
            onOpenChange(false);
            setFile(null);
        }, 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] border-emerald-500/20 bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-emerald-500">Onderzoek Uploaden</DialogTitle>
                    <DialogDescription>
                        Upload een PDF-document (WUR/PPO) om AI-inzichten te genereren en de kennisbank uit te breiden.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* File Dropzone */}
                    <div
                        className={cn(
                            "relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all duration-200",
                            dragActive ? "border-emerald-500 bg-emerald-500/10" : "border-emerald-500/20 hover:border-emerald-500/40",
                            file ? "border-emerald-500/50 bg-emerald-500/5" : ""
                        )}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        {file ? (
                            <div className="flex items-center gap-4 w-full">
                                <div className="bg-emerald-500/20 p-3 rounded-lg">
                                    <FileText className="h-8 w-8 text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={clearFile} className="shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="bg-emerald-500/10 p-4 rounded-full mb-3">
                                    <Upload className="h-8 w-8 text-emerald-500" />
                                </div>
                                <p className="text-sm font-medium">Klik om te uploaden of versleep een PDF</p>
                                <p className="text-xs text-muted-foreground mt-1">PDF tot 20MB</p>
                                <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    accept=".pdf"
                                    onChange={handleFileChange}
                                />
                            </>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title" className="text-emerald-400/80">Titel</Label>
                            <Input id="title" placeholder="Bijv: Onderzoek naar schurftresistentie 2024" className="bg-background/50 border-emerald-500/10" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="category" className="text-emerald-400/80">Categorie</Label>
                                <Select>
                                    <SelectTrigger className="bg-background/50 border-emerald-500/10">
                                        <SelectValue placeholder="Kies categorie" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="disease">Ziekte & Plagen</SelectItem>
                                        <SelectItem value="storage">Bewaring</SelectItem>
                                        <SelectItem value="cultivation">Teelt</SelectItem>
                                        <SelectItem value="general">Algemeen</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="tags" className="text-emerald-400/80">Tags</Label>
                                <Input id="tags" placeholder="Komma-gescheiden" className="bg-background/50 border-emerald-500/10" />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isUploading}>
                        Annuleren
                    </Button>
                    <Button
                        className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[120px]"
                        disabled={!file || isUploading}
                        onClick={handleUpload}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verwerken...
                            </>
                        ) : (
                            'Opslaan'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
