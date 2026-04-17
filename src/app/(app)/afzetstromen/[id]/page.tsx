'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    Loader2,
    Package,
    MapPin,
    Snowflake,
    Calendar,
    Pencil,
    Trash2,
    FileText,
    Download,
    Upload,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
    useBatch,
    useBatchEvents,
    useBatchDocuments,
    useCreateBatchEvent,
    useUpdateBatchEvent,
    useDeleteBatchEvent,
    useUpdateBatch,
    useDeleteBatch,
    useStorageCells,
    useUploadBatchDocument,
    useDeleteBatchDocument,
    useBatchDocumentDownload,
} from '@/hooks/use-data';
import { BatchEventTimeline } from '@/components/afzetstromen/batch-event-timeline';
import { EventFormDialog } from '@/components/afzetstromen/event-form-dialog';
import { BatchFormDialog } from '@/components/afzetstromen/batch-form-dialog';
import { BatchParcelsSection } from '@/components/afzetstromen/batch-parcels-section';
import {
    EVENT_TYPE_ICONS,
    EVENT_TYPE_LABELS,
    MVP_EVENT_TYPES,
    FUTURE_EVENT_TYPES,
    STATUS_COLORS,
    STATUS_LABELS,
    autoLabelFromHarvest,
    formatDateNL,
    formatEuro,
    formatKg,
    DOCUMENT_TYPE_LABELS,
} from '@/components/afzetstromen/constants';
import { cn } from '@/lib/utils';
import type {
    BatchEvent,
    BatchEventInput,
    BatchEventType,
    BatchInput,
} from '@/lib/types';

export default function BatchDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { toast } = useToast();
    const id = params.id;

    const { data: batch, isLoading } = useBatch(id);
    const { data: events = [] } = useBatchEvents(id);
    const { data: documents = [] } = useBatchDocuments({ batchId: id });
    const { data: storageCells = [] } = useStorageCells();

    const createEvent = useCreateBatchEvent();
    const updateEvent = useUpdateBatchEvent();
    const deleteEventMut = useDeleteBatchEvent();
    const updateBatchMut = useUpdateBatch();
    const deleteBatchMut = useDeleteBatch();
    const uploadDoc = useUploadBatchDocument();
    const deleteDocMut = useDeleteBatchDocument();
    const downloadDoc = useBatchDocumentDownload();

    // Dialog state
    const [eventDialog, setEventDialog] = React.useState<{
        open: boolean;
        type: BatchEventType;
        event: BatchEvent | null;
    }>({ open: false, type: 'transport', event: null });
    const [deletingEvent, setDeletingEvent] = React.useState<BatchEvent | null>(null);
    const [batchEditOpen, setBatchEditOpen] = React.useState(false);
    const [batchDeleteOpen, setBatchDeleteOpen] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Handlers
    const handleAddEvent = (type: BatchEventType) => {
        setEventDialog({ open: true, type, event: null });
    };

    const handleEditEvent = (event: BatchEvent) => {
        setEventDialog({ open: true, type: event.eventType, event });
    };

    const handleSubmitEvent = async (data: BatchEventInput) => {
        try {
            if (eventDialog.event) {
                await updateEvent.mutateAsync({
                    id: eventDialog.event.id,
                    batchId: id,
                    updates: data,
                });
                toast({ title: 'Event bijgewerkt' });
            } else {
                await createEvent.mutateAsync(data);
                toast({ title: `${EVENT_TYPE_LABELS[data.eventType]} toegevoegd` });
            }
            setEventDialog({ open: false, type: eventDialog.type, event: null });
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleDeleteEvent = async () => {
        if (!deletingEvent) return;
        try {
            await deleteEventMut.mutateAsync({ id: deletingEvent.id, batchId: id });
            toast({ title: 'Event verwijderd' });
            setDeletingEvent(null);
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleUpdateBatch = async (data: BatchInput) => {
        try {
            await updateBatchMut.mutateAsync({ id, updates: data });
            toast({ title: 'Partij bijgewerkt' });
            setBatchEditOpen(false);
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleDeleteBatch = async () => {
        try {
            await deleteBatchMut.mutateAsync(id);
            toast({ title: 'Partij verwijderd' });
            router.replace('/afzetstromen');
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await uploadDoc.mutateAsync({ file, batchId: id, documentType: 'overig' });
            toast({ title: 'Document geüpload' });
        } catch (error) {
            toast({
                title: 'Upload mislukt',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownloadDoc = async (storagePath: string, filename: string | null) => {
        try {
            const url = await downloadDoc.mutateAsync(storagePath);
            window.open(url, '_blank');
        } catch (error) {
            toast({
                title: 'Download mislukt',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    const handleDeleteDoc = async (docId: string) => {
        try {
            await deleteDocMut.mutateAsync(docId);
            toast({ title: 'Document verwijderd' });
        } catch (error) {
            toast({
                title: 'Fout',
                description: error instanceof Error ? error.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="py-16 text-center">
                <p className="text-slate-400 mb-4">Partij niet gevonden.</p>
                <Button asChild variant="outline">
                    <Link href="/afzetstromen">Terug naar overzicht</Link>
                </Button>
            </div>
        );
    }

    const displayLabel =
        batch.label ||
        autoLabelFromHarvest({
            variety: batch.variety,
            pickNumber: batch.pickNumber,
            subParcelName: batch.subParcelName,
            parcelName: batch.parcelName,
            year: batch.harvestYear,
        });

    const margin = batch.marginEur ?? 0;
    const hasFinancials = (batch.totalCostEur ?? 0) > 0 || (batch.totalRevenueEur ?? 0) > 0;
    const netPerKg =
        hasFinancials && (batch.totalKgIn ?? 0) > 0
            ? margin / (batch.totalKgIn as number)
            : null;

    return (
        <div className="space-y-6">
            {/* Back button */}
            <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white -ml-3">
                <Link href="/afzetstromen">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Terug naar overzicht
                </Link>
            </Button>

            {/* Header card */}
            <div className="rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                            <CardTitle className="text-xl">{displayLabel}</CardTitle>
                            <span
                                className={cn(
                                    'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border',
                                    STATUS_COLORS[batch.status]
                                )}
                            >
                                {STATUS_LABELS[batch.status]}
                            </span>
                        </div>
                        <CardDescription>
                            {batch.variety && <span>{batch.variety}</span>}
                            {batch.season && (
                                <span className="ml-2 text-slate-500">· Seizoen {batch.season}</span>
                            )}
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setBatchEditOpen(true)}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Bewerken
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBatchDeleteOpen(true)}
                            className="text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Verwijderen
                        </Button>
                    </div>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-slate-300 mt-4">
                    {(batch.subParcelName || batch.parcelName) && (
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-slate-500" />
                            <span>{batch.subParcelName || batch.parcelName}</span>
                        </div>
                    )}
                    {batch.harvestDate && (
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <span>{formatDateNL(batch.harvestDate)}</span>
                        </div>
                    )}
                    {batch.currentStorageCellName ? (
                        <div className="flex items-center gap-2 text-sky-400">
                            <Snowflake className="h-4 w-4" />
                            <span className="font-semibold">In koelcel {batch.currentStorageCellName}</span>
                        </div>
                    ) : batch.lastStorageEventType === 'uitslag' ? (
                        <div className="flex items-center gap-2 text-slate-500">
                            <Snowflake className="h-4 w-4" />
                            <span>Uitgeslagen</span>
                        </div>
                    ) : null}
                </div>

                {batch.reservedFor && (
                    <div className="mt-3 text-[13px] text-amber-400">
                        <span className="font-bold">Gereserveerd voor:</span>{' '}
                        <span className="text-amber-300">{batch.reservedFor}</span>
                    </div>
                )}

                {batch.notes && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06] text-[13px] text-slate-300">
                        {batch.notes}
                    </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/[0.06]">
                    <StatBox
                        label="Kg in"
                        value={formatKg(batch.totalKgIn)}
                        accent="text-white"
                    />
                    <StatBox
                        label="Kg uit"
                        value={formatKg(batch.totalKgOut)}
                        accent="text-white"
                    />
                    <StatBox
                        label="Totale kosten"
                        value={formatEuro(batch.totalCostEur)}
                        accent="text-amber-400"
                    />
                    <StatBox
                        label="Totale opbrengst"
                        value={formatEuro(batch.totalRevenueEur)}
                        accent="text-emerald-400"
                    />
                </div>

                {hasFinancials && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] text-slate-500 uppercase tracking-wider font-bold">
                                Marge
                            </span>
                            <span
                                className={cn(
                                    'text-xl font-bold',
                                    margin >= 0 ? 'text-emerald-400' : 'text-red-400'
                                )}
                            >
                                {formatEuro(margin)}
                            </span>
                        </div>
                        {netPerKg != null && (
                            <div className="flex items-center gap-3">
                                <span className="text-[12px] text-slate-500 uppercase tracking-wider font-bold">
                                    Netto €/kg
                                </span>
                                <span
                                    className={cn(
                                        'text-xl font-bold',
                                        netPerKg >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    )}
                                >
                                    {formatEuro(netPerKg)}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Gekoppelde percelen */}
            <BatchParcelsSection batchId={id} />

            {/* Timeline + Documents section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Timeline */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[15px] font-bold text-white">Event-timeline</h2>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                                    <Plus className="h-4 w-4 mr-1.5" />
                                    Event toevoegen
                                    <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {MVP_EVENT_TYPES.map((type) => {
                                    const Icon = EVENT_TYPE_ICONS[type];
                                    return (
                                        <DropdownMenuItem
                                            key={type}
                                            onClick={() => handleAddEvent(type)}
                                            className="cursor-pointer"
                                        >
                                            <Icon className="h-4 w-4 mr-2 text-slate-400" />
                                            {EVENT_TYPE_LABELS[type]}
                                        </DropdownMenuItem>
                                    );
                                })}
                                {FUTURE_EVENT_TYPES.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        {FUTURE_EVENT_TYPES.map((type) => {
                                            const Icon = EVENT_TYPE_ICONS[type];
                                            return (
                                                <DropdownMenuItem
                                                    key={type}
                                                    onClick={() => handleAddEvent(type)}
                                                    className="cursor-pointer"
                                                >
                                                    <Icon className="h-4 w-4 mr-2 text-slate-400" />
                                                    {EVENT_TYPE_LABELS[type]}
                                                    <span className="ml-auto text-[9px] font-bold text-cyan-400 uppercase tracking-wider">
                                                        Beta
                                                    </span>
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <BatchEventTimeline
                        events={events}
                        onEdit={handleEditEvent}
                        onDelete={(event) => setDeletingEvent(event)}
                    />
                </div>

                {/* Documents sidebar */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[15px] font-bold text-white">Documenten</h2>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelected}
                            accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadDoc.isPending}
                        >
                            {uploadDoc.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4 mr-1.5" />
                            )}
                            Upload
                        </Button>
                    </div>

                    {documents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                            <FileText className="h-6 w-6 text-slate-500 mx-auto mb-2" />
                            <p className="text-[12px] text-slate-400">
                                Nog geen documenten. Upload facturen, sorteeroverzichten of klantorders.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="flex items-center gap-2 p-3 rounded-xl border border-white/[0.06] bg-card/30 hover:border-white/[0.12] transition-colors"
                                >
                                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold text-white truncate">
                                            {doc.filename || 'Document'}
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                            {DOCUMENT_TYPE_LABELS[doc.documentType]} ·{' '}
                                            {formatDateNL(doc.uploadedAt)}
                                        </div>
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-400 hover:text-white"
                                        onClick={() => handleDownloadDoc(doc.storagePath, doc.filename)}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-400 hover:text-red-400"
                                        onClick={() => handleDeleteDoc(doc.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <EventFormDialog
                open={eventDialog.open}
                onOpenChange={(open) =>
                    setEventDialog((s) => ({ ...s, open }))
                }
                batchId={id}
                eventType={eventDialog.type}
                event={eventDialog.event}
                storageCells={storageCells}
                onSubmit={handleSubmitEvent}
                isSubmitting={createEvent.isPending || updateEvent.isPending}
            />

            <BatchFormDialog
                open={batchEditOpen}
                onOpenChange={setBatchEditOpen}
                batch={batch}
                onSubmit={handleUpdateBatch}
                isSubmitting={updateBatchMut.isPending}
            />

            <AlertDialog open={!!deletingEvent} onOpenChange={(o) => !o && setDeletingEvent(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Event verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Dit event wordt permanent verwijderd. Deze actie kan niet ongedaan worden gemaakt.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteEvent}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Verwijderen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Partij verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Alle events en documentverwijzingen van deze partij worden ook verwijderd.
                            Gekoppelde oogstregistraties blijven bestaan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteBatch}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Verwijderen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function StatBox({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: string;
}) {
    return (
        <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                {label}
            </div>
            <div className={cn('text-[15px] font-semibold', accent || 'text-white')}>{value}</div>
        </div>
    );
}
