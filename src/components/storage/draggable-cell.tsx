'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { RotateCw, Snowflake, DoorOpen, MoreVertical, Settings, Trash2, Copy, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { StorageCellSummary, StorageCellStatus } from '@/lib/types';
import { GRID_SIZE } from './complex-canvas';
import { getVarietyColor } from './storage-floor-plan';

// Size thresholds for responsive content
const SIZE_SMALL = 100;   // Only show name
const SIZE_MEDIUM = 160;  // Show name, status, fill stats
const SIZE_LARGE = 240;   // Show everything including varieties

// Status configuration
const STATUS_CONFIG: Record<StorageCellStatus, {
  label: string;
  borderColor: string;
  glowColor: string;
  bgGradient: string;
  textColor: string;
  animate?: boolean;
}> = {
  active: {
    label: 'Actief',
    borderColor: 'border-emerald-500/70',
    glowColor: 'shadow-emerald-500/30',
    bgGradient: 'from-slate-800/90 via-slate-850/95 to-slate-900/90',
    textColor: 'text-emerald-400',
  },
  cooling_down: {
    label: 'Inkoelen',
    borderColor: 'border-amber-500/70',
    glowColor: 'shadow-amber-500/30',
    bgGradient: 'from-slate-800/90 via-amber-950/20 to-slate-900/90',
    textColor: 'text-amber-400',
    animate: true,
  },
  inactive: {
    label: 'Niet actief',
    borderColor: 'border-slate-600/50',
    glowColor: 'shadow-slate-500/10',
    bgGradient: 'from-slate-800/60 via-slate-850/60 to-slate-900/60',
    textColor: 'text-slate-500',
  },
};

interface DraggableCellProps {
  cell: StorageCellSummary;
  editMode: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  hasCollision?: boolean;
  onDragStart?: (e: React.PointerEvent) => void;
  onDragMove?: (e: React.PointerEvent) => void;
  onDragEnd?: (e: React.PointerEvent) => void;
  onClick?: () => void;
  onRotate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
}

export function DraggableCell({
  cell,
  editMode,
  isSelected = false,
  isDragging = false,
  hasCollision = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  onRotate,
  onEdit,
  onDelete,
  onCopy,
}: DraggableCellProps) {
  // Get rotation from complex position
  const rotation = cell.complexPosition?.rotation || 0;
  const isRotated = rotation === 90 || rotation === 270;

  // Calculate display dimensions based on rotation
  const displayWidth = isRotated ? cell.depth : cell.width;
  const displayDepth = isRotated ? cell.width : cell.depth;

  // Calculate pixel dimensions (each grid position = GRID_SIZE pixels)
  const cellWidthPx = displayWidth * GRID_SIZE;
  const cellHeightPx = displayDepth * GRID_SIZE;

  // Calculate position in pixels
  const posX = (cell.complexPosition?.x || 0) * GRID_SIZE;
  const posY = (cell.complexPosition?.y || 0) * GRID_SIZE;

  // Determine size category for responsive content
  const minDimension = Math.min(cellWidthPx, cellHeightPx);
  const sizeCategory = minDimension >= SIZE_LARGE ? 'large' : minDimension >= SIZE_MEDIUM ? 'medium' : 'small';

  // Get status configuration
  const statusConfig = STATUS_CONFIG[cell.status] || STATUS_CONFIG.inactive;

  // Calculate fill percentage for progress bar
  const fillRatio = cell.totalCapacity > 0 ? cell.totalCrates / cell.totalCapacity : 0;

  // Calculate font sizes based on cell size - MUCH larger for prominence
  // Use the larger dimension to determine readable size
  const maxDimension = Math.max(cellWidthPx, cellHeightPx);
  const nameFontSize = maxDimension >= 200 ? 'text-4xl' : maxDimension >= 150 ? 'text-3xl' : maxDimension >= 100 ? 'text-2xl' : 'text-xl';
  const statusFontSize = sizeCategory === 'large' ? 'text-base' : 'text-sm';
  const statsFontSize = sizeCategory === 'large' ? 'text-base' : 'text-sm';

  // Transform door/evaporator positions based on rotation
  const transformSide = (side: 'north' | 'south' | 'east' | 'west'): 'north' | 'south' | 'east' | 'west' => {
    const rotations: Record<number, Record<string, string>> = {
      0: { north: 'north', south: 'south', east: 'east', west: 'west' },
      90: { north: 'east', south: 'west', east: 'south', west: 'north' },
      180: { north: 'south', south: 'north', east: 'west', west: 'east' },
      270: { north: 'west', south: 'east', east: 'north', west: 'south' },
    };
    return rotations[rotation][side] as 'north' | 'south' | 'east' | 'west';
  };

  // Render door indicators on edges (outside cell content)
  const renderDoors = () => {
    if (!cell.doorPositions || cell.doorPositions.length === 0) return null;

    return cell.doorPositions.map((door, i) => {
      const transformedSide = transformSide(door.side);
      const doorWidth = (door.endCol - door.startCol + 1) * GRID_SIZE;
      const doorOffset = door.startCol * GRID_SIZE;

      let style: React.CSSProperties = { position: 'absolute' };
      const doorThickness = 10;

      const maxForSide = (door.side === 'north' || door.side === 'south') ? cell.width : cell.depth;
      const displayMax = (transformedSide === 'north' || transformedSide === 'south') ? displayWidth : displayDepth;
      const scale = displayMax / maxForSide;
      const scaledWidth = doorWidth * scale;
      const scaledOffset = doorOffset * scale;

      switch (transformedSide) {
        case 'north':
          style = { ...style, top: -doorThickness - 2, left: scaledOffset, width: scaledWidth, height: doorThickness };
          break;
        case 'south':
          style = { ...style, bottom: -doorThickness - 2, left: scaledOffset, width: scaledWidth, height: doorThickness };
          break;
        case 'west':
          style = { ...style, left: -doorThickness - 2, top: scaledOffset, width: doorThickness, height: scaledWidth };
          break;
        case 'east':
          style = { ...style, right: -doorThickness - 2, top: scaledOffset, width: doorThickness, height: scaledWidth };
          break;
      }

      return (
        <Tooltip key={`door-${i}`}>
          <TooltipTrigger asChild>
            <div
              className="bg-amber-500 rounded-sm flex items-center justify-center z-10 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              style={style}
            >
              {scaledWidth > 24 && (
                <DoorOpen className="h-4 w-4 text-amber-900" style={{ transform: `rotate(${-rotation}deg)` }} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Deur</TooltipContent>
        </Tooltip>
      );
    });
  };

  // Render evaporator indicators on edges (outside cell content)
  const renderEvaporators = () => {
    if (!cell.evaporatorPositions || cell.evaporatorPositions.length === 0) return null;

    return cell.evaporatorPositions.map((evap, i) => {
      const transformedSide = transformSide(evap.side);
      const evapWidth = (evap.endCol - evap.startCol + 1) * GRID_SIZE;
      const evapOffset = evap.startCol * GRID_SIZE;

      let style: React.CSSProperties = { position: 'absolute' };
      const evapThickness = 12;

      const maxForSide = (evap.side === 'north' || evap.side === 'south') ? cell.width : cell.depth;
      const displayMax = (transformedSide === 'north' || transformedSide === 'south') ? displayWidth : displayDepth;
      const scale = displayMax / maxForSide;
      const scaledWidth = evapWidth * scale;
      const scaledOffset = evapOffset * scale;

      switch (transformedSide) {
        case 'north':
          style = { ...style, top: -evapThickness - 2, left: scaledOffset, width: scaledWidth, height: evapThickness };
          break;
        case 'south':
          style = { ...style, bottom: -evapThickness - 2, left: scaledOffset, width: scaledWidth, height: evapThickness };
          break;
        case 'west':
          style = { ...style, left: -evapThickness - 2, top: scaledOffset, width: evapThickness, height: scaledWidth };
          break;
        case 'east':
          style = { ...style, right: -evapThickness - 2, top: scaledOffset, width: evapThickness, height: scaledWidth };
          break;
      }

      return (
        <Tooltip key={`evap-${i}`}>
          <TooltipTrigger asChild>
            <div
              className="bg-cyan-500 rounded-sm flex items-center justify-center z-10 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
              style={style}
            >
              {scaledWidth > 24 && (
                <Snowflake className="h-4 w-4 text-cyan-900" style={{ transform: `rotate(${-rotation}deg)` }} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Verdamper</TooltipContent>
        </Tooltip>
      );
    });
  };

  // Render variety list for large cells
  const renderVarietyList = () => {
    const varieties = cell.varietyCounts || [];
    if (varieties.length === 0 || sizeCategory === 'small') {
      return null;
    }

    const maxToShow = sizeCategory === 'large' ? 4 : 2;
    const visibleVarieties = varieties.slice(0, maxToShow);
    const remainingCount = varieties.length - maxToShow;

    return (
      <div className="space-y-0.5 mt-2">
        {visibleVarieties.map((v, i) => {
          const color = getVarietyColor(v.variety);
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs justify-center">
              <div
                className={cn('w-2 h-2 rounded-full flex-shrink-0', color.bg)}
              />
              <span className="text-slate-300 truncate">
                <span className="font-medium text-white">{v.count}</span>
                <span className="text-slate-400"> × </span>
                {v.variety}
              </span>
            </div>
          );
        })}
        {remainingCount > 0 && (
          <div className="text-[10px] text-slate-500 text-center">+{remainingCount} meer</div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      className={cn(
        'absolute rounded-xl border-2 overflow-visible cursor-pointer',
        'bg-gradient-to-br backdrop-blur-sm',
        statusConfig.bgGradient,
        statusConfig.borderColor,
        // Glow effect based on status
        cell.status === 'active' && 'shadow-[0_0_20px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]',
        cell.status === 'cooling_down' && 'shadow-[0_0_20px_rgba(245,158,11,0.25),inset_0_1px_0_rgba(255,255,255,0.05)]',
        cell.status === 'inactive' && 'shadow-[0_0_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.02)] opacity-70',
        // Selection and interaction states
        isSelected && 'ring-2 ring-white/50 ring-offset-2 ring-offset-slate-950',
        isDragging && 'opacity-90 shadow-2xl z-50',
        hasCollision && 'ring-2 ring-red-500 ring-offset-2 ring-offset-slate-950',
        editMode && !isDragging && 'hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all duration-200'
      )}
      style={{
        width: cellWidthPx,
        height: cellHeightPx,
        left: posX,
        top: posY,
        touchAction: 'none',
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: cell.status === 'inactive' ? 0.7 : 1,
        scale: isDragging ? 1.02 : 1,
        boxShadow: isDragging ? '0 25px 50px -12px rgba(0,0,0,0.5)' : undefined,
      }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => {
        if (editMode && onDragStart) {
          e.preventDefault();
          onDragStart(e);
        }
      }}
      onPointerMove={(e) => {
        if (editMode && isDragging && onDragMove) {
          onDragMove(e);
        }
      }}
      onPointerUp={(e) => {
        if (editMode && onDragEnd) {
          onDragEnd(e);
        }
      }}
      onClick={(e) => {
        if (!editMode && onClick) {
          onClick();
        }
      }}
    >
      {/* Cooling animation overlay */}
      {cell.status === 'cooling_down' && statusConfig.animate && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-amber-500/50 pointer-events-none"
          animate={{
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.005, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Top bar: capacity + controls */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between z-10">
        {/* Grip handle in edit mode */}
        {editMode && (
          <div className="flex items-center gap-1">
            <GripVertical className="h-4 w-4 text-slate-500 cursor-grab" />
          </div>
        )}
        {!editMode && <div />}

        {/* Capacity indicator + menu */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-400 font-medium">
            max {cell.totalCapacity}
          </span>
          {editMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRotate?.(); }}>
                  <RotateCw className="h-4 w-4 mr-2" />
                  Roteren (90°)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopy?.(); }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Kopiëren
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
                  <Settings className="h-4 w-4 mr-2" />
                  Bewerken
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                  className="text-red-500 focus:text-red-500"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* CENTERED CONTENT - Always horizontal, never rotated */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 py-6 overflow-hidden">
        {/* Cell name - VERY LARGE, BOLD, and always horizontal */}
        <h3
          className={cn(
            nameFontSize,
            'font-black text-white text-center leading-none tracking-tight',
            'drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]',
            'uppercase'
          )}
        >
          {cell.name}
        </h3>

        {/* Status label - always horizontal */}
        {sizeCategory !== 'small' && (
          <span
            className={cn(statusFontSize, 'font-semibold mt-1', statusConfig.textColor, 'drop-shadow-md')}
          >
            {statusConfig.label}
          </span>
        )}

        {/* Fill stats - always horizontal */}
        {sizeCategory !== 'small' && (
          <div className="mt-2 text-center">
            <div className={cn(statsFontSize, 'text-white font-bold drop-shadow-md')}>
              {cell.totalCrates}/{cell.totalCapacity}
            </div>
            <div className={cn(
              'text-sm font-bold',
              fillRatio >= 0.8 ? 'text-emerald-400' :
              fillRatio >= 0.5 ? 'text-amber-400' :
              fillRatio > 0 ? 'text-orange-400' :
              'text-slate-500'
            )}>
              {Math.round(fillRatio * 100)}%
            </div>
          </div>
        )}

        {/* Variety list (large cells only) - always horizontal */}
        {sizeCategory === 'large' && renderVarietyList()}
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-2 left-2 right-2">
        <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              cell.status === 'active' && 'bg-gradient-to-r from-emerald-500 to-emerald-400',
              cell.status === 'cooling_down' && 'bg-gradient-to-r from-amber-500 to-amber-400',
              cell.status === 'inactive' && 'bg-slate-600'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(fillRatio * 100, 100)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Door indicators (on edges, outside content) */}
      {renderDoors()}

      {/* Evaporator indicators (on edges, outside content) */}
      {renderEvaporators()}

      {/* Quick rotate button (edit mode, hover) */}
      {editMode && !isDragging && (
        <motion.button
          className={cn(
            'absolute -bottom-3 -right-3 w-7 h-7 rounded-full',
            'bg-slate-800 border border-slate-600 flex items-center justify-center',
            'opacity-0 hover:opacity-100 transition-opacity z-20',
            'hover:bg-emerald-600 hover:border-emerald-500 hover:shadow-[0_0_10px_rgba(16,185,129,0.5)]'
          )}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onRotate?.();
          }}
          title="Roteren (90°)"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </motion.button>
      )}

      {/* Collision warning */}
      {hasCollision && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded whitespace-nowrap shadow-lg z-30">
          Overlapt met andere cel
        </div>
      )}

      {/* Hover tooltip for small cells */}
      {sizeCategory === 'small' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute inset-0" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <div className="space-y-1">
              <p className="font-semibold">{cell.name}</p>
              <p className={cn('text-xs', statusConfig.textColor)}>{statusConfig.label}</p>
              <p className="text-xs text-muted-foreground">
                {cell.totalCrates}/{cell.totalCapacity} kisten ({Math.round(fillRatio * 100)}%)
              </p>
              {cell.varietyCounts && cell.varietyCounts.length > 0 && (
                <div className="text-xs">
                  {cell.varietyCounts.slice(0, 3).map((v, i) => (
                    <div key={i}>{v.count} × {v.variety}</div>
                  ))}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </motion.div>
  );
}
