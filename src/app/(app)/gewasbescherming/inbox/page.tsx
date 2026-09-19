'use client';

import * as React from 'react';
import { Inbox, CheckCheck, Loader2, MessageSquareText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ComboboxOption } from '@/components/ui/combobox';
import { SectionHeader, GlowOrb } from '@/components/ui/premium';
import { SpuitschriftSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { useToast } from '@/hooks/use-toast';
import { useSprayInbox, useParcels, useCtgbProducts, useFertilizers, useInvalidateQueries } from '@/hooks/use-data';
import { SprayInboxCard, hasOpenQuestions } from '@/components/spuitschrift/spray-inbox-card';
import { approveSprayDraft } from '@/app/spray-inbox-actions';

export default function SprayInboxPage() {
    const { data: entries = [], isLoading: isLoadingEntries, isError, error, refetch } = useSprayInbox();
    const { data: allParcels = [], isLoading: isLoadingParcels } = useParcels();
    const { data: ctgbProducts = [], isLoading: isLoadingProducts } = useCtgbProducts();
    const { data: fertilizers = [] } = useFertilizers();
    const { invalidateSprayInbox, invalidateSpuitschrift, invalidateInventory } = useInvalidateQueries();
    const { toast } = useToast();
    const [bulkBusy, setBulkBusy] = React.useState(false);

    const productOptions = React.useMemo<ComboboxOption[]>(() => {
        const names = new Set<string>();
        for (const p of ctgbProducts) if (p.naam) names.add(p.naam);
        for (const f of fertilizers) if (f.name) names.add(f.name);
        return [...names].sort((a, b) => a.localeCompare(b, 'nl')).map(n => ({ value: n, label: n }));
    }, [ctgbProducts, fertilizers]);

    const refreshAll = () => {
        invalidateSprayInbox();
        invalidateSpuitschrift();
        invalidateInventory();
    };

    const readyEntries = entries.filter(e => !hasOpenQuestions(e));

    const handleApproveAllReady = async () => {
        if (readyEntries.length === 0) return;
        setBulkBusy(true);
        let ok = 0;
        const failures: string[] = [];
        for (const e of readyEntries) {
            const result = await approveSprayDraft(e.id, {
                date: e.date,
                plots: e.parsedData?.plots || [],
                products: e.parsedData?.products || [],
                registrationType: e.registrationType || 'spraying',
            });
            if (result.success) ok++;
            else failures.push(result.message || e.rawInput.slice(0, 40));
        }
        setBulkBusy(false);
        refreshAll();
        toast({
            title: `${ok} registratie${ok === 1 ? '' : 's'} goedgekeurd`,
            description: failures.length ? `${failures.length} mislukt: ${failures[0]}` : undefined,
            variant: failures.length ? 'destructive' : 'default',
        });
    };

    const header = (
        <SectionHeader
            eyebrow="Gewasbescherming"
            title="Inbox"
            titleGradient={entries.length > 0 ? `${entries.length} te controleren` : undefined}
            description="Spuit- en bemestingsnotities via WhatsApp. Controleer, pas aan en keur goed — dan staan ze in het spuitschrift."
            color="emerald"
            action={
                readyEntries.length > 1 ? (
                    <Button size="lg" variant="outline" className="h-12 px-5 text-base" onClick={handleApproveAllReady} disabled={bulkBusy}>
                        {bulkBusy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCheck className="h-5 w-5 mr-2" />}
                        {readyEntries.length} zonder vragen goedkeuren
                    </Button>
                ) : undefined
            }
        />
    );

    const isLoading = isLoadingEntries || isLoadingParcels || isLoadingProducts;

    if (isLoading) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="emerald" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card><CardContent className="pt-6"><SpuitschriftSkeleton /></CardContent></Card>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="relative space-y-8">
                <GlowOrb color="emerald" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState title="Kon inbox niet laden" message={error?.message || 'Er is een fout opgetreden.'} onRetry={() => refetch()} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="relative space-y-8">
            <GlowOrb color="emerald" position="top-left" size="w-[400px] h-[300px]" blur="blur-[140px]" opacity={0.06} />
            {header}

            {entries.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <EmptyState
                            icon={Inbox}
                            title="Geen openstaande notities"
                            description="Stuur een korte spuit- of bemestingsnotitie naar het CropNode spuit-nummer op WhatsApp, bijv. “X en Y gespoten met captan en 0,5 soriale”. Hij verschijnt hier automatisch als concept."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                        <MessageSquareText className="h-4 w-4" />
                        Gele velden zijn onzeker — controleer die eerst. Groene labels tonen wat automatisch is ingevuld.
                    </p>
                    {entries.map(entry => (
                        <SprayInboxCard
                            key={entry.id}
                            entry={entry}
                            allParcels={allParcels}
                            productOptions={productOptions}
                            onChanged={refreshAll}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
