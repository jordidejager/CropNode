'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { MoreVertical, Settings, Trash2, RotateCw, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { StorageCellSummary } from '@/lib/types';
import { VARIETY_COLORS, getVarietyColor } from './storage-floor-plan';

interface ComplexCellPreviewProps {
  cell: StorageCellSummary;
  gridUnit?: number; // Size of one grid unit in pixels
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRotate?: () => void;
  onCopy?: () => void;
  isSelected?: boolean;
  editMode?: boolean;
}

export function ComplexCellPreview({
  cell,
  gridUnit = 40,
  onClick,
  onEdit,
  onDelete,
  onRotate,
  onCopy,
  isSelected = false,
  editMode = false,
}: ComplexCellPreviewProps) {
  // Calculate cell size in pixels based on rotation
  const rotation = cell.complexPosition?.rotation || 0;
  const isRotated = rotation === 90 || rotation === 270;
  const displayWidth = isRotated ? cell.depth : cell.width;
  const displayDepth = isRotated ? cell.width : cell.depth;

  // Scale factor to fit cells reasonably
  const scale = Math.min(gridUnit / 8, 6);
  const cellWidth = displayWidth * scale;
  const cellHeight = displayDepth * scale;

  // Get fill color based on percentage
  const getFillColor = (percentage: number) => {
    if (percentage >= 80) return 'from-emerald-500/40 to-emerald-600/40';
    if (percentage >= 50) return 'from-amber-500/40 to-amber-600/40';
    if (percentage > 0) return 'from-orange-500/40 to-orange-600/40';
    return 'from-slate-500/20 to-slate-600/20';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'inactive':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'cooling_down':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          className={cn(
            'relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all',
            'bg-gradient-to-br',
            getFillColor(cell.fillPercentage),
            isSelected
              ? 'border-emerald-500 ring-2 ring-emerald-500/50'
              : 'border-white/20 hover:border-white/40',
            editMode && 'cursor-move'
          )}
          style={{
            width: cellWidth,
            height: cellHeight,
            minWidth: 80,
            minHeight: 60,
          }}
          onClick={onClick}
          whileHover={{ scale: editMode ? 1 : 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Cell content */}
          <div className="absolute inset-0 p-1.5 flex flex-col">
            {/* Header with name and menu */}
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] font-semibold truncate leading-tight">
                {cell.name}
              </span>
              {editMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 -mt-0.5 -mr-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onCopy}>
                      <Copy className="h-4 w-4 mr-2" />
                      Kopiëren
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onRotate}>
                      <RotateCw className="h-4 w-4 mr-2" />
                      Roteren
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onEdit}>
                      <Settings className="h-4 w-4 mr-2" />
                      Bewerken
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Mini grid preview */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(cell.width, 8)}, 1fr)`,
                }}
              >
                {Array.from({ length: Math.min(cell.depth, 6) }).map((_, row) =>
                  Array.from({ length: Math.min(cell.width, 8) }).map((_, col) => {
                    // Simulate filled/empty based on fill percentage
                    const cellIndex = row * cell.width + col;
                    const threshold = Math.floor((cell.width * cell.depth * cell.fillPercentage) / 100);
                    const isFilled = cellIndex < threshold;

                    return (
                      <div
                        key={`${row}-${col}`}
                        className={cn(
                          'w-1.5 h-1.5 rounded-[1px]',
                          isFilled
                            ? getVarietyColor(cell.dominantVariety).bg
                            : 'bg-white/10'
                        )}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer with stats */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] text-muted-foreground">
                {cell.fillPercentage}%
              </span>
              <Badge
                variant="outline"
                className={cn('h-4 text-[8px] px-1', getStatusColor(cell.status))}
              >
                {cell.status === 'active' ? 'A' : cell.status === 'inactive' ? 'I' : 'O'}
              </Badge>
            </div>
          </div>

          {/* Door indicators */}
          {cell.doorPositions?.map((door, i) => {
            let positionStyle: React.CSSProperties = { position: 'absolute' };
            const doorSize = 4;

            switch (door.side) {
              case 'north':
                positionStyle = {
                  ...positionStyle,
                  top: 0,
                  left: `${(door.startCol / cell.width) * 100}%`,
                  width: `${((door.endCol - door.startCol + 1) / cell.width) * 100}%`,
                  height: doorSize,
                };
                break;
              case 'south':
                positionStyle = {
                  ...positionStyle,
                  bottom: 0,
                  left: `${(door.startCol / cell.width) * 100}%`,
                  width: `${((door.endCol - door.startCol + 1) / cell.width) * 100}%`,
                  height: doorSize,
                };
                break;
              case 'west':
                positionStyle = {
                  ...positionStyle,
                  left: 0,
                  top: `${(door.startCol / cell.depth) * 100}%`,
                  width: doorSize,
                  height: `${((door.endCol - door.startCol + 1) / cell.depth) * 100}%`,
                };
                break;
              case 'east':
                positionStyle = {
                  ...positionStyle,
                  right: 0,
                  top: `${(door.startCol / cell.depth) * 100}%`,
                  width: doorSize,
                  height: `${((door.endCol - door.startCol + 1) / cell.depth) * 100}%`,
                };
                break;
            }

            return (
              <div
                key={`door-${i}`}
                className="bg-amber-500"
                style={positionStyle}
              />
            );
          })}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="space-y-1">
          <p className="font-semibold">{cell.name}</p>
          <p className="text-xs">
            {cell.width} × {cell.depth} posities
          </p>
          <p className="text-xs">
            {cell.filledPositions}/{cell.totalPositions} gevuld ({cell.fillPercentage}%)
          </p>
          {cell.dominantVariety && (
            <p className="text-xs text-muted-foreground">
              Dominant: {cell.dominantVariety}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Capaciteit: {cell.totalCapacity} kisten
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
