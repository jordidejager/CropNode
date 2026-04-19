'use client';

import * as React from 'react';
import { ProductCard } from './product-card';
import { Building2, Tag, Droplet, Sprout, Combine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FertilizerProduct } from '@/lib/types';
import { getElementDutchName } from '@/lib/element-info';

import type { PaletteColor } from '@/components/ui/premium';

interface FertilizerCardProps {
    fertilizer: FertilizerProduct;
    onShowDetails: (fertilizer: FertilizerProduct) => void;
}

type Category = 'Leaf' | 'Soil' | 'Fertigation';

const categoryConfig: Record<Category, { label: string, icon: React.ElementType, color: string, palette: PaletteColor }> = {
    'Leaf': { label: 'Blad', icon: Droplet, color: 'bg-green-600/30 text-green-400 border-green-500/50', palette: 'green' },
    'Soil': { label: 'Bodem', icon: Combine, color: 'bg-amber-600/30 text-amber-400 border-amber-500/50', palette: 'amber' },
    'Fertigation': { label: 'Fertigatie', icon: Sprout, color: 'bg-blue-600/30 text-blue-400 border-blue-500/50', palette: 'blue' },
}

const formatComposition = (composition: FertilizerProduct['composition']): string => {
    if (!composition || Object.keys(composition).length === 0) {
        return '';
    }

    // NPK logic
    if (composition.N !== undefined || composition.P !== undefined || composition.K !== undefined) {
        if (composition.N !== undefined && composition.P === undefined && composition.K === undefined) {
            return `Stikstof (N) ${composition.N}%`;
        }
        const n = composition.N ?? 0;
        const p = composition.P ?? 0;
        const k = composition.K ?? 0;
        return `NPK ${n}-${p}-${k}`;
    }

    // Single elements fallback - met Nederlandse naam
    const elements = Object.entries(composition)
        .filter(([_, v]) => v !== undefined && v !== null)
        .slice(0, 2);

    if (elements.length > 0) {
        return elements.map(([k, v]) => `${getElementDutchName(k)} (${k}) ${v}%`).join(' + ');
    }

    return '';
};

export function FertilizerCard({ fertilizer, onShowDetails }: FertilizerCardProps) {
    const catConfig = categoryConfig[fertilizer.category] || { label: fertilizer.category, color: 'bg-zinc-600/30', palette: 'emerald' as PaletteColor };

    // Use composition as subtitle
    const compositionStr = formatComposition(fertilizer.composition);

    return (
        <ProductCard
            color={catConfig.palette}
            title={fertilizer.name}
            subtitle={compositionStr || 'Standaard samenstelling'}
            labels={[
                {
                    label: 'Producent',
                    value: fertilizer.manufacturer,
                    verified: true,
                    icon: <Building2 className="h-3.5 w-3.5" />
                },
                {
                    label: 'Categorie',
                    value: catConfig.label,
                    icon: <Tag className="h-3.5 w-3.5" />
                },
            ]}
            categoryBadge={
                <Badge className={cn("text-xs font-bold tracking-wider shrink-0 h-7 px-2.5", catConfig.color)}>
                    {catConfig.label}
                </Badge>
            }
            onAction={() => onShowDetails(fertilizer)}
            actionLabel="Bekijk details"
        />
    );
}
