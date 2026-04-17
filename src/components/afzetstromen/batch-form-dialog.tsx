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
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    useKnownVarieties,
    useKnownHarvestYears,
    useHarvestSeasons,
    useBatchSeasons,
} from '@/hooks/use-data';
import type { Batch, BatchInput, BatchStatus, PickNumber } from '@/lib/types';
import { STATUS_LABELS, normalizeVariety } from './constants';

interface BatchFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    batch?: Batch | null;
    onSubmit: (data: BatchInput) => Promise<void> | void;
    isSubmitting?: boolean;
}

// Sentinel voor "ander ras / ander seizoen" (Select staat geen lege string toe).
const CUSTOM_VALUE = '__custom__';
const NO_PICK = '__none__';

const PICK_OPTIONS: { value: PickNumber; label: string }[] = [
    { value: 1, label: '1e pluk' },
    { value: 2, label: '2e pluk' },
    { value: 3, label: '3e pluk' },
    { value: 4, label: '4e pluk' },
];

/**
 * Genereer standaard seizoen-string uit oogstjaar.
 * Conventie: seizoen loopt van oogstjaar tot oogstjaar+1 (bv. oogst 2025 → seizoen "2025-2026").
 */
function seasonFromYear(year: number): string {
    return `${year}-${year + 1}`;
}

/**
 * Lijst van 7 jaartallen rond huidig jaar, plus eventuele extra jaren uit bestaande data.
 */
function buildYearOptions(knownYears: number[]): number[] {
    const now = new Date().getFullYear();
    const base = [now - 4, now - 3, now - 2, now - 1, now, now + 1, now + 2];
    return [...new Set([...base, ...knownYears])].sort((a, b) => b - a);
}

export function BatchFormDialog({
    open,
    onOpenChange,
    batch,
    onSubmit,
    isSubmitting,
}: BatchFormDialogProps) {
    const [label, setLabel] = React.useState('');
    const [variety, setVariety] = React.useState('');
    const [varietyMode, setVarietyMode] = React.useState<'select' | 'custom'>('select');
    const [season, setSeason] = React.useState('');
    const [seasonMode, setSeasonMode] = React.useState<'select' | 'custom'>('select');
    const [harvestYear, setHarvestYear] = React.useState<string>('');
    const [pickNumber, setPickNumber] = React.useState<string>(NO_PICK);
    const [totalCrates, setTotalCrates] = React.useState<string>('');
    const [status, setStatus] = React.useState<BatchStatus>('active');
    const [reservedFor, setReservedFor] = React.useState('');
    const [notes, setNotes] = React.useState('');

    const { data: knownVarieties = [] } = useKnownVarieties();
    const { data: knownYears = [] } = useKnownHarvestYears();
    const { data: batchSeasons = [] } = useBatchSeasons();
    const { data: harvestSeasons = [] } = useHarvestSeasons();

    const knownSeasons = React.useMemo(() => {
        return [...new Set([...batchSeasons, ...harvestSeasons])].sort().reverse();
    }, [batchSeasons, harvestSeasons]);

    const yearOptions = React.useMemo(() => buildYearOptions(knownYears), [knownYears]);

    React.useEffect(() => {
        if (!open) return;

        const v = batch?.variety ?? '';
        setLabel(batch?.label ?? '');
        setVariety(v);
        setVarietyMode(
            v && knownVarieties.length > 0 && !knownVarieties.includes(v) ? 'custom' : 'select'
        );

        const s = batch?.season ?? '';
        setSeason(s);
        setSeasonMode(s && knownSeasons.length > 0 && !knownSeasons.includes(s) ? 'custom' : 'select');

        setHarvestYear(batch?.harvestYear?.toString() ?? '');
        setPickNumber(batch?.pickNumber ? String(batch.pickNumber) : NO_PICK);
        // Prefer user-edited batches.total_crates; fall back to harvest total.
        const resolvedCrates = batch?.batchTotalCrates ?? batch?.totalCrates ?? null;
        setTotalCrates(resolvedCrates != null ? String(resolvedCrates) : '');
        setStatus(batch?.status ?? 'active');
        setReservedFor(batch?.reservedFor ?? '');
        setNotes(batch?.notes ?? '');
        // Intentionally: re-init only on open toggle / batch change; ignore knownVarieties changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, batch]);

    // Auto-suggest seizoen wanneer gebruiker oogstjaar kiest en nog geen seizoen ingevuld is.
    const handleYearChange = (newYear: string) => {
        setHarvestYear(newYear);
        const parsed = parseInt(newYear, 10);
        if (Number.isFinite(parsed) && !season) {
            const suggested = seasonFromYear(parsed);
            setSeason(suggested);
            setSeasonMode(knownSeasons.includes(suggested) ? 'select' : 'custom');
        }
    };

    const trimmedVariety = variety.trim();
    const trimmedSeason = season.trim();
    const parsedYear = harvestYear ? parseInt(harvestYear, 10) : NaN;
    const isYearValid = Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100;
    const canSubmit = trimmedVariety.length > 0 && trimmedSeason.length > 0 && isYearValid;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        const pickValue: PickNumber | null =
            pickNumber === NO_PICK ? null : (parseInt(pickNumber, 10) as PickNumber);
        const parsedCrates = totalCrates.trim() ? parseInt(totalCrates, 10) : NaN;
        const cratesValue: number | null =
            Number.isFinite(parsedCrates) && parsedCrates >= 0 ? parsedCrates : null;
        const payload: BatchInput = {
            label: label.trim() || null,
            variety: normalizeVariety(trimmedVariety),
            season: trimmedSeason,
            harvestYear: parsedYear,
            pickNumber: pickValue,
            totalCrates: cratesValue,
            status,
            reservedFor: status === 'gereserveerd_voor_afnemer' ? reservedFor.trim() || null : null,
            notes: notes.trim() || null,
        };
        await onSubmit(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{batch ? 'Partij bewerken' : 'Nieuwe partij'}</DialogTitle>
                    <DialogDescription>
                        {batch
                            ? 'Pas de details van deze partij aan. Koppel later events (transport, sortering, afzet) aan deze partij.'
                            : 'Maak een losstaande partij aan zonder oogstregistratie. Gebruikelijk voor gemengde partijen of oudere voorraad.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="label">
                            Label <span className="text-slate-500 font-normal">(optioneel)</span>
                        </Label>
                        <Input
                            id="label"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="bv. Elstar — P2 — Perceel 3B — 2025"
                        />
                        <p className="text-[11px] text-slate-500">
                            Leeg laten = automatisch gegenereerd label op basis van ras + perceel.
                        </p>
                    </div>

                    {/* Ras + Oogstjaar */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="variety">
                                Ras <span className="text-red-400">*</span>
                            </Label>
                            {varietyMode === 'select' ? (
                                <Select
                                    value={variety || ''}
                                    onValueChange={(v) => {
                                        if (v === CUSTOM_VALUE) {
                                            setVariety('');
                                            setVarietyMode('custom');
                                        } else {
                                            setVariety(v);
                                        }
                                    }}
                                >
                                    <SelectTrigger id="variety" aria-invalid={trimmedVariety.length === 0}>
                                        <SelectValue placeholder="Kies een ras…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {knownVarieties.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>Bestaande rassen</SelectLabel>
                                                {knownVarieties.map((v) => (
                                                    <SelectItem key={v} value={v}>
                                                        {v}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                        {knownVarieties.length > 0 && <SelectSeparator />}
                                        <SelectItem value={CUSTOM_VALUE}>+ Ander ras…</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="flex gap-1.5">
                                    <Input
                                        id="variety"
                                        value={variety}
                                        onChange={(e) => setVariety(e.target.value)}
                                        placeholder="bv. Conference"
                                        autoFocus
                                        required
                                        aria-invalid={trimmedVariety.length === 0}
                                    />
                                    {knownVarieties.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setVariety('');
                                                setVarietyMode('select');
                                            }}
                                            className="text-[11px] text-slate-400"
                                        >
                                            Lijst
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="harvestYear">
                                Oogstjaar <span className="text-red-400">*</span>
                            </Label>
                            <Select value={harvestYear} onValueChange={handleYearChange}>
                                <SelectTrigger id="harvestYear" aria-invalid={!isYearValid}>
                                    <SelectValue placeholder="Kies jaar…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {yearOptions.map((y) => (
                                        <SelectItem key={y} value={String(y)}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Seizoen + Pluk */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="season">
                                Seizoen <span className="text-red-400">*</span>
                            </Label>
                            {seasonMode === 'select' ? (
                                <Select
                                    value={season || ''}
                                    onValueChange={(v) => {
                                        if (v === CUSTOM_VALUE) {
                                            setSeason('');
                                            setSeasonMode('custom');
                                        } else {
                                            setSeason(v);
                                        }
                                    }}
                                >
                                    <SelectTrigger id="season" aria-invalid={trimmedSeason.length === 0}>
                                        <SelectValue placeholder="Kies seizoen…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* Auto-suggestion op basis van oogstjaar */}
                                        {isYearValid && !knownSeasons.includes(seasonFromYear(parsedYear)) && (
                                            <>
                                                <SelectGroup>
                                                    <SelectLabel>Voorgesteld</SelectLabel>
                                                    <SelectItem value={seasonFromYear(parsedYear)}>
                                                        {seasonFromYear(parsedYear)}
                                                    </SelectItem>
                                                </SelectGroup>
                                                <SelectSeparator />
                                            </>
                                        )}
                                        {knownSeasons.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>Bestaande seizoenen</SelectLabel>
                                                {knownSeasons.map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                        <SelectSeparator />
                                        <SelectItem value={CUSTOM_VALUE}>+ Ander seizoen…</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="flex gap-1.5">
                                    <Input
                                        id="season"
                                        value={season}
                                        onChange={(e) => setSeason(e.target.value)}
                                        placeholder="2025-2026"
                                        autoFocus
                                        required
                                        aria-invalid={trimmedSeason.length === 0}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSeason('');
                                            setSeasonMode('select');
                                        }}
                                        className="text-[11px] text-slate-400"
                                    >
                                        Lijst
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pickNumber">
                                Pluk <span className="text-slate-500 font-normal">(optioneel)</span>
                            </Label>
                            <Select value={pickNumber} onValueChange={setPickNumber}>
                                <SelectTrigger id="pickNumber">
                                    <SelectValue placeholder="Geen pluk" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_PICK}>Geen / onbekend</SelectItem>
                                    {PICK_OPTIONS.map((p) => (
                                        <SelectItem key={p.value} value={String(p.value)}>
                                            {p.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="totalCrates">
                            Aantal kisten{' '}
                            <span className="text-slate-500 font-normal">(optioneel)</span>
                        </Label>
                        <Input
                            id="totalCrates"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={totalCrates}
                            onChange={(e) => setTotalCrates(e.target.value)}
                            placeholder="bv. 120"
                        />
                        <p className="text-[11px] text-slate-500">
                            Totaal aantal voorraadkisten in deze partij. Gebruikt om kisten per perceel te
                            verdelen en kg/kist af te leiden.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as BatchStatus)}>
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(STATUS_LABELS) as BatchStatus[]).map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {STATUS_LABELS[s]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {status === 'gereserveerd_voor_afnemer' && (
                        <div className="space-y-2">
                            <Label htmlFor="reservedFor">Afnemer</Label>
                            <Input
                                id="reservedFor"
                                value={reservedFor}
                                onChange={(e) => setReservedFor(e.target.value)}
                                placeholder="Naam afnemer"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="notes">
                            Notities <span className="text-slate-500 font-normal">(optioneel)</span>
                        </Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Optionele aantekeningen…"
                        />
                    </div>

                    {!canSubmit && (
                        <p className="text-[11px] text-red-400">
                            Vul ras, oogstjaar en seizoen in om de partij op te slaan.
                        </p>
                    )}

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
                            disabled={isSubmitting || !canSubmit}
                        >
                            {isSubmitting ? 'Opslaan…' : batch ? 'Bijwerken' : 'Aanmaken'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
