'use client';

import * as React from 'react';
import {
    Upload,
    Loader2,
    FileText,
    Download,
    Trash2,
    Inbox as InboxIcon,
    Link2,
} from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
    useBatchDocuments,
    useUploadBatchDocument,
    useDeleteBatchDocument,
    useBatchDocumentDownload,
    useUpdateBatchDocument,
    useBatches,
} from '@/hooks/use-data';
import {
    DOCUMENT_TYPE_LABELS,
    formatDateNL,
    autoLabelFromHarvest,
} from '@/components/afzetstromen/constants';
import type { BatchDocument, BatchDocumentType } from '@/lib/types';

export default function InboxPage() {
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [selectedType, setSelectedType] = React.useState<BatchDocumentType>('overig');
    const [isDragging, setIsDragging] = React.useState(false);

    const [linkingDoc, setLinkingDoc] = React.useState<BatchDocument | null>(null);
    const [linkBatchId, setLinkBatchId] = React.useState<string>('');
    const [linkType, setLinkType] = React.useState<BatchDocumentType>('overig');

    const { data: inboxDocs = [], isLoading } = useBatchDocuments({ onlyInbox: true });
    const { data: batches = [] } = useBatches();

    const uploadDoc = useUploadBatchDocument();
    const deleteDoc = useDeleteBatchDocument();
    const downloadDoc = useBatchDocumentDownload();
    const updateDoc = useUpdateBatchDocument();

    const handleFileList = async (files: FileList) => {
        for (const file of Array.from(files)) {
            try {
                await uploadDoc.mutateAsync({ file, batchId: null, documentType: selectedType });
            } catch (error) {
                toast({
                    title: `Upload mislukt: ${file.name}`,
                    description: error instanceof Error ? error.message : 'Er ging iets mis.',
                    variant: 'destructive',
                });
            }
        }
        toast({ title: `${files.length} bestand(en) geüpload naar inbox` });
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        await handleFileList(files);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (!e.dataTransfer.files?.length) return;
        await handleFileList(e.dataTransfer.files);
    };

    const handleDownloadDoc = async (doc: BatchDocument) => {
        try {
            const url = await downloadDoc.mutateAsync(doc.storagePath);
            window.open(url, '_blank');
        } catch (error) {
            toast({
                title: 'Download mislukt',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc.mutateAsync(id);
            toast({ title: 'Document verwijderd' });
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const openLinkDialog = (doc: BatchDocument) => {
        setLinkingDoc(doc);
        setLinkBatchId('');
        setLinkType(doc.documentType);
    };

    const handleLink = async () => {
        if (!linkingDoc || !linkBatchId) return;
        try {
            await updateDoc.mutateAsync({
                id: linkingDoc.id,
                updates: {
                    batchId: linkBatchId,
                    documentType: linkType,
                    processingStatus: 'linked',
                },
            });
            toast({ title: 'Document gekoppeld aan partij' });
            setLinkingDoc(null);
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Inbox</CardTitle>
                <CardDescription>
                    Upload documenten zonder direct een partij te kiezen. Koppel ze later aan de juiste partij.
                </CardDescription>
            </div>

            {/* Upload zone */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                    isDragging
                        ? 'border-emerald-500 bg-emerald-500/5'
                        : 'border-white/10 bg-card/20'
                }`}
            >
                <Upload className="h-10 w-10 text-slate-500 mx-auto mb-3" />
                <p className="text-sm text-slate-300 mb-1">
                    Sleep bestanden hierheen of
                </p>
                <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                    Selecteer bestanden
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelected}
                    accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp"
                />
                <p className="text-[11px] text-slate-500 mt-3">
                    PDF, CSV, Excel of afbeelding — max 20 MB per bestand
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                    <Label htmlFor="default-type" className="text-[12px] text-slate-400">
                        Standaard type:
                    </Label>
                    <Select
                        value={selectedType}
                        onValueChange={(v) => setSelectedType(v as BatchDocumentType)}
                    >
                        <SelectTrigger id="default-type" className="w-[180px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(DOCUMENT_TYPE_LABELS) as BatchDocumentType[]).map((t) => (
                                <SelectItem key={t} value={t}>
                                    {DOCUMENT_TYPE_LABELS[t]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : inboxDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <InboxIcon className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400 max-w-md">
                        De inbox is leeg. Alle geüploade documenten zijn al gekoppeld aan een partij.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wider mb-3">
                        Niet-gekoppelde documenten ({inboxDocs.length})
                    </h3>
                    {inboxDocs.map((doc) => (
                        <div
                            key={doc.id}
                            className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.06] bg-card/30 backdrop-blur-md hover:border-white/[0.12] transition-colors"
                        >
                            <div className="shrink-0 h-10 w-10 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                                <FileText className="h-5 w-5 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-white truncate">
                                    {doc.filename || 'Document'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                    {DOCUMENT_TYPE_LABELS[doc.documentType]} ·{' '}
                                    {formatDateNL(doc.uploadedAt)}
                                    {doc.sizeBytes
                                        ? ` · ${Math.round(doc.sizeBytes / 1024)} KB`
                                        : ''}
                                </div>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openLinkDialog(doc)}
                                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            >
                                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                                Koppelen
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDownloadDoc(doc)}
                                className="h-8 w-8 text-slate-400 hover:text-white"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(doc.id)}
                                className="h-8 w-8 text-slate-400 hover:text-red-400"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Link Dialog */}
            <Dialog
                open={!!linkingDoc}
                onOpenChange={(o) => {
                    if (!o) setLinkingDoc(null);
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Document koppelen</DialogTitle>
                        <DialogDescription>
                            {linkingDoc?.filename ?? 'Document'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="link-batch">Partij</Label>
                            <Select value={linkBatchId} onValueChange={setLinkBatchId}>
                                <SelectTrigger id="link-batch">
                                    <SelectValue placeholder="Kies een partij…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {batches.map((b) => {
                                        const label =
                                            b.label ||
                                            autoLabelFromHarvest({
                                                variety: b.variety,
                                                pickNumber: b.pickNumber,
                                                subParcelName: b.subParcelName,
                                                parcelName: b.parcelName,
                                                year: b.harvestYear,
                                            });
                                        return (
                                            <SelectItem key={b.id} value={b.id}>
                                                {label}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="link-type">Documenttype</Label>
                            <Select
                                value={linkType}
                                onValueChange={(v) => setLinkType(v as BatchDocumentType)}
                            >
                                <SelectTrigger id="link-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(DOCUMENT_TYPE_LABELS) as BatchDocumentType[]).map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {DOCUMENT_TYPE_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLinkingDoc(null)}>
                            Annuleren
                        </Button>
                        <Button
                            onClick={handleLink}
                            disabled={!linkBatchId || updateDoc.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {updateDoc.isPending ? 'Koppelen…' : 'Koppelen'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
