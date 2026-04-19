'use client';

import * as React from 'react';
import { useProductMovements } from '@/hooks/use-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowLeft, History } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/ui/data-states';
import { useParams } from 'next/navigation';
import { SectionHeader, SpotlightCard, GlowOrb } from '@/components/ui/premium';

const formatDate = (date: Date) => {
    return format(date, 'dd MMMM yyyy', { locale: nl });
};

export default function VoorraadMutatiePage() {
    const params = useParams();
    const productName = decodeURIComponent(params.id as string);

    const { movements, currentStock, unit, isLoading, isError, error, refetch } = useProductMovements(productName);

    const backButton = (
        <Button asChild variant="ghost" className="h-11 text-base text-slate-300 hover:text-white -ml-3 w-fit">
            <Link href="/gewasbescherming/voorraad">
                <ArrowLeft className="mr-2 h-5 w-5" />
                Terug naar voorraad
            </Link>
        </Button>
    );

    if (isLoading) {
        return (
            <div className="relative space-y-6">
                <GlowOrb color="amber" position="top-left" size="w-[400px] h-[260px]" blur="blur-[140px]" opacity={0.07} />
                {backButton}
                <SectionHeader
                    eyebrow="Voorraad"
                    title={productName}
                    description="Volledige geschiedenis van toevoegingen en verbruik."
                    color="amber"
                />
                <SpotlightCard color="amber" padding="p-5">
                    <TableSkeleton rows={5} columns={4} />
                </SpotlightCard>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="relative space-y-6">
                <GlowOrb color="amber" position="top-left" size="w-[400px] h-[260px]" blur="blur-[140px]" opacity={0.07} />
                {backButton}
                <SectionHeader
                    eyebrow="Voorraad"
                    title={productName}
                    description="Volledige geschiedenis van toevoegingen en verbruik."
                    color="amber"
                />
                <ErrorState
                    title="Kon mutaties niet laden"
                    message={error?.message || 'Er is een fout opgetreden bij het ophalen van de mutaties.'}
                    onRetry={() => refetch()}
                />
            </div>
        );
    }

    return (
        <div className="relative space-y-6">
            <GlowOrb color="amber" position="top-left" size="w-[500px] h-[300px]" blur="blur-[140px]" opacity={0.07} />
            <GlowOrb color="orange" position="top-right" size="w-[320px] h-[220px]" blur="blur-[140px]" opacity={0.04} />

            {backButton}

            <SectionHeader
                eyebrow="Voorraad"
                title={productName}
                description="Volledige geschiedenis van toevoegingen en verbruik."
                color="amber"
                action={
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-3">
                        <p className="text-sm text-slate-400">Huidige voorraad</p>
                        <p className={cn(
                            'text-3xl font-bold tabular-nums leading-tight',
                            currentStock < 0 ? 'text-destructive' : 'text-white',
                        )}>
                            {currentStock.toFixed(2)} <span className="text-lg text-slate-400 font-medium">{unit}</span>
                        </p>
                    </div>
                }
            />

            <SpotlightCard color="amber" padding="p-0">
                {movements.length > 0 ? (
                    <div className="rounded-2xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/10 hover:bg-transparent">
                                    <TableHead className="text-sm px-5">Datum</TableHead>
                                    <TableHead className="text-sm">Type</TableHead>
                                    <TableHead className="text-sm">Omschrijving</TableHead>
                                    <TableHead className="text-sm text-right px-5">Hoeveelheid</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {movements.map(item => (
                                    <TableRow key={item.id} className="border-white/[0.06]">
                                        <TableCell className="text-base text-slate-300 px-5">{formatDate(item.date)}</TableCell>
                                        <TableCell>
                                            <span className={cn(
                                                'text-sm font-semibold px-2.5 py-1 rounded-full border',
                                                item.type === 'addition'
                                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                    : 'text-red-400 bg-red-500/10 border-red-500/20',
                                            )}>
                                                {item.type === 'addition' ? 'Toevoeging' : 'Verbruik'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-base text-slate-300">{item.description}</TableCell>
                                        <TableCell className={cn(
                                            'text-right font-mono text-base tabular-nums px-5',
                                            item.quantity > 0 ? 'text-emerald-400' : 'text-red-400',
                                        )}>
                                            {item.quantity > 0 ? `+${item.quantity.toFixed(3)}` : item.quantity.toFixed(3)} {item.unit}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="p-6">
                        <EmptyState
                            icon={History}
                            title="Geen mutaties gevonden"
                            description="Er zijn nog geen mutaties geregistreerd voor dit product."
                        />
                    </div>
                )}
            </SpotlightCard>
        </div>
    );
}
