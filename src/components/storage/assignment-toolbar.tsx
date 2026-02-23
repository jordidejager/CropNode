'use client';

import * as React from 'react';
import { X, MousePointer2, Layers, Grid3X3, Columns, Rows, Trash2, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CellSubParcel } from '@/lib/types';

interface AssignmentToolbarProps {
  selectedSubParcel: CellSubParcel;
  selectedPositions: Array<{ rowIndex: number; colIndex: number }>;
  quickFillMode: boolean;
  onQuickFillModeChange: (enabled: boolean) => void;
  onClearSelection: () => void;
  onDone: () => void;
  onFillRow: (rowIndex: number) => void;
  onFillColumn: (colIndex: number) => void;
  onFillAllEmpty: () => void;
  onFillSelectedPositions: () => void;
  onClearPositions: () => void;
  className?: string;
}

export function AssignmentToolbar({
  selectedSubParcel,
  selectedPositions,
  quickFillMode,
  onQuickFillModeChange,
  onClearSelection,
  onDone,
  onFillRow,
  onFillColumn,
  onFillAllEmpty,
  onFillSelectedPositions,
  onClearPositions,
  className,
}: AssignmentToolbarProps) {
  // Check if we have a consistent row/column selection
  const selectedRow = React.useMemo(() => {
    if (selectedPositions.length === 0) return null;
    const firstRow = selectedPositions[0].rowIndex;
    const allSameRow = selectedPositions.every((p) => p.rowIndex === firstRow);
    return allSameRow ? firstRow : null;
  }, [selectedPositions]);

  const selectedColumn = React.useMemo(() => {
    if (selectedPositions.length === 0) return null;
    const firstCol = selectedPositions[0].colIndex;
    const allSameCol = selectedPositions.every((p) => p.colIndex === firstCol);
    return allSameCol ? firstCol : null;
  }, [selectedPositions]);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-4 py-3',
        'bg-gradient-to-r from-emerald-500/20 to-emerald-600/10',
        'border border-emerald-500/30 rounded-lg',
        className
      )}
    >
      {/* Left side: Info */}
      <div className="flex items-center gap-3">
        <MousePointer2 className="h-5 w-5 text-emerald-400" />
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full ring-2 ring-white/30"
            style={{ backgroundColor: selectedSubParcel.color }}
          />
          <span className="font-medium text-sm">
            {selectedSubParcel.variety}
          </span>
          {selectedSubParcel.subParcelName && (
            <span className="text-xs text-muted-foreground">
              ({selectedSubParcel.subParcelName})
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {quickFillMode
            ? 'Snel vullen — klik om posities te selecteren'
            : 'geselecteerd — klik op posities om toe te wijzen'}
        </span>
        {selectedPositions.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
            {selectedPositions.length} positie{selectedPositions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2">
        {/* Quick fill mode toggle */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/5 border border-white/10">
          <Switch
            id="quick-fill-mode"
            checked={quickFillMode}
            onCheckedChange={onQuickFillModeChange}
            className="data-[state=checked]:bg-emerald-500"
          />
          <Label htmlFor="quick-fill-mode" className="text-xs cursor-pointer whitespace-nowrap">
            Snel vullen
          </Label>
        </div>

        {/* Fill selected button - only show when in quick fill mode with selections */}
        {quickFillMode && selectedPositions.length > 0 && (
          <Button
            variant="default"
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-700"
            onClick={onFillSelectedPositions}
          >
            <CheckSquare className="h-4 w-4 mr-1.5" />
            Vul {selectedPositions.length} positie{selectedPositions.length !== 1 ? 's' : ''}
          </Button>
        )}

        {/* Quick fill dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Grid3X3 className="h-4 w-4 mr-1.5" />
              Meer
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onFillAllEmpty}>
              <Layers className="h-4 w-4 mr-2" />
              Alle lege posities vullen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {selectedRow !== null && (
              <DropdownMenuItem onClick={() => onFillRow(selectedRow)}>
                <Rows className="h-4 w-4 mr-2" />
                Hele rij {selectedRow + 1}
              </DropdownMenuItem>
            )}
            {selectedColumn !== null && (
              <DropdownMenuItem onClick={() => onFillColumn(selectedColumn)}>
                <Columns className="h-4 w-4 mr-2" />
                Hele kolom {selectedColumn + 1}
              </DropdownMenuItem>
            )}
            {selectedPositions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClearSelection}>
                  Selectie wissen
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400"
                  onClick={onClearPositions}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Selectie leegmaken
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Done button */}
        <Button
          variant="default"
          size="sm"
          className="h-8 bg-slate-600 hover:bg-slate-700"
          onClick={onDone}
        >
          <X className="h-4 w-4 mr-1.5" />
          Klaar
        </Button>
      </div>
    </div>
  );
}
