'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Lock, DoorOpen, Wind, Package } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StorageCell, PositionStack, DoorPosition, EvaporatorPosition } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StorageFloorPlanV2Props {
  cell: StorageCell;
  positionStacks: Map<string, PositionStack>;
  editMode: boolean;
  assignmentMode: boolean;
  selectedPositions: Array<{ rowIndex: number; colIndex: number }>;
  onPositionClick: (row: number, col: number, stack?: PositionStack) => void;
  onPositionShiftClick?: (row: number, col: number) => void;
  onBlockToggle?: (row: number, col: number) => void;
  showHeights?: boolean;
}

export function StorageFloorPlanV2({
  cell,
  positionStacks,
  editMode,
  assignmentMode,
  selectedPositions,
  onPositionClick,
  onPositionShiftClick,
  onBlockToggle,
  showHeights = false,
}: StorageFloorPlanV2Props) {
  // Create a set for quick blocked position lookup
  const blockedSet = React.useMemo(() => {
    const set = new Set<string>();
    cell.blockedPositions.forEach(bp => {
      set.add(`${bp.row}-${bp.col}`);
    });
    return set;
  }, [cell.blockedPositions]);

  // Create a set for quick selected position lookup
  const selectedSet = React.useMemo(() => {
    const set = new Set<string>();
    selectedPositions.forEach(p => {
      set.add(`${p.rowIndex}-${p.colIndex}`);
    });
    return set;
  }, [selectedPositions]);

  const isBlocked = (row: number, col: number) => blockedSet.has(`${row}-${col}`);
  const isSelected = (row: number, col: number) => selectedSet.has(`${row}-${col}`);
  const getStack = (row: number, col: number) => positionStacks.get(`${row}-${col}`);

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

  const handleClick = (e: React.MouseEvent, row: number, col: number) => {
    if (editMode && onBlockToggle) {
      onBlockToggle(row, col);
      return;
    }

    if (isBlocked(row, col)) return;

    // Shift+click for multi-select in assignment mode
    if (assignmentMode && e.shiftKey && onPositionShiftClick) {
      onPositionShiftClick(row, col);
      return;
    }

    const stack = getStack(row, col);
    onPositionClick(row, col, stack);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  // Calculate cell size in pixels for door/evaporator positioning
  const cellSize = 56;
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
                const stack = getStack(rowIndex, colIndex);
                const selected = isSelected(rowIndex, colIndex);
                const isDoorAdjacent = isAdjacentToDoor(rowIndex, colIndex);
                const isEvapAdjacent = isUnderEvaporator(rowIndex, colIndex);
                const maxHeight = getMaxHeight(rowIndex, colIndex);

                // Blocked position
                if (blocked) {
                  return (
                    <motion.div
                      key={`${rowIndex}-${colIndex}`}
                      className={cn(
                        'aspect-square rounded-md flex items-center justify-center',
                        'bg-slate-800/80 border border-slate-700',
                        editMode ? 'cursor-pointer hover:bg-slate-700/80' : 'cursor-not-allowed'
                      )}
                      onClick={(e) => handleClick(e, rowIndex, colIndex)}
                      whileHover={editMode ? { scale: 1.05 } : {}}
                      whileTap={editMode ? { scale: 0.95 } : {}}
                    >
                      <Lock className="h-4 w-4 text-slate-500" />
                    </motion.div>
                  );
                }

                // Filled position (has stack)
                if (stack && stack.totalHeight > 0) {
                  return (
                    <Tooltip key={`${rowIndex}-${colIndex}`}>
                      <TooltipTrigger asChild>
                        <motion.div
                          className={cn(
                            'aspect-square rounded-md cursor-pointer relative overflow-hidden',
                            'border-2 transition-all',
                            selected && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900',
                            assignmentMode && 'cursor-crosshair',
                            'hover:scale-105 hover:shadow-lg',
                            (isDoorAdjacent || isEvapAdjacent) && 'opacity-80'
                          )}
                          style={{ borderColor: stack.dominantColor }}
                          onClick={(e) => handleClick(e, rowIndex, colIndex)}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {/* Stack visualization - split colors */}
                          <div className="absolute inset-0 flex flex-col-reverse">
                            {stack.contents.map((content, i) => {
                              const heightPercent = (content.stackCount / maxHeight) * 100;
                              return (
                                <div
                                  key={content.id || i}
                                  className="w-full"
                                  style={{
                                    backgroundColor: content.color || '#888',
                                    height: `${heightPercent}%`,
                                  }}
                                />
                              );
                            })}
                          </div>

                          {/* Content overlay */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {stack.isMixed ? (
                              <>
                                <span className="text-[10px] font-bold text-white drop-shadow-md">
                                  {stack.totalHeight}/{maxHeight}
                                </span>
                                <span className="text-[8px] text-white/80 drop-shadow">
                                  {stack.contents.length} soorten
                                </span>
                              </>
                            ) : (
                              <>
                                <Package className="h-4 w-4 text-white drop-shadow-md" />
                                <span className="text-[10px] font-bold text-white drop-shadow-md">
                                  {stack.totalHeight}/{maxHeight}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Height indicator in corner */}
                          {showHeights && maxHeight < (cell.maxStackHeight || 8) && (
                            <span className="absolute top-0.5 right-0.5 text-[8px] text-amber-400 font-bold drop-shadow">
                              {maxHeight}
                            </span>
                          )}
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <div className="space-y-1">
                          {stack.contents.map((content, i) => (
                            <div key={content.id || i} className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: content.color || '#888' }}
                              />
                              <span className="text-xs">
                                {content.variety}: {content.stackCount}
                              </span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-white/10 text-xs text-muted-foreground">
                            Totaal: {stack.totalHeight}/{maxHeight}
                          </div>
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
                          'aspect-square rounded-md relative',
                          'bg-white/5 border border-white/10 border-dashed',
                          assignmentMode
                            ? 'cursor-crosshair hover:bg-emerald-500/20 hover:border-emerald-500/50'
                            : 'cursor-pointer hover:bg-white/10 hover:border-emerald-500/30',
                          selected && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 bg-emerald-500/20 border-emerald-500/50',
                          editMode && 'hover:bg-red-500/20 hover:border-red-500/50',
                          (isDoorAdjacent || isEvapAdjacent) && 'bg-amber-500/5 border-amber-500/20'
                        )}
                        onClick={(e) => handleClick(e, rowIndex, colIndex)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {/* Max height indicator */}
                        <span className={cn(
                          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                          'text-[10px] font-medium',
                          maxHeight < (cell.maxStackHeight || 8)
                            ? 'text-amber-400'
                            : 'text-white/30'
                        )}>
                          {maxHeight}
                        </span>
                      </motion.div>
                    </TooltipTrigger>
                    {(isDoorAdjacent || isEvapAdjacent || assignmentMode) && (
                      <TooltipContent side="top">
                        <div className="text-xs">
                          <p>Max hoogte: {maxHeight}</p>
                          {isDoorAdjacent && <p className="text-amber-400">Bij deur</p>}
                          {isEvapAdjacent && <p className="text-cyan-400">Onder verdamper</p>}
                          {assignmentMode && <p className="text-emerald-400">Klik om toe te wijzen</p>}
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
