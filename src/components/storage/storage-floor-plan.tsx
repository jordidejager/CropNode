'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Lock, Package, DoorOpen, Wind } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StorageCell, StoragePosition, DoorPosition, EvaporatorPosition } from '@/lib/types';
import { cn } from '@/lib/utils';

// Variety color mapping
const VARIETY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Elstar': { bg: 'bg-red-500/60', border: 'border-red-500', text: 'text-red-100' },
  'Jonagold': { bg: 'bg-orange-500/60', border: 'border-orange-500', text: 'text-orange-100' },
  'Conference': { bg: 'bg-green-600/60', border: 'border-green-600', text: 'text-green-100' },
  'Beurré Alexandre Lucas': { bg: 'bg-yellow-500/60', border: 'border-yellow-500', text: 'text-yellow-100' },
  'Kanzi': { bg: 'bg-pink-500/60', border: 'border-pink-500', text: 'text-pink-100' },
  'Gala': { bg: 'bg-amber-500/60', border: 'border-amber-500', text: 'text-amber-100' },
  'Golden Delicious': { bg: 'bg-yellow-400/60', border: 'border-yellow-400', text: 'text-yellow-100' },
  'Granny Smith': { bg: 'bg-lime-500/60', border: 'border-lime-500', text: 'text-lime-100' },
  'Fuji': { bg: 'bg-rose-500/60', border: 'border-rose-500', text: 'text-rose-100' },
  'Braeburn': { bg: 'bg-red-600/60', border: 'border-red-600', text: 'text-red-100' },
  'Doyenné du Comice': { bg: 'bg-teal-500/60', border: 'border-teal-500', text: 'text-teal-100' },
};

const DEFAULT_COLOR = { bg: 'bg-emerald-500/60', border: 'border-emerald-500', text: 'text-emerald-100' };

function getVarietyColor(variety: string | null) {
  if (!variety) return DEFAULT_COLOR;
  return VARIETY_COLORS[variety] || DEFAULT_COLOR;
}

interface StorageFloorPlanProps {
  cell: StorageCell;
  positions: StoragePosition[];
  editMode: boolean;
  onPositionClick: (row: number, col: number, position?: StoragePosition) => void;
  onBlockToggle?: (row: number, col: number) => void;
  selectedPosition?: { row: number; col: number } | null;
  showHeights?: boolean; // Show height numbers on positions
}

export function StorageFloorPlan({
  cell,
  positions,
  editMode,
  onPositionClick,
  onBlockToggle,
  selectedPosition,
  showHeights = false,
}: StorageFloorPlanProps) {
  // Create a map for quick position lookup
  const positionMap = React.useMemo(() => {
    const map = new Map<string, StoragePosition>();
    positions.forEach(pos => {
      map.set(`${pos.rowIndex}-${pos.colIndex}`, pos);
    });
    return map;
  }, [positions]);

  // Create a set for quick blocked position lookup
  const blockedSet = React.useMemo(() => {
    const set = new Set<string>();
    cell.blockedPositions.forEach(bp => {
      set.add(`${bp.row}-${bp.col}`);
    });
    return set;
  }, [cell.blockedPositions]);

  const isBlocked = (row: number, col: number) => blockedSet.has(`${row}-${col}`);
  const getPosition = (row: number, col: number) => positionMap.get(`${row}-${col}`);

  // Check if position is adjacent to a door
  const isAdjacentToDoor = (row: number, col: number): boolean => {
    if (!cell.doorPositions) return false;
    return cell.doorPositions.some((door: DoorPosition) => {
      switch (door.side) {
        case 'north':
          return row === 0 && col >= door.startCol && col <= door.endCol;
        case 'south':
          return row === cell.depth - 1 && col >= door.startCol && col <= door.endCol;
        case 'west':
          return col === 0 && row >= door.startCol && row <= door.endCol;
        case 'east':
          return col === cell.width - 1 && row >= door.startCol && row <= door.endCol;
      }
    });
  };

  // Check if position is under an evaporator
  const isUnderEvaporator = (row: number, col: number): boolean => {
    if (!cell.evaporatorPositions) return false;
    return cell.evaporatorPositions.some((evap: EvaporatorPosition) => {
      switch (evap.side) {
        case 'north':
          return row === 0 && col >= evap.startCol && col <= evap.endCol;
        case 'south':
          return row === cell.depth - 1 && col >= evap.startCol && col <= evap.endCol;
        case 'west':
          return col === 0 && row >= evap.startCol && row <= evap.endCol;
        case 'east':
          return col === cell.width - 1 && row >= evap.startCol && row <= evap.endCol;
      }
    });
  };

  // Get effective max height for a position
  const getMaxHeight = (row: number, col: number): number => {
    const key = `${row}-${col}`;
    if (cell.positionHeightOverrides?.[key] !== undefined) {
      return cell.positionHeightOverrides[key];
    }
    let reduction = 0;
    if (isAdjacentToDoor(row, col)) reduction = Math.max(reduction, 2);
    if (isUnderEvaporator(row, col)) reduction = Math.max(reduction, 2);
    return (cell.maxStackHeight || 8) - reduction;
  };

  const handleClick = (row: number, col: number) => {
    if (editMode && onBlockToggle) {
      onBlockToggle(row, col);
    } else if (!isBlocked(row, col)) {
      const position = getPosition(row, col);
      onPositionClick(row, col, position);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  // Calculate cell size in pixels for door/evaporator positioning
  const cellSize = 56; // approx minmax value
  const gap = 4;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-auto">
        <div className="relative p-6">
          {/* Door indicators on walls */}
          {cell.doorPositions?.map((door: DoorPosition, i: number) => {
            let style: React.CSSProperties = { position: 'absolute' };
            const startOffset = 24 + door.startCol * (cellSize + gap);
            const width = (door.endCol - door.startCol + 1) * (cellSize + gap) - gap;

            switch (door.side) {
              case 'north':
                style = { ...style, top: 8, left: startOffset, width, height: 12 };
                break;
              case 'south':
                style = { ...style, bottom: 8, left: startOffset, width, height: 12 };
                break;
              case 'west':
                style = {
                  ...style,
                  left: 8,
                  top: 24 + door.startCol * (cellSize + gap),
                  width: 12,
                  height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
              case 'east':
                style = {
                  ...style,
                  right: 8,
                  top: 24 + door.startCol * (cellSize + gap),
                  width: 12,
                  height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
            }

            return (
              <div
                key={`door-${i}`}
                className="bg-amber-500 rounded flex items-center justify-center"
                style={style}
              >
                <DoorOpen className="h-3 w-3 text-amber-900" />
              </div>
            );
          })}

          {/* Evaporator indicators on walls */}
          {cell.evaporatorPositions?.map((evap: EvaporatorPosition, i: number) => {
            let style: React.CSSProperties = { position: 'absolute' };
            const startOffset = 24 + evap.startCol * (cellSize + gap);
            const width = (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap;

            switch (evap.side) {
              case 'north':
                style = { ...style, top: 2, left: startOffset, width, height: 16 };
                break;
              case 'south':
                style = { ...style, bottom: 2, left: startOffset, width, height: 16 };
                break;
              case 'west':
                style = {
                  ...style,
                  left: 2,
                  top: 24 + evap.startCol * (cellSize + gap),
                  width: 16,
                  height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
              case 'east':
                style = {
                  ...style,
                  right: 2,
                  top: 24 + evap.startCol * (cellSize + gap),
                  width: 16,
                  height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
            }

            return (
              <div
                key={`evap-${i}`}
                className="bg-cyan-500 rounded flex items-center justify-center"
                style={style}
              >
                <Wind className="h-3 w-3 text-cyan-900" />
              </div>
            );
          })}

          {/* Main grid */}
          <div
            className="grid gap-1 p-4 bg-slate-900/50 rounded-xl border border-white/10"
            style={{
              gridTemplateColumns: `repeat(${cell.width}, minmax(48px, 64px))`,
              minWidth: `${cell.width * 52}px`,
            }}
          >
            {Array.from({ length: cell.depth }).map((_, rowIndex) =>
              Array.from({ length: cell.width }).map((_, colIndex) => {
                const blocked = isBlocked(rowIndex, colIndex);
                const position = getPosition(rowIndex, colIndex);
                const isSelected = selectedPosition?.row === rowIndex && selectedPosition?.col === colIndex;
                const color = position ? getVarietyColor(position.variety) : null;
                const isDoorAdjacent = isAdjacentToDoor(rowIndex, colIndex);
                const isEvapAdjacent = isUnderEvaporator(rowIndex, colIndex);
                const maxHeight = getMaxHeight(rowIndex, colIndex);

                if (blocked) {
                  return (
                    <motion.div
                      key={`${rowIndex}-${colIndex}`}
                      className={cn(
                        'aspect-square rounded-md flex items-center justify-center',
                        'bg-slate-800/80 border border-slate-700',
                        editMode ? 'cursor-pointer hover:bg-slate-700/80' : 'cursor-not-allowed'
                      )}
                      onClick={() => handleClick(rowIndex, colIndex)}
                      whileHover={editMode ? { scale: 1.05 } : {}}
                      whileTap={editMode ? { scale: 0.95 } : {}}
                    >
                      <Lock className="h-4 w-4 text-slate-500" />
                    </motion.div>
                  );
                }

                if (position) {
                  return (
                    <Tooltip key={`${rowIndex}-${colIndex}`}>
                      <TooltipTrigger asChild>
                        <motion.div
                          className={cn(
                            'aspect-square rounded-md flex flex-col items-center justify-center cursor-pointer relative',
                            'border-2 transition-all',
                            color?.bg,
                            color?.border,
                            isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-slate-900',
                            'hover:scale-105 hover:shadow-lg',
                            (isDoorAdjacent || isEvapAdjacent) && 'opacity-80'
                          )}
                          onClick={() => handleClick(rowIndex, colIndex)}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Package className={cn('h-4 w-4', color?.text)} />
                          <span className={cn('text-[10px] font-bold', color?.text)}>
                            {position.quantity}/{maxHeight}
                          </span>
                          {/* Height indicator in corner */}
                          {showHeights && maxHeight < (cell.maxStackHeight || 8) && (
                            <span className="absolute top-0.5 right-0.5 text-[8px] text-amber-400 font-bold">
                              {maxHeight}
                            </span>
                          )}
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <div className="space-y-1">
                          <p className="font-semibold">{position.variety || 'Onbekend ras'}</p>
                          {position.subParcelName && (
                            <p className="text-xs text-muted-foreground">{position.subParcelName}</p>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <span>Stapel: {position.quantity}/{maxHeight}</span>
                            {position.qualityClass && (
                              <span className="text-muted-foreground">| {position.qualityClass}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Inslag: {formatDate(position.dateStored)}
                          </p>
                          {(isDoorAdjacent || isEvapAdjacent) && (
                            <p className="text-xs text-amber-400">
                              {isDoorAdjacent && 'Bij deur'}{isDoorAdjacent && isEvapAdjacent && ' & '}{isEvapAdjacent && 'Onder verdamper'}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                // Empty position
                return (
                  <Tooltip key={`${rowIndex}-${colIndex}`}>
                    <TooltipTrigger asChild>
                      <motion.div
                        className={cn(
                          'aspect-square rounded-md cursor-pointer relative',
                          'bg-white/5 border border-white/10',
                          'hover:bg-white/10 hover:border-emerald-500/30',
                          isSelected && 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-900',
                          editMode && 'hover:bg-red-500/20 hover:border-red-500/50',
                          (isDoorAdjacent || isEvapAdjacent) && 'bg-amber-500/5 border-amber-500/20'
                        )}
                        onClick={() => handleClick(rowIndex, colIndex)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {/* Height indicator for empty positions near door/evaporator */}
                        {showHeights && maxHeight < (cell.maxStackHeight || 8) && (
                          <span className="absolute top-0.5 right-0.5 text-[8px] text-amber-400 font-bold">
                            {maxHeight}
                          </span>
                        )}
                      </motion.div>
                    </TooltipTrigger>
                    {(isDoorAdjacent || isEvapAdjacent) && (
                      <TooltipContent side="top">
                        <div className="text-xs">
                          <p>Max hoogte: {maxHeight}</p>
                          {isDoorAdjacent && <p className="text-amber-400">Bij deur</p>}
                          {isEvapAdjacent && <p className="text-cyan-400">Onder verdamper</p>}
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Export the variety colors for the legend component
export { VARIETY_COLORS, getVarietyColor };
