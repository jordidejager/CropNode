'use client';

import * as React from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HarvestRegistrationCard } from './harvest-registration-card';
import type { HarvestRegistration } from '@/lib/types';

interface HarvestDateGroupProps {
  date: Date;
  harvests: HarvestRegistration[];
  onEditHarvest?: (harvest: HarvestRegistration) => void;
  onDeleteHarvest?: (harvest: HarvestRegistration) => void;
  onLinkToStorage?: (harvest: HarvestRegistration) => void;
  className?: string;
}

export function HarvestDateGroup({
  date,
  harvests,
  onEditHarvest,
  onDeleteHarvest,
  onLinkToStorage,
  className,
}: HarvestDateGroupProps) {
  // Format date in Dutch
  const formattedDate = date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Calculate totals
  const totalCrates = harvests.reduce((sum, h) => sum + h.totalCrates, 0);
  const storedCrates = harvests.reduce((sum, h) => sum + (h.storedCrates || 0), 0);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Date header */}
      <div className="flex items-center justify-between py-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="font-medium capitalize">{formattedDate}</span>
          <span className="text-xs text-muted-foreground">
            {harvests.length} {harvests.length === 1 ? 'registratie' : 'registraties'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>{totalCrates} kisten</span>
          <span className="text-xs">({storedCrates} opgeslagen)</span>
        </div>
      </div>

      {/* Harvest cards */}
      <div className="space-y-2">
        {harvests.map((harvest) => (
          <HarvestRegistrationCard
            key={harvest.id}
            harvest={harvest}
            onEdit={onEditHarvest}
            onDelete={onDeleteHarvest}
            onLinkToStorage={onLinkToStorage}
          />
        ))}
      </div>
    </div>
  );
}
