'use client';

import * as React from 'react';
import { Plus, Package, Calendar, MoreVertical, Trash2, Edit, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { CellSubParcel } from '@/lib/types';

interface SubParcelSidebarProps {
  cellSubParcels: CellSubParcel[];
  selectedSubParcelId: string | null;
  onSelectSubParcel: (id: string | null) => void;
  onAddSubParcel: () => void;
  onEditSubParcel: (subParcel: CellSubParcel) => void;
  onDeleteSubParcel: (subParcel: CellSubParcel) => void;
  isLoading?: boolean;
  className?: string;
}

export function SubParcelSidebar({
  cellSubParcels,
  selectedSubParcelId,
  onSelectSubParcel,
  onAddSubParcel,
  onEditSubParcel,
  onDeleteSubParcel,
  isLoading,
  className,
}: SubParcelSidebarProps) {
  // Format date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
  };

  // Calculate total crates across all sub-parcels
  const totalCrates = React.useMemo(() => {
    return cellSubParcels.reduce((sum, sp) => sum + (sp.totalCrates || 0), 0);
  }, [cellSubParcels]);

  return (
    <div className={cn('flex flex-col bg-white/5 rounded-lg border border-white/10', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" />
          <span className="font-medium text-sm">Subpercelen</span>
          {cellSubParcels.length > 0 && (
            <span className="text-xs text-muted-foreground">({cellSubParcels.length})</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onAddSubParcel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Sub-parcel list */}
      <ScrollArea className="flex-1 max-h-[400px]">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Laden...
          </div>
        ) : cellSubParcels.length === 0 ? (
          <div className="p-4 text-center">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Nog geen subpercelen
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-emerald-400 hover:text-emerald-300"
              onClick={onAddSubParcel}
            >
              <Plus className="h-4 w-4 mr-1" />
              Toevoegen
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {cellSubParcels.map((subParcel) => {
              const isSelected = selectedSubParcelId === subParcel.id;

              return (
                <div
                  key={subParcel.id}
                  className={cn(
                    'group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-emerald-500/20 border border-emerald-500/50'
                      : 'hover:bg-white/5 border border-transparent'
                  )}
                  onClick={() => onSelectSubParcel(isSelected ? null : subParcel.id)}
                >
                  {/* Color indicator */}
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-white/20"
                    style={{ backgroundColor: subParcel.color }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Variety + Pick number */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {subParcel.variety}
                      </span>
                      {subParcel.pickNumber && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                          {subParcel.pickNumber}e pluk
                        </span>
                      )}
                    </div>

                    {/* Parcel/Sub-parcel name */}
                    {(subParcel.parcelName || subParcel.subParcelName) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {subParcel.subParcelName || subParcel.parcelName}
                      </p>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        <span>{subParcel.totalCrates || 0} kisten</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(subParcel.pickDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditSubParcel(subParcel)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Bewerken
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-400"
                        onClick={() => onDeleteSubParcel(subParcel)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Verwijderen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer with total */}
      {cellSubParcels.length > 0 && (
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Totaal</span>
          <span className="font-medium">{totalCrates} kisten</span>
        </div>
      )}
    </div>
  );
}
