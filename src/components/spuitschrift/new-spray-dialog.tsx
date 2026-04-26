'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
    CalendarIcon,
    Plus,
    Trash2,
    Loader2,
    Check,
    ChevronRight,
    ChevronLeft,
    ArrowRight,
    CalendarDays,
    MapPin,
    FlaskConical,
    CheckCircle2,
    AlertTriangle,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ProductSelector } from './product-selector';
import { UnifiedParcelMultiSelect } from '@/components/domain/unified-parcel-multi-select';
import { DosageTotalField, formatTotalUsage, perHaUnit } from './dosage-total-field';
import { useParcelGroups } from '@/hooks/use-data';
import { useParcelGroupOptions } from '@/hooks/use-parcel-group-options';
import type { ParcelGroupOption, ParcelGroup } from '@/lib/types';
import { ValidationFeedback, type ValidationFlag } from './validation-feedback';
import type { SprayableParcel } from '@/lib/supabase-store';
import type { CtgbProduct, ProductEntry } from '@/lib/types';
import { addManualSprayEntry } from '@/app/actions';
import { GlowOrb } from '@/components/ui/premium';
import { motion, AnimatePresence } from 'framer-motion';

interface ProductRow {
    id: string;
    product: string;
    ctgbProduct?: CtgbProduct;
    dosage: number;
    unit: string;
}

interface NewSprayDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parcels: SprayableParcel[];
    onSuccess?: () => void;
}

type Step = 0 | 1 | 2 | 3;

const STEPS: { key: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 0, label: 'Wanneer', icon: CalendarDays },
    { key: 1, label: 'Percelen', icon: MapPin },
    { key: 2, label: 'Middelen', icon: FlaskConical },
    { key: 3, label: 'Bevestigen', icon: CheckCircle2 },
];

const DOSAGE_PRESETS = [0.25, 0.5, 1, 1.5, 2, 2.5];

export function NewSprayDialog({
    open,
    onOpenChange,
    parcels,
    onSuccess,
}: NewSprayDialogProps) {
    const { toast } = useToast();
    const { data: parcelGroups = [] } = useParcelGroups();
    const { data: parcelGroupOptions = [] } = useParcelGroupOptions();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Wizard state
    const [step, setStep] = React.useState<Step>(0);
    const [date, setDate] = React.useState<Date>(new Date());
    const [time, setTime] = React.useState<string>(format(new Date(), 'HH:mm'));
    const [selectedParcelIds, setSelectedParcelIds] = React.useState<string[]>([]);
    const [products, setProducts] = React.useState<ProductRow[]>([
        { id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' },
    ]);
    const [notes, setNotes] = React.useState('');

    // Save-time validation results (not live)
    const [saveValidation, setSaveValidation] = React.useState<{
        flags: ValidationFlag[];
        errorCount: number;
        warningCount: number;
    } | null>(null);

    // Reset on open
    React.useEffect(() => {
        if (open) {
            setStep(0);
            setDate(new Date());
            setTime(format(new Date(), 'HH:mm'));
            setSelectedParcelIds([]);
            setProducts([{ id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' }]);
            setNotes('');
            setSaveValidation(null);
            setIsSubmitting(false);
        }
    }, [open]);

    // ── Step validation ────────────────────────────────
    const canAdvance: Record<Step, boolean> = {
        0: true, // datum altijd gezet
        1: selectedParcelIds.length > 0,
        2: products.some(p => p.product.trim() && p.dosage > 0),
        3: true,
    };

    const goNext = () => {
        if (!canAdvance[step]) return;
        if (step < 3) setStep((step + 1) as Step);
    };
    const goBack = () => {
        if (step > 0) setStep((step - 1) as Step);
    };

    // ── Product row handlers ──────────────────────────
    const addProductRow = () => {
        setProducts([
            ...products,
            { id: crypto.randomUUID(), product: '', dosage: 0, unit: 'L/ha' },
        ]);
    };

    const removeProductRow = (id: string) => {
        if (products.length > 1) setProducts(products.filter(p => p.id !== id));
    };

    const updateProduct = (id: string, patch: Partial<ProductRow>) => {
        setProducts(products.map(p => p.id === id ? { ...p, ...patch } : p));
    };

    // ── Submit ────────────────────────────────────────
    const handleSubmit = async () => {
        const validProducts = products.filter(p => p.product.trim() && p.dosage > 0);
        if (!validProducts.length || !selectedParcelIds.length) return;

        setIsSubmitting(true);
        setSaveValidation(null);
        try {
            const [hh, mm] = time.split(':').map(Number);
            const applicationDate = new Date(date);
            applicationDate.setHours(hh, mm, 0, 0);

            const productEntries: ProductEntry[] = validProducts.map(p => ({
                product: p.product,
                dosage: p.dosage,
                unit: p.unit,
            }));

            const result = await addManualSprayEntry({
                date: applicationDate,
                plots: selectedParcelIds,
                products: productEntries,
                notes: notes.trim() || undefined,
            });

            if (result.success) {
                toast({
                    title: 'Bespuiting toegevoegd',
                    description: 'De bespuiting is succesvol geregistreerd.',
                });
                onOpenChange(false);
                onSuccess?.();
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Fout bij opslaan',
                    description: result.message || 'Er is een fout opgetreden.',
                });
            }
        } catch {
            toast({
                variant: 'destructive',
                title: 'Fout bij opslaan',
                description: 'Er is een onverwachte fout opgetreden.',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedParcels = parcels.filter(p => selectedParcelIds.includes(p.id));
    const totalArea = selectedParcels.reduce((s, p) => s + (p.area || 0), 0);
    const validProducts = products.filter(p => p.product.trim() && p.dosage > 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-3xl max-h-[95vh] h-auto overflow-y-auto p-0 gap-0 bg-[#0a0f1a] border-white/10"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {/* Ambient orb */}
                <GlowOrb color="emerald" position="top-right" size="w-[300px] h-[200px]" blur="blur-[120px]" opacity={0.08} />
                <GlowOrb color="lime" position="bottom-left" size="w-[260px] h-[180px]" blur="blur-[120px]" opacity={0.05} />

                <DialogTitle className="sr-only">Nieuwe bespuiting toevoegen</DialogTitle>

                {/* Header / Step indicator */}
                <div className="relative p-6 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Nieuwe bespuiting</h2>
                            <p className="text-sm text-slate-400">Stap {step + 1} van 4 — {STEPS[step].label}</p>
                        </div>
                    </div>

                    {/* Step pills */}
                    <div className="flex items-center gap-2">
                        {STEPS.map((s, idx) => {
                            const Icon = s.icon;
                            const isActive = idx === step;
                            const isDone = idx < step;
                            return (
                                <React.Fragment key={s.key}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Allow jumping backwards only
                                            if (idx <= step) setStep(idx as Step);
                                        }}
                                        disabled={idx > step}
                                        className={cn(
                                            'flex items-center gap-2 h-10 px-3 rounded-full border transition-all text-sm font-medium',
                                            isActive && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
                                            isDone && 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500/80 hover:bg-emerald-500/10',
                                            !isActive && !isDone && 'bg-white/[0.02] border-white/[0.06] text-slate-500',
                                        )}
                                    >
                                        {isDone ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Icon className="h-4 w-4" />
                                        )}
                                        <span className="hidden sm:inline">{s.label}</span>
                                    </button>
                                    {idx < STEPS.length - 1 && (
                                        <div className={cn(
                                            'flex-1 h-px',
                                            idx < step ? 'bg-emerald-500/40' : 'bg-white/[0.06]',
                                        )} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Body */}
                <div className="relative p-6 min-h-[360px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -12 }}
                            transition={{ duration: 0.2 }}
                        >
                            {step === 0 && (
                                <StepWhen
                                    date={date}
                                    time={time}
                                    onDateChange={setDate}
                                    onTimeChange={setTime}
                                />
                            )}
                            {step === 1 && (
                                <StepParcels
                                    parcels={parcels}
                                    selectedIds={selectedParcelIds}
                                    onChange={setSelectedParcelIds}
                                    groups={parcelGroupOptions}
                                    favoriteGroups={parcelGroups}
                                    totalArea={totalArea}
                                    selectedCount={selectedParcels.length}
                                />
                            )}
                            {step === 2 && (
                                <StepProducts
                                    products={products}
                                    totalArea={totalArea}
                                    onAdd={addProductRow}
                                    onRemove={removeProductRow}
                                    onUpdate={updateProduct}
                                />
                            )}
                            {step === 3 && (
                                <StepConfirm
                                    date={date}
                                    time={time}
                                    selectedParcels={selectedParcels}
                                    totalArea={totalArea}
                                    products={validProducts}
                                    notes={notes}
                                    onNotesChange={setNotes}
                                    validation={saveValidation}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="relative border-t border-white/[0.06] p-5 flex items-center justify-between gap-3 bg-white/[0.01]">
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={step === 0 ? () => onOpenChange(false) : goBack}
                        disabled={isSubmitting}
                        className="h-12 px-5 text-base"
                    >
                        {step === 0 ? (
                            'Annuleren'
                        ) : (
                            <>
                                <ChevronLeft className="h-5 w-5 mr-1" />
                                Terug
                            </>
                        )}
                    </Button>

                    {step < 3 ? (
                        <Button
                            type="button"
                            size="lg"
                            onClick={goNext}
                            disabled={!canAdvance[step]}
                            className="h-12 px-6 text-base font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            Volgende
                            <ChevronRight className="h-5 w-5 ml-1" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            size="lg"
                            onClick={handleSubmit}
                            disabled={isSubmitting || validProducts.length === 0 || selectedParcelIds.length === 0}
                            className="h-12 px-6 text-base font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-900 disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                    Opslaan...
                                </>
                            ) : (
                                <>
                                    Opslaan
                                    <ArrowRight className="h-5 w-5 ml-2" />
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ============================================
// Step 1 — Wanneer
// ============================================

function StepWhen({
    date,
    time,
    onDateChange,
    onTimeChange,
}: {
    date: Date;
    time: string;
    onDateChange: (d: Date) => void;
    onTimeChange: (t: string) => void;
}) {
    const today = React.useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    const yesterday = React.useMemo(() => {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        return d;
    }, [today]);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const isOther = !isToday && !isYesterday;

    const quickButton = (label: string, active: boolean, onClick: () => void) => (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'h-20 rounded-2xl border-2 transition-all font-semibold text-lg',
                active
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10'
                    : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]',
            )}
        >
            {label}
        </button>
    );

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1">Wanneer heb je gespoten?</h3>
                <p className="text-base text-slate-400">Kies een datum en tijd voor deze bespuiting.</p>
            </div>

            {/* Quick date buttons */}
            <div className="grid grid-cols-3 gap-3">
                {quickButton('Vandaag', isToday, () => {
                    const d = new Date();
                    onDateChange(d);
                    onTimeChange(format(d, 'HH:mm'));
                })}
                {quickButton('Gisteren', isYesterday, () => {
                    onDateChange(yesterday);
                })}
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'h-20 rounded-2xl border-2 transition-all font-semibold text-lg flex items-center justify-center gap-2',
                                isOther
                                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                    : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]',
                            )}
                        >
                            <CalendarIcon className="h-5 w-5" />
                            Kies datum
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(d) => d && onDateChange(d)}
                            locale={nl}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Chosen date summary */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <CalendarIcon className="h-6 w-6 text-emerald-400 shrink-0" />
                <div className="flex-1">
                    <p className="text-base text-slate-400 mb-0.5">Geselecteerde datum</p>
                    <p className="text-xl font-bold text-white">{format(date, 'EEEE d MMMM yyyy', { locale: nl })}</p>
                </div>
            </div>

            {/* Time input */}
            <div className="space-y-3">
                <Label htmlFor="time-input" className="text-base text-slate-300 font-medium">Tijdstip</Label>
                <Input
                    id="time-input"
                    type="time"
                    value={time}
                    onChange={(e) => onTimeChange(e.target.value)}
                    className="h-14 text-xl font-semibold max-w-[200px] bg-white/[0.02] border-white/10"
                />
            </div>
        </div>
    );
}

// ============================================
// Step 2 — Percelen
// ============================================

function StepParcels({
    parcels,
    selectedIds,
    onChange,
    groups,
    favoriteGroups,
    totalArea,
    selectedCount,
}: {
    parcels: SprayableParcel[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    groups: ParcelGroupOption[];
    favoriteGroups: ParcelGroup[];
    totalArea: number;
    selectedCount: number;
}) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1">Op welke percelen?</h3>
                <p className="text-base text-slate-400">Kies één of meerdere percelen waar je hebt gespoten.</p>
            </div>

            <div className="space-y-3">
                <Label className="text-base text-slate-300 font-medium">Percelen</Label>
                <div className="[&_button]:!min-h-[56px] [&_button]:!text-base">
                    <UnifiedParcelMultiSelect
                        groups={groups}
                        selectedSubParcelIds={selectedIds}
                        onChange={onChange}
                        favoriteGroups={favoriteGroups}
                        placeholder="Tik hier om percelen te kiezen..."
                        showScopeSummary
                    />
                </div>
            </div>

            {/* Live feedback */}
            {selectedCount > 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Check className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xl font-bold text-white">
                            {selectedCount} {selectedCount === 1 ? 'perceel' : 'percelen'} geselecteerd
                        </p>
                        <p className="text-base text-emerald-400">Totaal {totalArea.toFixed(2)} hectare</p>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0">
                        <MapPin className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="text-base text-slate-400">Nog geen percelen geselecteerd.</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// Step 3 — Middelen
// ============================================

function StepProducts({
    products,
    totalArea,
    onAdd,
    onRemove,
    onUpdate,
}: {
    products: ProductRow[];
    totalArea: number;
    onAdd: () => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, patch: Partial<ProductRow>) => void;
}) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1">Welk middel en hoeveel?</h3>
                <p className="text-base text-slate-400">Voeg één of meerdere middelen toe. Kies tussen dosering per hectare of de totale hoeveelheid — we rekenen het voor je om.</p>
            </div>

            <div className="space-y-4">
                {products.map((product, idx) => (
                    <ProductRowEditor
                        key={product.id}
                        product={product}
                        index={idx}
                        totalArea={totalArea}
                        canRemove={products.length > 1}
                        onRemove={() => onRemove(product.id)}
                        onUpdate={(patch) => onUpdate(product.id, patch)}
                    />
                ))}
            </div>

            <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onAdd}
                className="w-full h-14 text-base border-dashed border-white/20 hover:bg-white/[0.02] hover:border-emerald-500/30"
            >
                <Plus className="h-5 w-5 mr-2" />
                Nog een middel toevoegen
            </Button>
        </div>
    );
}

function ProductRowEditor({
    product,
    index,
    totalArea,
    canRemove,
    onRemove,
    onUpdate,
}: {
    product: ProductRow;
    index: number;
    totalArea: number;
    canRemove: boolean;
    onRemove: () => void;
    onUpdate: (patch: Partial<ProductRow>) => void;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Middel {index + 1}</span>
                {canRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                        className="h-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Verwijder
                    </Button>
                )}
            </div>

            <div className="space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Productnaam</Label>
                <div className="[&>button]:h-12 [&>button]:text-base">
                    <ProductSelector
                        value={product.product}
                        onChange={(name, ctgb) => onUpdate({ product: name, ctgbProduct: ctgb })}
                        onClear={() => onUpdate({ product: '' })}
                        placeholder="Tik en zoek het middel..."
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-sm text-slate-300 font-medium">Dosering</Label>
                <DosageTotalField
                    dosage={product.dosage}
                    unit={product.unit}
                    totalArea={totalArea}
                    onDosageChange={(dosage) => onUpdate({ dosage })}
                    onUnitChange={(unit) => onUpdate({ unit })}
                    tint="emerald"
                />
            </div>

            {/* Dosage presets — only meaningful in per-ha thinking, but still useful */}
            <div className="space-y-2">
                <Label className="text-sm text-slate-400 font-medium">Snelle doseringen (per ha)</Label>
                <div className="flex flex-wrap gap-2">
                    {DOSAGE_PRESETS.map(v => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onUpdate({ dosage: v })}
                            className={cn(
                                'h-11 px-4 rounded-lg border text-base font-semibold tabular-nums transition-all',
                                product.dosage === v
                                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                                    : 'bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.04] hover:border-white/20',
                            )}
                        >
                            {String(v).replace('.', ',')}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================
// Step 4 — Bevestigen
// ============================================

function StepConfirm({
    date,
    time,
    selectedParcels,
    totalArea,
    products,
    notes,
    onNotesChange,
    validation,
}: {
    date: Date;
    time: string;
    selectedParcels: SprayableParcel[];
    totalArea: number;
    products: ProductRow[];
    notes: string;
    onNotesChange: (v: string) => void;
    validation: { flags: ValidationFlag[]; errorCount: number; warningCount: number } | null;
}) {
    const [hh, mm] = time.split(':').map(Number);
    const fullDate = new Date(date);
    fullDate.setHours(hh, mm, 0, 0);

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1">Controleer en bevestig</h3>
                <p className="text-base text-slate-400">Bekijk de gegevens en sla op als het klopt.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden">
                {/* Date */}
                <div className="flex items-center gap-4 p-5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <CalendarDays className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Wanneer</p>
                        <p className="text-base font-semibold text-white">{format(fullDate, 'EEEE d MMMM yyyy \'om\' HH:mm', { locale: nl })}</p>
                    </div>
                </div>

                {/* Parcels */}
                <div className="flex items-start gap-4 p-5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <MapPin className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400">
                            {selectedParcels.length} {selectedParcels.length === 1 ? 'perceel' : 'percelen'} · {totalArea.toFixed(2)} ha totaal
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {selectedParcels.map(p => (
                                <Badge key={p.id} variant="outline" className="text-sm px-2.5 py-1 bg-white/[0.03] border-white/10 text-white font-medium">
                                    {p.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Products */}
                <div className="flex items-start gap-4 p-5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <FlaskConical className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400">{products.length} {products.length === 1 ? 'middel' : 'middelen'}</p>
                        <div className="space-y-1.5 mt-1.5">
                            {products.map(p => {
                                const totalUsed = formatTotalUsage(p.dosage, totalArea, p.unit);
                                return (
                                    <div key={p.id} className="flex items-center justify-between gap-4 text-base">
                                        <span className="text-white font-medium truncate">{p.product}</span>
                                        <span className="font-semibold tabular-nums shrink-0 text-right">
                                            <span className="text-emerald-400">{String(p.dosage).replace('.', ',')} {perHaUnit(p.unit)}</span>
                                            {totalUsed && (
                                                <span className="block text-xs text-slate-500 font-normal mt-0.5">= {totalUsed} totaal</span>
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
                <Label htmlFor="notes" className="text-base text-slate-300 font-medium">Notities (optioneel)</Label>
                <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => onNotesChange(e.target.value)}
                    placeholder="Bijv. weersomstandigheden, ziekte-observaties..."
                    rows={3}
                    className="text-base bg-white/[0.02] border-white/10"
                />
            </div>

            {/* Validation feedback if save failed */}
            {validation && validation.flags.length > 0 && (
                <div className={cn(
                    'rounded-2xl border p-5 space-y-3',
                    validation.errorCount > 0
                        ? 'bg-destructive/10 border-destructive/40'
                        : 'bg-amber-500/10 border-amber-500/40',
                )}>
                    <div className="flex items-start gap-3">
                        <AlertTriangle className={cn(
                            'h-5 w-5 mt-0.5 shrink-0',
                            validation.errorCount > 0 ? 'text-destructive' : 'text-amber-400',
                        )} />
                        <div>
                            <p className="font-semibold text-white">
                                {validation.errorCount > 0 ? 'Fouten gevonden' : 'Let op'}
                            </p>
                            <p className="text-sm text-slate-300">
                                {validation.errorCount > 0
                                    ? 'Los eerst de fouten op voordat je opslaat.'
                                    : 'Er zijn waarschuwingen — je kunt toch opslaan, maar controleer even.'}
                            </p>
                        </div>
                    </div>
                    <ValidationFeedback flags={validation.flags} />
                </div>
            )}
        </div>
    );
}
