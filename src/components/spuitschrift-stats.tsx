'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
    Zap,
    Clock,
    Droplets,
    Layers,
    TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
    label: string;
    value: string | number;
    subLabel: string;
    icon: React.ElementType;
    color: string;
}

function StatCard({ label, value, subLabel, icon: Icon, color }: StatCardProps) {
    return (
        <Card className="bg-card/30 backdrop-blur-md border border-white/5 overflow-hidden group">
            <CardContent className="p-4 relative">
                <div className={cn("absolute -top-2 -right-2 h-16 w-16 opacity-10 transition-transform group-hover:scale-110", color)}>
                    <Icon className="h-full w-full" />
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {label}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-white tracking-tight">
                            {value}
                        </h3>
                        {subLabel && (
                            <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                {subLabel}
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface SpuitschriftStatsProps {
    totalSprays: number;
    pendingConfirmations: number;
    totalArea: number;
}

export function SpuitschriftStats({ totalSprays, pendingConfirmations, totalArea }: SpuitschriftStatsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatCard
                label="Totaal Bespuitingen"
                value={totalSprays}
                subLabel="Registraties"
                icon={Layers}
                color="text-primary"
            />
            <StatCard
                label="Pending Bevestiging"
                value={pendingConfirmations}
                subLabel="Wachtend"
                icon={Clock}
                color="text-amber-400"
            />
            <StatCard
                label="Totaal Oppervlakte"
                value={totalArea.toFixed(1)}
                subLabel="Hectare"
                icon={Droplets}
                color="text-emerald-400"
            />
        </div>
    );
}
