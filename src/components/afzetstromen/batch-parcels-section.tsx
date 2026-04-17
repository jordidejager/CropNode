'use client';

import * as React from 'react';
import { MapPin, Plus, Trash2, Loader2, Check, Search, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
    useBatch,
    useBatchParcels,
    useAddBatchParcels,
    useDeleteBatchParcel,
    useParcels,
} from '@/hooks/use-data';
import type { BatchParcelLink, BatchParcelLinkInput } from '@/lib/types';
import { cn } from '@/lib/utils';

interface BatchParcelsSectionProps {
    batchId: string;
}

// Resolved totaal kisten voor een partij: user-gekozen heeft voorrang op bootstrap-waarde
function resolveBatchCrates(batch: { batchTotalCrates?: number | null; totalCrates?: number | null } | undefined): number | null {
    if (!batch) return null;
    return batch.batchTotalCrates ?? batch.totalCrates ?? null;
}

// Afgeleide kg-per-kist op partij-niveau (batch totalKgIn / totaal kisten). Null als onbepaald.
function deriveKgPerCrate(batch: { totalKgIn?: number | null } | undefined, totalCrates: number | null): number | null {
    if (!totalCrates || totalCrates <= 0) return null;
    const kg = batch?.totalKgIn ?? null;
    if (kg == null || kg <= 0) return null;
    return kg / totalCrates;
}

function sumAssignedCrates(links: BatchParcelLink[]): number {
    return links.reduce((sum, l) => sum + (l.crates ?? 0), 0);
}

export function BatchParcelsSection({ batchId }: BatchParcelsSectionProps) {
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = React.useState(false);

    const { data: batch } = useBatch(batchId);
    const { data: links = [], isLoading } = useBatchParcels(batchId);
    const deleteLink = useDeleteBatchParcel();

    const totalCrates = resolveBatchCrates(batch ?? undefined);
    const assignedCrates = sumAssignedCrates(links);
    const remainingCrates = totalCrates != null ? Math.max(totalCrates - assignedCrates, 0) : null;
    const overAssigned = totalCrates != null && assignedCrates > totalCrates;
    const kgPerCrate = deriveKgPerCrate(batch ?? undefined, totalCrates);

    const handleRemove = async (id: string, displayName: string) => {
        try {
            await deleteLink.mutateAsync({ id, batchId });
            toast({ title: `${displayName} ontkoppeld` });
        } catch (err) {
            toast({
                title: 'Fout',
                description: err instanceof Error ? err.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-white">Percelen</h2>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                        Verdeel de kisten van deze partij over de percelen.
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDialogOpen(true)}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Perceel toevoegen
                </Button>
            </div>

            {/* Kisten-teller */}
            {totalCrates != null && (
                <div
                    className={cn(
                        'mb-4 flex items-center gap-3 rounded-xl border px-3 py-2.5',
                        overAssigned
                            ? 'border-red-500/40 bg-red-500/[0.06]'
                            : remainingCrates === 0
                              ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                              : 'border-white/[0.06] bg-white/[0.02]',
                    )}
                >
                    <Package
                        className={cn(
                            'h-4 w-4 shrink-0',
                            overAssigned ? 'text-red-400' : 'text-slate-500',
                        )}
                    />
                    <div className="flex-1 min-w-0 text-[12px]">
                        <span className={cn('font-semibold', overAssigned ? 'text-red-300' : 'text-white')}>
                            {assignedCrates} van {totalCrates} kisten toegewezen
                        </span>
                        <span className="text-slate-500">
                            {' · '}
                            {overAssigned
                                ? `${assignedCrates - totalCrates} kisten te veel`
                                : remainingCrates === 0
                                  ? 'alles verdeeld'
                                  : `${remainingCrates} nog te verdelen`}
                        </span>
                        {kgPerCrate != null && (
                            <span className="text-slate-500">
                                {' · afgeleide '}
                                <span className="text-slate-300">
                                    {kgPerCrate.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg/kist
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="py-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
            ) : links.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <MapPin className="h-6 w-6 text-slate-500 mx-auto mb-2" />
                    <p className="text-[13px] text-slate-400">
                        Nog geen percelen gekoppeld. Voeg percelen toe om bij te houden waar de partij vandaan komt.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {links.map((link) => {
                        const name = link.subParcelName || link.parcelName || '(onbekend perceel)';
                        const meta: string[] = [];
                        if (link.subParcelVariety) meta.push(link.subParcelVariety);
                        if (link.subParcelArea) meta.push(`${link.subParcelArea.toFixed(2)} ha`);

                        // Toon kisten + afgeleide kg (als we kgPerCrate op batch-niveau kunnen afleiden)
                        if (link.crates != null) {
                            const derivedKg = kgPerCrate != null ? link.crates * kgPerCrate : null;
                            meta.push(
                                derivedKg != null
                                    ? `${link.crates} kisten · ~${derivedKg.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kg`
                                    : `${link.crates} kisten`,
                            );
                        } else if (link.estimatedKg != null) {
                            meta.push(`~${link.estimatedKg.toLocaleString('nl-NL')} kg`);
                        }
                        return (
                            <div
                                key={link.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 hover:border-white/[0.12] transition-colors"
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-white truncate">
                                            {name}
                                        </div>
                                        {meta.length > 0 && (
                                            <div className="text-[11px] text-slate-500 truncate">
                                                {meta.join(' · ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-slate-400 hover:text-red-400 shrink-0"
                                    onClick={() => handleRemove(link.id, name)}
                                    disabled={deleteLink.isPending}
                                    aria-label="Ontkoppelen"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            <AddParcelsDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                batchId={batchId}
                totalCrates={totalCrates}
                kgPerCrate={kgPerCrate}
                alreadyAssignedCrates={assignedCrates}
                alreadyLinkedSubParcelIds={
                    new Set(
                        links
                            .map((l) => l.subParcelId)
                            .filter((id): id is string => !!id),
                    )
                }
            />
        </div>
    );
}

// ============================================================================
// Add Parcels dialog — multi-select met aantal kisten per perceel
// App rekent kg per kist zelf af uit partij-totaal (kg ÷ totaal-kisten).
// ============================================================================

interface AddParcelsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    batchId: string;
    totalCrates: number | null;
    kgPerCrate: number | null;
    alreadyAssignedCrates: number;
    alreadyLinkedSubParcelIds: Set<string>;
}

type SelectionMap = Record<string, { selected: boolean; crates: string }>;

function parsePositiveInt(value: string): number | null {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

function AddParcelsDialog({
    open,
    onOpenChange,
    batchId,
    totalCrates,
    kgPerCrate,
    alreadyAssignedCrates,
    alreadyLinkedSubParcelIds,
}: AddParcelsDialogProps) {
    const { toast } = useToast();
    const { data: allParcels = [], isLoading: parcelsLoading } = useParcels();
    const addParcels = useAddBatchParcels();

    const [search, setSearch] = React.useState('');
    const [selection, setSelection] = React.useState<SelectionMap>({});

    React.useEffect(() => {
        if (open) {
            setSearch('');
            setSelection({});
        }
    }, [open]);

    const availableParcels = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return allParcels
            .filter((p) => !alreadyLinkedSubParcelIds.has(p.id))
            .filter((p) => {
                if (!q) return true;
                return (
                    p.name.toLowerCase().includes(q) ||
                    p.parcelName.toLowerCase().includes(q) ||
                    (p.variety ?? '').toLowerCase().includes(q)
                );
            });
    }, [allParcels, alreadyLinkedSubParcelIds, search]);

    const grouped = React.useMemo(() => {
        const map = new Map<string, { parcelName: string; items: typeof availableParcels }>();
        for (const p of availableParcels) {
            if (!map.has(p.parcelId)) {
                map.set(p.parcelId, { parcelName: p.parcelName, items: [] });
            }
            map.get(p.parcelId)!.items.push(p);
        }
        return Array.from(map.entries())
            .map(([parcelId, group]) => ({ parcelId, ...group }))
            .sort((a, b) => a.parcelName.localeCompare(b.parcelName, 'nl'));
    }, [availableParcels]);

    const selectedEntries = Object.entries(selection).filter(([, v]) => v.selected);
    const selectedCount = selectedEntries.length;

    const pendingCrates = selectedEntries.reduce((sum, [, v]) => {
        const n = parsePositiveInt(v.crates);
        return sum + (n ?? 0);
    }, 0);

    const remainingBefore = totalCrates != null ? Math.max(totalCrates - alreadyAssignedCrates, 0) : null;
    const remainingAfter =
        remainingBefore != null ? remainingBefore - pendingCrates : null;
    const overCap = remainingAfter != null && remainingAfter < 0;

    const toggle = (id: string) => {
        setSelection((prev) => {
            const existing = prev[id];
            return {
                ...prev,
                [id]: {
                    selected: !existing?.selected,
                    crates: existing?.crates ?? '',
                },
            };
        });
    };

    const updateCrates = (id: string, value: string) => {
        setSelection((prev) => ({
            ...prev,
            [id]: { selected: prev[id]?.selected ?? true, crates: value },
        }));
    };

    const handleSubmit = async () => {
        if (overCap) return;
        const toAdd: BatchParcelLinkInput[] = [];
        for (const p of allParcels) {
            const sel = selection[p.id];
            if (!sel?.selected) continue;
            const cratesVal = parsePositiveInt(sel.crates);
            const item: BatchParcelLinkInput = {
                subParcelId: p.id,
                parcelId: p.parcelId,
                crates: cratesVal,
                // kg_per_crate + estimated_kg leeg laten — wordt op batch-niveau afgeleid
                kgPerCrate: null,
                estimatedKg: null,
            };
            toAdd.push(item);
        }
        if (toAdd.length === 0) return;
        try {
            await addParcels.mutateAsync({ batchId, items: toAdd });
            toast({
                title: `${toAdd.length} ${toAdd.length === 1 ? 'perceel' : 'percelen'} gekoppeld`,
            });
            onOpenChange(false);
        } catch (err) {
            toast({
                title: 'Fout',
                description: err instanceof Error ? err.message : 'Er ging iets mis.',
                variant: 'destructive',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Percelen koppelen</DialogTitle>
                    <DialogDescription>
                        Selecteer percelen en vul per perceel het aantal kisten in. CropNode berekent
                        automatisch de kg per kist op basis van het partij-totaal.
                    </DialogDescription>
                </DialogHeader>

                {/* Cap-teller */}
                {totalCrates != null && (
                    <div
                        className={cn(
                            'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                            overCap
                                ? 'border-red-500/40 bg-red-500/[0.06]'
                                : 'border-white/[0.06] bg-white/[0.02]',
                        )}
                    >
                        <Package
                            className={cn(
                                'h-4 w-4 shrink-0',
                                overCap ? 'text-red-400' : 'text-slate-500',
                            )}
                        />
                        <div className="flex-1 min-w-0 text-[12px]">
                            <span className={cn('font-semibold', overCap ? 'text-red-300' : 'text-white')}>
                                {remainingAfter != null ? Math.max(remainingAfter, 0) : 0} kisten beschikbaar
                            </span>
                            <span className="text-slate-500">
                                {' van '}{totalCrates}
                                {' · reeds toegewezen '}{alreadyAssignedCrates}
                                {pendingCrates > 0 && ` · nu geselecteerd ${pendingCrates}`}
                                {overCap && ` · ${Math.abs(remainingAfter!)} te veel`}
                            </span>
                        </div>
                    </div>
                )}

                {totalCrates == null && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-300">
                        Tip: vul het totaal aantal kisten in bij de partij-gegevens om automatisch kg/kist te
                        laten berekenen en teveel-invoer te voorkomen.
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Zoek op perceel, subperceel of ras…"
                        className="pl-9"
                    />
                </div>

                {/* Lijst */}
                <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
                    {parcelsLoading ? (
                        <div className="py-10 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                        </div>
                    ) : grouped.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-[13px] text-slate-400">
                                {allParcels.length === 0
                                    ? 'Geen percelen gevonden in je account.'
                                    : search
                                      ? 'Geen percelen matchen je zoekopdracht.'
                                      : 'Alle percelen zijn al gekoppeld aan deze partij.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 py-2">
                            {grouped.map((group) => (
                                <div key={group.parcelId}>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {group.parcelName}
                                    </div>
                                    <div className="space-y-1.5">
                                        {group.items.map((p) => {
                                            const sel = selection[p.id];
                                            const isSelected = !!sel?.selected;
                                            const cratesNum = sel?.crates
                                                ? parsePositiveInt(sel.crates)
                                                : null;
                                            const derivedKg =
                                                cratesNum != null && kgPerCrate != null
                                                    ? cratesNum * kgPerCrate
                                                    : null;
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={cn(
                                                        'rounded-lg border transition-colors',
                                                        isSelected
                                                            ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                                                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3 px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggle(p.id);
                                                            }}
                                                            className={cn(
                                                                'flex h-5 w-5 items-center justify-center rounded border transition-colors shrink-0',
                                                                isSelected
                                                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                                                    : 'border-white/20 hover:border-white/40',
                                                            )}
                                                            aria-label={
                                                                isSelected ? 'Deselecteren' : 'Selecteren'
                                                            }
                                                        >
                                                            {isSelected && <Check className="h-3.5 w-3.5" />}
                                                        </button>
                                                        <div
                                                            className="flex-1 min-w-0 cursor-pointer"
                                                            onClick={() => toggle(p.id)}
                                                        >
                                                            <div className="text-[13px] font-semibold text-white truncate">
                                                                {p.name}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 truncate">
                                                                {[
                                                                    p.variety,
                                                                    p.area ? `${p.area.toFixed(2)} ha` : null,
                                                                ]
                                                                    .filter(Boolean)
                                                                    .join(' · ')}
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <Input
                                                                    type="number"
                                                                    inputMode="numeric"
                                                                    min={0}
                                                                    step={1}
                                                                    value={sel.crates}
                                                                    onChange={(e) =>
                                                                        updateCrates(p.id, e.target.value)
                                                                    }
                                                                    placeholder="kisten"
                                                                    className="w-24 h-8 text-[12px]"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                                                                    kisten
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {isSelected && derivedKg != null && (
                                                        <div className="border-t border-emerald-500/20 px-3 py-1.5 text-[11px] text-slate-400">
                                                            ≈ {derivedKg.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kg
                                                            <span className="text-slate-600"> ({kgPerCrate!.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg/kist)</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={addParcels.isPending}
                    >
                        Annuleren
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={selectedCount === 0 || overCap || addParcels.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        {addParcels.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                Koppelen…
                            </>
                        ) : (
                            `Koppelen${selectedCount > 0 ? ` (${selectedCount})` : ''}`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
