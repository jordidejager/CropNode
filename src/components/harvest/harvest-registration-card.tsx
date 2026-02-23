'use client';

import * as React from 'react';
import { Package, MoreVertical, Edit, Trash2, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { HarvestStatusBadge } from './harvest-status-badge';
import type { HarvestRegistration } from '@/lib/types';

// Color mapping for varieties (consistent with cold storage)
const VARIETY_COLORS: Record<string, string> = {
  'Elstar': '#ef4444',
  'Jonagold': '#f97316',
  'Jonagored': '#f97316',
  'Golden Delicious': '#eab308',
  'Kanzi': '#ec4899',
  'Conference': '#22c55e',
  'Doyenné du Comice': '#14b8a6',
  'Beurré Hardy': '#06b6d4',
  'Gieser Wildeman': '#8b5cf6',
  'Cox Orange Pippin': '#f59e0b',
};

function getVarietyColor(variety: string): string {
  return VARIETY_COLORS[variety] || '#3b82f6'; // Default to blue
}

interface HarvestRegistrationCardProps {
  harvest: HarvestRegistration;
  onEdit?: (harvest: HarvestRegistration) => void;
  onDelete?: (harvest: HarvestRegistration) => void;
  onLinkToStorage?: (harvest: HarvestRegistration) => void;
  className?: string;
}

export function HarvestRegistrationCard({
  harvest,
  onEdit,
  onDelete,
  onLinkToStorage,
  className,
}: HarvestRegistrationCardProps) {
  const varietyColor = getVarietyColor(harvest.variety);

  // Display name: parcelName + subParcelName if available
  const locationName = harvest.subParcelName
    ? `${harvest.parcelName || ''} ${harvest.subParcelName}`.trim()
    : harvest.parcelName || 'Onbekend perceel';

  return (
    <div
      className={cn(
        'group relative flex items-start gap-4 p-4 rounded-lg',
        'bg-white/5 border border-white/10 hover:border-white/20 transition-colors',
        className
      )}
    >
      {/* Variety color indicator */}
      <div
        className="w-3 h-12 rounded-full flex-shrink-0"
        style={{ backgroundColor: varietyColor }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: location name + variety */}
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{locationName}</span>
          <span className="text-muted-foreground">—</span>
          <span className="text-muted-foreground truncate">{harvest.variety}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-1.5">
          <div className="flex items-center gap-1.5 text-sm">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{harvest.totalCrates}</span>
            <span className="text-muted-foreground">kisten</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70">
            {harvest.pickNumber}e pluk
          </span>
          {harvest.qualityClass && (
            <span className="text-xs text-muted-foreground">
              {harvest.qualityClass}
            </span>
          )}
        </div>

        {/* Storage status row */}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-muted-foreground">
            {harvest.storedCrates || 0}/{harvest.totalCrates} opgeslagen
          </span>
          <HarvestStatusBadge status={harvest.storageStatus || 'not_stored'} />
          {harvest.cellNames && (
            <span className="text-xs text-muted-foreground truncate">
              in {harvest.cellNames}
            </span>
          )}
        </div>
      </div>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && (
            <DropdownMenuItem onClick={() => onEdit(harvest)}>
              <Edit className="h-4 w-4 mr-2" />
              Bewerken
            </DropdownMenuItem>
          )}
          {onLinkToStorage && harvest.remainingCrates && harvest.remainingCrates > 0 && (
            <DropdownMenuItem onClick={() => onLinkToStorage(harvest)}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Koppelen aan opslag
            </DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem
              className="text-red-400 focus:text-red-400"
              onClick={() => onDelete(harvest)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
