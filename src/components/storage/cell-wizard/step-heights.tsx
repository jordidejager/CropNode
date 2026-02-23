'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CellWizardData } from './index';

interface StepHeightsProps {
  data: CellWizardData;
  onChange: (updates: Partial<CellWizardData>) => void;
}

export function StepHeights({ data, onChange }: StepHeightsProps) {
  const [selectedPosition, setSelectedPosition] = React.useState<{ row: number; col: number } | null>(null);

  // Calculate effective height for each position
  const getEffectiveHeight = (row: number, col: number): number => {
    // Check for manual override first
    const key = `${row}-${col}`;
    if (data.positionHeightOverrides[key] !== undefined) {
      return data.positionHeightOverrides[key];
    }

    // Check if position is affected by door or evaporator
    const reduction = getAutoReduction(row, col);
    return data.maxStackHeight - reduction;
  };

  // Calculate auto-reduction based on proximity to doors/evaporators
  const getAutoReduction = (row: number, col: number): number => {
    let reduction = 0;

    // Check doors
    for (const door of data.doorPositions) {
      if (isAdjacentToDoor(row, col, door)) {
        reduction = Math.max(reduction, 2); // Doors reduce by 2
      }
    }

    // Check evaporators
    for (const evap of data.evaporatorPositions) {
      if (isUnderEvaporator(row, col, evap)) {
        reduction = Math.max(reduction, 2); // Evaporators reduce by 2
      }
    }

    return reduction;
  };

  // Check if position is adjacent to a door
  const isAdjacentToDoor = (row: number, col: number, door: typeof data.doorPositions[0]): boolean => {
    switch (door.side) {
      case 'north':
        return row === 0 && col >= door.startCol && col <= door.endCol;
      case 'south':
        return row === data.depth - 1 && col >= door.startCol && col <= door.endCol;
      case 'west':
        return col === 0 && row >= door.startCol && row <= door.endCol;
      case 'east':
        return col === data.width - 1 && row >= door.startCol && row <= door.endCol;
    }
  };

  // Check if position is under an evaporator
  const isUnderEvaporator = (row: number, col: number, evap: typeof data.evaporatorPositions[0]): boolean => {
    switch (evap.side) {
      case 'north':
        return row === 0 && col >= evap.startCol && col <= evap.endCol;
      case 'south':
        return row === data.depth - 1 && col >= evap.startCol && col <= evap.endCol;
      case 'west':
        return col === 0 && row >= evap.startCol && row <= evap.endCol;
      case 'east':
        return col === data.width - 1 && row >= evap.startCol && row <= evap.endCol;
    }
  };

  const handlePositionClick = (row: number, col: number) => {
    setSelectedPosition({ row, col });
  };

  const handleHeightChange = (height: number) => {
    if (!selectedPosition) return;
    const key = `${selectedPosition.row}-${selectedPosition.col}`;
    onChange({
      positionHeightOverrides: {
        ...data.positionHeightOverrides,
        [key]: height,
      },
    });
  };

  const handleResetHeight = () => {
    if (!selectedPosition) return;
    const key = `${selectedPosition.row}-${selectedPosition.col}`;
    const newOverrides = { ...data.positionHeightOverrides };
    delete newOverrides[key];
    onChange({ positionHeightOverrides: newOverrides });
  };

  const handleResetAll = () => {
    onChange({ positionHeightOverrides: {} });
    setSelectedPosition(null);
  };

  // Calculate total capacity
  const totalCapacity = React.useMemo(() => {
    let total = 0;
    for (let row = 0; row < data.depth; row++) {
      for (let col = 0; col < data.width; col++) {
        total += getEffectiveHeight(row, col);
      }
    }
    return total;
  }, [data]);

  // Get color based on height relative to max
  const getHeightColor = (height: number): string => {
    const ratio = height / data.maxStackHeight;
    if (ratio >= 1) return 'bg-emerald-500/60 border-emerald-500';
    if (ratio >= 0.75) return 'bg-emerald-400/60 border-emerald-400';
    if (ratio >= 0.5) return 'bg-amber-500/60 border-amber-500';
    return 'bg-orange-500/60 border-orange-500';
  };

  const selectedHeight = selectedPosition
    ? getEffectiveHeight(selectedPosition.row, selectedPosition.col)
    : null;

  const hasOverride = selectedPosition
    ? data.positionHeightOverrides[`${selectedPosition.row}-${selectedPosition.col}`] !== undefined
    : false;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold">Stapelhoogtes instellen</h3>
          <p className="text-sm text-muted-foreground">
            Hoogtes bij deuren en verdampers zijn automatisch verlaagd. Klik op een positie om deze handmatig aan te passen.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6">
          {/* Height grid */}
          <div
            className="grid gap-1 p-4 bg-slate-900/50 rounded-xl border border-white/10"
            style={{
              gridTemplateColumns: `repeat(${Math.min(data.width, 12)}, minmax(32px, 40px))`,
            }}
          >
            {Array.from({ length: Math.min(data.depth, 8) }).map((_, row) =>
              Array.from({ length: Math.min(data.width, 12) }).map((_, col) => {
                const height = getEffectiveHeight(row, col);
                const hasManualOverride = data.positionHeightOverrides[`${row}-${col}`] !== undefined;
                const isSelected = selectedPosition?.row === row && selectedPosition?.col === col;
                const autoReduction = getAutoReduction(row, col);

                return (
                  <Tooltip key={`${row}-${col}`}>
                    <TooltipTrigger asChild>
                      <motion.button
                        onClick={() => handlePositionClick(row, col)}
                        className={cn(
                          'aspect-square rounded-md flex items-center justify-center text-xs font-bold transition-all',
                          'border-2',
                          getHeightColor(height),
                          isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-slate-900',
                          hasManualOverride && 'ring-1 ring-blue-400'
                        )}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {height}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="text-xs">
                        <p className="font-medium">Positie {row},{col}</p>
                        <p>Max hoogte: {height} kisten</p>
                        {autoReduction > 0 && !hasManualOverride && (
                          <p className="text-amber-400">Auto -2 (deur/verdamper)</p>
                        )}
                        {hasManualOverride && (
                          <p className="text-blue-400">Handmatig ingesteld</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })
            )}
          </div>

          {/* Position editor */}
          {selectedPosition && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md p-4 bg-white/5 rounded-lg space-y-4"
            >
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Positie {selectedPosition.row}, {selectedPosition.col}
                </Label>
                <div className="flex gap-2">
                  {hasOverride && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetHeight}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedPosition(null)}
                  >
                    Sluiten
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Stapelhoogte: {selectedHeight} kisten</Label>
                <Slider
                  value={[selectedHeight ?? data.maxStackHeight]}
                  onValueChange={([value]) => handleHeightChange(value)}
                  min={1}
                  max={data.maxStackHeight}
                  step={1}
                  className="py-2"
                />
              </div>
            </motion.div>
          )}

          {/* Stats and legend */}
          <div className="w-full max-w-md space-y-4">
            {/* Capacity info */}
            <div className="p-4 bg-white/5 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Totale capaciteit:</span>
                <span className="text-lg font-bold text-emerald-500">{totalCapacity} kisten</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-muted-foreground">Standaard capaciteit:</span>
                <span className="text-sm text-muted-foreground">
                  {data.width * data.depth * data.maxStackHeight} kisten
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-emerald-500/60 border-2 border-emerald-500 rounded" />
                <span>{data.maxStackHeight} (max)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-amber-500/60 border-2 border-amber-500 rounded" />
                <span>{data.maxStackHeight - 2} (auto)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-blue-500/30 border border-blue-400 rounded ring-1 ring-blue-400" />
                <span>Handmatig</span>
              </div>
            </div>

            {/* Reset all button */}
            {Object.keys(data.positionHeightOverrides).length > 0 && (
              <Button
                variant="outline"
                onClick={handleResetAll}
                className="w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Alle handmatige aanpassingen resetten
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
