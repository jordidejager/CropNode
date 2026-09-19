'use client';

import * as React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, CalendarIcon, CheckCircle, Loader2, MessageSquareQuote, Plus, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ComboboxOption } from '@/components/ui/combobox';
import { SpotlightCard } from '@/components/ui/premium';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { LogbookEntry, ProductEntry, RegistrationType, SprayReviewAssumption } from '@/lib/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import { EditableProduct, EditableParcels } from './editable-entry';
import { ValidationFeedback } from './validation-feedback';
import { approveSprayDraft, deleteSprayDraft, reprocessSprayDraft, saveSprayDraft } from '@/app/spray-inbox-actions';

interface SprayInboxCardProps {
    entry: LogbookEntry;
    allParcels: SprayableParcel[];
    productOptions: ComboboxOption[];
    onChanged: () => void;
}

export function hasOpenQuestions(entry: LogbookEntry): boolean {
    const meta = entry.reviewMeta || {};
    if ((meta.uncertainFields?.length ?? 0) > 0) return true;
    if ((meta.validationFlags || []).some(f => f.type === 'error')) return true;
    if (entry.status !== 'Te Controleren') return true;
    const plots = entry.parsedData?.plots || [];
    const products = entry.parsedData?.products || [];
    return plots.length === 0 || products.length === 0 || products.some(p => !p.dosage || p.dosage <= 0);
}

export function SprayInboxCard({ entry, allParcels, productOptions, onChanged }: SprayInboxCardProps) {
    const { toast } = useToast();
    const meta = entry.reviewMeta || {};
    const isProcessing = entry.status === 'Nieuw' || entry.status === 'Analyseren...';
    const isError = entry.status === 'Fout';

    const [date, setDate] = React.useState<Date>(entry.date);
    const [plots, setPlots] = React.useState<string[]>(entry.parsedData?.plots || []);
    const [products, setProducts] = React.useState<ProductEntry[]>(entry.parsedData?.products || []);
    const [registrationType, setRegistrationType] = React.useState<RegistrationType>(entry.registrationType || 'spraying');
    const [busy, setBusy] = React.useState<'approve' | 'save' | 'delete' | 'reprocess' | null>(null);
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    // Background processing may update the row while the card is mounted.
    const syncKey = `${entry.status}|${entry.reviewMeta?.processingMs ?? ''}`;
    React.useEffect(() => {
        setDate(entry.date);
        setPlots(entry.parsedData?.plots || []);
        setProducts(entry.parsedData?.products || []);
        setRegistrationType(entry.registrationType || 'spraying');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncKey]);

    const selectedParcels = allParcels.filter(p => plots.includes(p.id));
    const totalArea = selectedParcels.reduce((sum, p) => sum + (p.area || 0), 0);
    const uncertain = new Set(meta.uncertainFields || []);
    const assumptionsFor = (field: SprayReviewAssumption['field'], index?: number) =>
        (meta.assumptions || []).filter(a => a.field === field && (index === undefined || a.productIndex === index));

    const canApprove = !isProcessing && plots.length > 0 && products.length > 0 && products.every(p => p.product && p.dosage > 0);

    const edit = () => ({ date, plots, products, registrationType });

    const handleApprove = async () => {
        setBusy('approve');
        try {
            const result = await approveSprayDraft(entry.id, edit());
            if (result.success) {
                toast({ title: 'Geregistreerd', description: 'De registratie staat in het spuitschrift.' });
                onChanged();
            } else {
                toast({ variant: 'destructive', title: 'Goedkeuren mislukt', description: result.message });
            }
        } finally {
            setBusy(null);
        }
    };

    const handleSave = async () => {
        setBusy('save');
        try {
            const result = await saveSprayDraft(entry.id, edit());
            if (result.success) {
                toast({ title: 'Concept bewaard' });
                onChanged();
            } else {
                toast({ variant: 'destructive', title: 'Bewaren mislukt', description: result.message });
            }
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        setBusy('delete');
        try {
            const result = await deleteSprayDraft(entry.id);
            if (result.success) {
                toast({ title: 'Concept verwijderd' });
                onChanged();
            } else {
                toast({ variant: 'destructive', title: 'Verwijderen mislukt', description: result.message });
            }
        } finally {
            setBusy(null);
            setDeleteOpen(false);
        }
    };

    const handleReprocess = async () => {
        setBusy('reprocess');
        try {
            const result = await reprocessSprayDraft(entry.id);
            if (!result.success) toast({ variant: 'destructive', title: 'Opnieuw verwerken mislukt', description: result.message });
            onChanged();
        } finally {
            setBusy(null);
        }
    };

    const updateProduct = (index: number, updated: ProductEntry) => {
        setProducts(prev => prev.map((p, i) => (i === index ? updated : p)));
    };

    return (
        <SpotlightCard color={isError ? 'amber' : 'emerald'} padding="p-0">
            <div className="p-4 sm:p-5 space-y-5">
                {/* Raw note */}
                <div className="flex items-start gap-3">
                    <MessageSquareQuote className="h-5 w-5 mt-0.5 shrink-0 text-emerald-400/70" />
                    <div className="flex-1 min-w-0">
                        <p className="text-base text-white whitespace-pre-wrap break-words leading-snug">{entry.rawInput}</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Ontvangen {formatDistanceToNow(entry.createdAt, { locale: nl, addSuffix: true })}
                            {' · '}{format(entry.createdAt, 'dd-MM HH:mm')}
                        </p>
                    </div>
                    <StatusBadge status={entry.status} />
                </div>

                {isProcessing && (
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Wordt op de achtergrond omgezet naar een registratie…
                    </p>
                )}

                {isError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Automatisch lezen mislukt{meta.error ? `: ${meta.error}` : ''}. Vul hieronder handmatig aan of probeer opnieuw.</span>
                        </div>
                    </div>
                )}

                {(meta.validationFlags?.length ?? 0) > 0 && (
                    <ValidationFeedback flags={meta.validationFlags!} compact />
                )}

                {!isProcessing && (
                    <>
                        {/* Date + type */}
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                            <div className="space-y-2">
                                <Label className="text-sm text-slate-300 font-medium">Datum & tijd</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-12 text-base', uncertain.has('date') && 'border-yellow-500/50')}>
                                            <CalendarIcon className="mr-2 h-5 w-5" />
                                            {format(date, "dd MMMM yyyy 'om' HH:mm", { locale: nl })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={(d) => {
                                                if (!d) return;
                                                const next = new Date(d);
                                                next.setHours(date.getHours(), date.getMinutes());
                                                setDate(next);
                                            }}
                                            locale={nl}
                                        />
                                        <div className="p-3 border-t">
                                            <Label className="text-sm text-muted-foreground">Tijd</Label>
                                            <Input
                                                type="time"
                                                value={format(date, 'HH:mm')}
                                                onChange={(e) => {
                                                    const [h, m] = e.target.value.split(':').map(Number);
                                                    const next = new Date(date);
                                                    next.setHours(h, m);
                                                    setDate(next);
                                                }}
                                                className="mt-1 h-11 text-base"
                                            />
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm text-slate-300 font-medium">Type</Label>
                                <div className="flex rounded-xl border border-white/10 p-1 h-12">
                                    {(['spraying', 'spreading'] as RegistrationType[]).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setRegistrationType(t)}
                                            className={cn(
                                                'px-4 rounded-lg text-sm font-medium transition-colors',
                                                registrationType === t ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                                            )}
                                        >
                                            {t === 'spraying' ? 'Spuiten' : 'Strooien'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Parcels */}
                        <div className={cn('space-y-2 rounded-xl', uncertain.has('plots') && 'ring-1 ring-yellow-500/50 p-3 -m-3')}>
                            <Label className="text-sm text-slate-300 font-medium">
                                Percelen ({totalArea.toFixed(2)} ha)
                                {uncertain.has('plots') && <span className="ml-2 text-yellow-400 text-xs font-normal">Geen percelen herkend</span>}
                            </Label>
                            <EditableParcels selectedIds={plots} allParcels={allParcels} onChange={setPlots} />
                        </div>

                        {/* Products */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm text-slate-300 font-medium">
                                    Middelen
                                    {uncertain.has('products') && <span className="ml-2 text-yellow-400 text-xs font-normal">Geen middelen herkend</span>}
                                </Label>
                                <Button variant="outline" size="sm" className="h-10 text-sm" onClick={() => setProducts([...products, { product: '', dosage: 0, unit: 'L/ha' }])}>
                                    <Plus className="h-4 w-4 mr-1" /> Middel toevoegen
                                </Button>
                            </div>
                            {products.map((product, index) => {
                                const productUncertain = uncertain.has(`products[${index}].product`);
                                const dosageUncertain = uncertain.has(`products[${index}].dosage`) && (!product.dosage || product.dosage <= 0);
                                const suggestions = (entry.parsedData?.products?.[index]?.suggestions || []).map(s => s.naam).filter(n => n && n !== product.product);
                                const chips = [...assumptionsFor('product', index), ...assumptionsFor('dosage', index)];
                                return (
                                    <div key={index} className={cn('rounded-2xl', (productUncertain || dosageUncertain) && 'ring-1 ring-yellow-500/50')}>
                                        <EditableProduct
                                            product={product}
                                            allProducts={productOptions}
                                            totalArea={totalArea}
                                            onUpdate={(updated) => updateProduct(index, updated)}
                                            onRemove={() => setProducts(products.filter((_, i) => i !== index))}
                                            label="Middel"
                                            tint={registrationType === 'spreading' ? 'lime' : 'emerald'}
                                        />
                                        {(chips.length > 0 || suggestions.length > 0 || productUncertain || dosageUncertain) && (
                                            <div className="px-4 pb-3 -mt-2 flex flex-wrap gap-2 items-center">
                                                {chips.map((a, i) => (
                                                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                                        {a.field === 'product' ? `${a.to} ← ${a.from}` : a.to} · {a.reason}
                                                    </span>
                                                ))}
                                                {productUncertain && suggestions.length === 0 && (
                                                    <span className="text-xs text-yellow-400">Middel niet herkend — kies hierboven</span>
                                                )}
                                                {dosageUncertain && (
                                                    <span className="text-xs text-yellow-400">Dosering ontbreekt</span>
                                                )}
                                                {suggestions.length > 0 && (
                                                    <span className="text-xs text-slate-400 w-full sm:w-auto">Bedoel je:</span>
                                                )}
                                                {suggestions.slice(0, 5).map(name => (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        onClick={() => updateProduct(index, { ...product, product: name, resolved: true })}
                                                        className="text-xs px-3 py-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/20 min-h-[32px]"
                                                    >
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {products.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-3">Geen middelen. Voeg een middel toe.</p>
                            )}
                        </div>
                    </>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-white/[0.06]">
                    <Button size="lg" className="h-12 text-base flex-1" onClick={handleApprove} disabled={!canApprove || busy !== null}>
                        {busy === 'approve' ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle className="h-5 w-5 mr-2" />}
                        Goedkeuren
                    </Button>
                    {!isProcessing && (
                        <Button variant="outline" size="lg" className="h-12 text-base" onClick={handleSave} disabled={busy !== null}>
                            {busy === 'save' ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
                            Bewaren
                        </Button>
                    )}
                    {(isError || isProcessing) && (
                        <Button variant="outline" size="lg" className="h-12 text-base" onClick={handleReprocess} disabled={busy !== null}>
                            {busy === 'reprocess' ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <RefreshCcw className="h-5 w-5 mr-2" />}
                            Opnieuw verwerken
                        </Button>
                    )}
                    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-12 text-base text-destructive hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                            onClick={() => setDeleteOpen(true)}
                            disabled={busy !== null}
                        >
                            <Trash2 className="h-5 w-5 mr-2" /> Verwijderen
                        </Button>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Concept verwijderen?</AlertDialogTitle>
                                <AlertDialogDescription>De notitie wordt niet geregistreerd en verdwijnt uit de inbox.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                                    {busy === 'delete' ? 'Verwijderen…' : 'Verwijderen'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </SpotlightCard>
    );
}

function StatusBadge({ status }: { status: LogbookEntry['status'] }) {
    if (status === 'Nieuw' || status === 'Analyseren...') {
        return <Badge variant="secondary" className="animate-pulse shrink-0">Verwerken…</Badge>;
    }
    if (status === 'Fout') {
        return <Badge variant="destructive" className="shrink-0">Fout</Badge>;
    }
    return <Badge variant="outline" className="shrink-0 border-yellow-500/40 text-yellow-300">Te controleren</Badge>;
}
