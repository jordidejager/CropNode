'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type {
    BatchEvent,
    BatchEventInput,
    BatchEventType,
    SorteringSizeRow,
} from '@/lib/types';
import type { StorageCell } from '@/lib/types';
import { EVENT_TYPE_LABELS } from './constants';
import {
    KgInput,
    computeTotalKg,
    kgInputValueFrom,
    emptyKgInputValue,
    type KgInputValue,
} from './kg-input';

interface EventFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    batchId: string;
    eventType: BatchEventType;
    event?: BatchEvent | null;
    storageCells?: StorageCell[];
    onSubmit: (data: BatchEventInput) => Promise<void> | void;
    isSubmitting?: boolean;
}

function toDateInputValue(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function parseNum(v: string): number | null {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
}

// Reusable size rows editor for sortering events
function SizeRowsEditor({
    rows,
    onChange,
    showPrice,
}: {
    rows: SorteringSizeRow[];
    onChange: (rows: SorteringSizeRow[]) => void;
    showPrice?: boolean;
}) {
    const updateRow = (index: number, patch: Partial<SorteringSizeRow>) => {
        const next = [...rows];
        next[index] = { ...next[index], ...patch };
        onChange(next);
    };
    const addRow = () =>
        onChange([...rows, { size: '', class: 'Klasse I', kg: undefined }]);
    const removeRow = (index: number) =>
        onChange(rows.filter((_, i) => i !== index));

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Maat/klasse-verdeling</Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    className="h-7 text-xs"
                >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Rij
                </Button>
            </div>
            {rows.length === 0 && (
                <p className="text-[11px] text-slate-500 italic">
                    Optioneel — laat leeg om alleen totaal-kg te registreren.
                </p>
            )}
            {rows.map((row, i) => (
                <div
                    key={i}
                    className="grid gap-2"
                    style={{
                        gridTemplateColumns: showPrice ? '1fr 1fr 90px 90px auto' : '1fr 1fr 110px auto',
                    }}
                >
                    <Input
                        value={row.size ?? ''}
                        onChange={(e) => updateRow(i, { size: e.target.value })}
                        placeholder="70-80"
                    />
                    <Select
                        value={row.class ?? 'Klasse I'}
                        onValueChange={(v) => updateRow(i, { class: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Klasse I">Klasse I</SelectItem>
                            <SelectItem value="Klasse II">Klasse II</SelectItem>
                            <SelectItem value="Industrie">Industrie</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        step="0.01"
                        value={row.kg ?? ''}
                        onChange={(e) => updateRow(i, { kg: parseNum(e.target.value) ?? undefined })}
                        placeholder="kg"
                    />
                    {showPrice && (
                        <Input
                            type="number"
                            step="0.01"
                            value={row.price_per_kg ?? ''}
                            onChange={(e) =>
                                updateRow(i, { price_per_kg: parseNum(e.target.value) ?? undefined })
                            }
                            placeholder="€/kg"
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(i)}
                        className="h-9 w-9 text-slate-400 hover:text-red-400"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}
        </div>
    );
}

export function EventFormDialog({
    open,
    onOpenChange,
    batchId,
    eventType,
    event,
    storageCells = [],
    onSubmit,
    isSubmitting,
}: EventFormDialogProps) {
    const [eventDate, setEventDate] = React.useState('');
    const [kgValue, setKgValue] = React.useState<KgInputValue>(emptyKgInputValue());
    const [costEur, setCostEur] = React.useState('');
    const [revenueEur, setRevenueEur] = React.useState('');
    const [storageCellId, setStorageCellId] = React.useState<string>('');
    const [notes, setNotes] = React.useState('');
    // Type-specific details (kept as one state blob per form)
    const [details, setDetails] = React.useState<Record<string, any>>({});
    const [sizeRows, setSizeRows] = React.useState<SorteringSizeRow[]>([]);

    React.useEffect(() => {
        if (!open) return;
        setEventDate(toDateInputValue(event?.eventDate));

        const d = (event?.details as Record<string, any>) ?? {};
        setDetails(d);
        setSizeRows(Array.isArray(d.sizes) ? d.sizes : []);

        // Init KgInput: use crates/kg_per_crate from details if present.
        setKgValue(
            kgInputValueFrom({
                kg: event?.kg ?? null,
                crates: typeof d.crates === 'number' ? d.crates : null,
                kgPerCrate: typeof d.kg_per_crate === 'number' ? d.kg_per_crate : null,
            })
        );

        setCostEur(
            event?.costEur !== null && event?.costEur !== undefined ? String(event.costEur) : ''
        );
        setRevenueEur(
            event?.revenueEur !== null && event?.revenueEur !== undefined
                ? String(event.revenueEur)
                : ''
        );
        setStorageCellId(event?.storageCellId ?? '');
        setNotes(event?.notes ?? '');
    }, [open, event]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Merge sizeRows back into details if event type uses them
        let finalDetails: Record<string, any> = { ...details };
        if (eventType === 'sortering_extern' || eventType === 'sortering_eigen') {
            finalDetails.sizes = sizeRows.filter((r) => r.kg !== undefined || r.size);
        }

        // Preserve crates/kg_per_crate metadata in jsonb so we know HOW the kg was entered.
        if (kgValue.mode === 'crates') {
            const c = parseFloat(kgValue.crates.replace(',', '.'));
            const kpc = parseFloat(kgValue.kgPerCrate.replace(',', '.'));
            finalDetails.crates = Number.isFinite(c) ? c : null;
            finalDetails.kg_per_crate = Number.isFinite(kpc) ? kpc : null;
        } else {
            // Direct mode: remove stale crate metadata to keep data clean.
            delete finalDetails.crates;
            delete finalDetails.kg_per_crate;
        }

        const payload: BatchEventInput = {
            batchId,
            eventType,
            eventDate: eventDate ? new Date(eventDate) : null,
            kg: computeTotalKg(kgValue),
            costEur: parseNum(costEur),
            revenueEur: parseNum(revenueEur),
            storageCellId: storageCellId || null,
            details: finalDetails,
            notes: notes.trim() || null,
        };
        await onSubmit(payload);
    };

    const renderTypeSpecificFields = () => {
        switch (eventType) {
            case 'transport':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="carrier">Vervoerder</Label>
                                <Input
                                    id="carrier"
                                    value={details.carrier ?? ''}
                                    onChange={(e) =>
                                        setDetails({ ...details, carrier: e.target.value })
                                    }
                                    placeholder="bv. Van Dijk Transport"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice">Factuurnr.</Label>
                                <Input
                                    id="invoice"
                                    value={details.invoice_number ?? ''}
                                    onChange={(e) =>
                                        setDetails({ ...details, invoice_number: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="from">Van</Label>
                                <Input
                                    id="from"
                                    value={details.from ?? ''}
                                    onChange={(e) => setDetails({ ...details, from: e.target.value })}
                                    placeholder="Bedrijf"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="to">Naar</Label>
                                <Input
                                    id="to"
                                    value={details.to ?? ''}
                                    onChange={(e) => setDetails({ ...details, to: e.target.value })}
                                    placeholder="Sorteerder/afnemer"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="distance">Km</Label>
                                <Input
                                    id="distance"
                                    type="number"
                                    value={details.distance_km ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            distance_km: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </>
                );

            case 'sortering_extern':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="sorter">Sorteerder</Label>
                                <Input
                                    id="sorter"
                                    value={details.sorter_name ?? ''}
                                    onChange={(e) =>
                                        setDetails({ ...details, sorter_name: e.target.value })
                                    }
                                    placeholder="Bedrijfsnaam"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="invoice">Factuurnr.</Label>
                                <Input
                                    id="invoice"
                                    value={details.invoice_number ?? ''}
                                    onChange={(e) =>
                                        setDetails({ ...details, invoice_number: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sort-cost">Sorteerkosten (€)</Label>
                            <Input
                                id="sort-cost"
                                type="number"
                                step="0.01"
                                value={details.sorteerkosten_eur ?? ''}
                                onChange={(e) =>
                                    setDetails({
                                        ...details,
                                        sorteerkosten_eur: parseNum(e.target.value),
                                    })
                                }
                                placeholder="Optioneel — kan ook via 'Totale kosten'"
                            />
                            <p className="text-[11px] text-slate-500">
                                Transportkosten meestal inbegrepen bij externe sorteerder.
                            </p>
                        </div>
                        <SizeRowsEditor rows={sizeRows} onChange={setSizeRows} showPrice />
                    </>
                );

            case 'sortering_eigen':
                return (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="klant">Klant-order (optioneel)</Label>
                            <Input
                                id="klant"
                                value={details.klant_order ?? ''}
                                onChange={(e) =>
                                    setDetails({ ...details, klant_order: e.target.value })
                                }
                                placeholder="Referentie klant-order"
                            />
                        </div>
                        <SizeRowsEditor rows={sizeRows} onChange={setSizeRows} />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="industrie">Industriefruit (kg)</Label>
                                <Input
                                    id="industrie"
                                    type="number"
                                    step="0.01"
                                    value={details.industrie_kg ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            industrie_kg: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rot">Schatting rot (%)</Label>
                                <Input
                                    id="rot"
                                    type="number"
                                    step="0.1"
                                    value={details.rot_percentage ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            rot_percentage: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </>
                );

            case 'afzet':
                return (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="buyer">Afnemer</Label>
                            <Input
                                id="buyer"
                                value={details.buyer ?? ''}
                                onChange={(e) => setDetails({ ...details, buyer: e.target.value })}
                                placeholder="Naam afnemer"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="price">Prijs/kg (€)</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    value={details.price_per_kg ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            price_per_kg: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bonus">Bonus (€)</Label>
                                <Input
                                    id="bonus"
                                    type="number"
                                    step="0.01"
                                    value={details.bonus_eur ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            bonus_eur: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deduction">Aftrek (€)</Label>
                                <Input
                                    id="deduction"
                                    type="number"
                                    step="0.01"
                                    value={details.deduction_eur ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            deduction_eur: parseNum(e.target.value),
                                        })
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="payment-date">Uitbetaaldatum</Label>
                                <Input
                                    id="payment-date"
                                    type="date"
                                    value={details.payment_date ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            payment_date: e.target.value || undefined,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contract">Contract-ref.</Label>
                                <Input
                                    id="contract"
                                    value={details.contract_reference ?? ''}
                                    onChange={(e) =>
                                        setDetails({
                                            ...details,
                                            contract_reference: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </>
                );

            case 'inslag':
            case 'verplaatsing':
                return (
                    <div className="space-y-2">
                        <Label htmlFor="cell">Naar koelcel</Label>
                        <Select value={storageCellId} onValueChange={setStorageCellId}>
                            <SelectTrigger id="cell">
                                <SelectValue placeholder="Kies een cel…" />
                            </SelectTrigger>
                            <SelectContent>
                                {storageCells.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                );

            case 'uitslag':
                return (
                    <p className="text-[12px] text-slate-400 italic">
                        Uitslag haalt de partij uit de koelcel. Geen cel-selectie nodig.
                    </p>
                );

            case 'kwaliteitsmeting':
                return (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="brix">Brix</Label>
                            <Input
                                id="brix"
                                type="number"
                                step="0.1"
                                value={details.brix ?? ''}
                                onChange={(e) =>
                                    setDetails({ ...details, brix: parseNum(e.target.value) })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="firmness">Hardheid (kg)</Label>
                            <Input
                                id="firmness"
                                type="number"
                                step="0.1"
                                value={details.firmness ?? ''}
                                onChange={(e) =>
                                    setDetails({ ...details, firmness: parseNum(e.target.value) })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="starch">Zetmeel-index</Label>
                            <Input
                                id="starch"
                                type="number"
                                step="0.1"
                                value={details.starch_index ?? ''}
                                onChange={(e) =>
                                    setDetails({
                                        ...details,
                                        starch_index: parseNum(e.target.value),
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="scald">Storage scald (%)</Label>
                            <Input
                                id="scald"
                                type="number"
                                step="0.1"
                                value={details.storage_scald ?? ''}
                                onChange={(e) =>
                                    setDetails({
                                        ...details,
                                        storage_scald: parseNum(e.target.value),
                                    })
                                }
                            />
                        </div>
                    </div>
                );

            case 'correctie':
                return (
                    <p className="text-[12px] text-slate-400 italic">
                        Correctie-event: gebruik kg / kosten / opbrengst om afwijkingen bij te stellen.
                    </p>
                );

            default:
                return null;
        }
    };

    const showKg = !['correctie', 'kwaliteitsmeting'].includes(eventType);
    const showCost = ['transport', 'sortering_extern', 'sortering_eigen', 'correctie'].includes(
        eventType
    );
    const showRevenue = ['afzet', 'correctie'].includes(eventType);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {event ? 'Event bewerken' : `${EVENT_TYPE_LABELS[eventType]} toevoegen`}
                    </DialogTitle>
                    <DialogDescription>
                        Alle velden zijn optioneel — vul in wat je hebt. Details kunnen later aangevuld worden.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Common fields */}
                    <div className="space-y-2">
                        <Label htmlFor="event-date">Datum</Label>
                        <Input
                            id="event-date"
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            className="max-w-[220px]"
                        />
                    </div>

                    {showKg && (
                        <KgInput
                            id="kg"
                            label="Gewicht"
                            value={kgValue}
                            onChange={setKgValue}
                            hint="Optioneel — kies zelf hoe je het gewicht invult."
                        />
                    )}

                    {(showCost || showRevenue) && (
                        <div className="grid grid-cols-2 gap-3">
                            {showCost && (
                                <div className="space-y-2">
                                    <Label htmlFor="cost">Totale kosten (€)</Label>
                                    <Input
                                        id="cost"
                                        type="number"
                                        step="0.01"
                                        value={costEur}
                                        onChange={(e) => setCostEur(e.target.value)}
                                    />
                                </div>
                            )}
                            {showRevenue && (
                                <div className="space-y-2">
                                    <Label htmlFor="revenue">Totale opbrengst (€)</Label>
                                    <Input
                                        id="revenue"
                                        type="number"
                                        step="0.01"
                                        value={revenueEur}
                                        onChange={(e) => setRevenueEur(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {renderTypeSpecificFields()}

                    <div className="space-y-2">
                        <Label htmlFor="event-notes">Notities</Label>
                        <Textarea
                            id="event-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Annuleren
                        </Button>
                        <Button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Opslaan…' : event ? 'Bijwerken' : 'Toevoegen'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
