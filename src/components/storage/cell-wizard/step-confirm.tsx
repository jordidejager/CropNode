'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Maximize2,
  ArrowUpDown,
  DoorOpen,
  Wind,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CellWizardData } from './index';

interface StepConfirmProps {
  data: CellWizardData;
  isEditing?: boolean;
}

export function StepConfirm({ data, isEditing = false }: StepConfirmProps) {
  // Calculate total capacity accounting for height overrides
  const calculateTotalCapacity = (): number => {
    let total = 0;
    for (let row = 0; row < data.depth; row++) {
      for (let col = 0; col < data.width; col++) {
        const key = `${row}-${col}`;
        if (data.positionHeightOverrides[key] !== undefined) {
          total += data.positionHeightOverrides[key];
        } else {
          // Check for auto-reduction
          let reduction = 0;

          // Check doors
          for (const door of data.doorPositions) {
            if (isAdjacentToDoor(row, col, door)) {
              reduction = Math.max(reduction, 2);
            }
          }

          // Check evaporators
          for (const evap of data.evaporatorPositions) {
            if (isUnderEvaporator(row, col, evap)) {
              reduction = Math.max(reduction, 2);
            }
          }

          total += data.maxStackHeight - reduction;
        }
      }
    }
    return total;
  };

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

  const totalPositions = data.width * data.depth;
  const totalCapacity = calculateTotalCapacity();
  const standardCapacity = totalPositions * data.maxStackHeight;
  const overrideCount = Object.keys(data.positionHeightOverrides).length;

  const SIDE_LABELS: Record<string, string> = {
    north: 'Noord',
    south: 'Zuid',
    east: 'Oost',
    west: 'West',
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Overzicht en bevestiging</h3>
        <p className="text-sm text-muted-foreground">
          {isEditing
            ? 'Controleer de gewijzigde instellingen voordat je opslaat.'
            : 'Controleer de instellingen voordat je de koelcel aanmaakt.'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Name & Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h4 className="font-medium">Naam</h4>
          </div>
          <p className="text-lg font-semibold">{data.name || 'Geen naam'}</p>
        </motion.div>

        {/* Dimensions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <Maximize2 className="h-5 w-5 text-blue-500" />
            <h4 className="font-medium">Afmetingen</h4>
          </div>
          <p className="text-lg font-semibold">
            {data.width} × {data.depth}
          </p>
          <p className="text-sm text-muted-foreground">{totalPositions} posities</p>
        </motion.div>

        {/* Stack Height */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpDown className="h-5 w-5 text-purple-500" />
            <h4 className="font-medium">Stapelhoogte</h4>
          </div>
          <p className="text-lg font-semibold">{data.maxStackHeight} kisten</p>
          {overrideCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {overrideCount} handmatige aanpassingen
            </p>
          )}
        </motion.div>

        {/* Total Capacity */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-5 w-5 text-emerald-500" />
            <h4 className="font-medium">Totale capaciteit</h4>
          </div>
          <p className="text-lg font-semibold text-emerald-500">{totalCapacity} kisten</p>
          {totalCapacity < standardCapacity && (
            <p className="text-sm text-muted-foreground">
              {standardCapacity - totalCapacity} minder door deuren/verdampers
            </p>
          )}
        </motion.div>
      </div>

      {/* Doors and Evaporators */}
      <div className="grid grid-cols-2 gap-4">
        {/* Doors */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-3">
            <DoorOpen className="h-5 w-5 text-amber-500" />
            <h4 className="font-medium">Deuren ({data.doorPositions.length})</h4>
          </div>
          {data.doorPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen deuren geplaatst</p>
          ) : (
            <ul className="space-y-1">
              {data.doorPositions.map((door, i) => (
                <li key={i} className="text-sm">
                  {SIDE_LABELS[door.side]}: {door.startCol}-{door.endCol}
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Evaporators */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="p-4 bg-white/5 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-3">
            <Wind className="h-5 w-5 text-cyan-500" />
            <h4 className="font-medium">Verdampers ({data.evaporatorPositions.length})</h4>
          </div>
          {data.evaporatorPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen verdampers geplaatst</p>
          ) : (
            <ul className="space-y-1">
              {data.evaporatorPositions.map((evap, i) => (
                <li key={i} className="text-sm">
                  {SIDE_LABELS[evap.side]}: {evap.startCol}-{evap.endCol}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      {/* Mini preview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col items-center p-4 bg-white/5 rounded-lg"
      >
        <h4 className="font-medium mb-3">Voorvertoning</h4>
        <div className="relative">
          {/* Grid */}
          <div
            className="grid gap-0.5 p-2 bg-slate-900/50 rounded-lg border border-white/10"
            style={{
              gridTemplateColumns: `repeat(${Math.min(data.width, 12)}, 20px)`,
            }}
          >
            {Array.from({ length: Math.min(data.depth, 8) }).map((_, row) =>
              Array.from({ length: Math.min(data.width, 12) }).map((_, col) => {
                // Check if affected by door/evaporator
                let isAffected = false;
                for (const door of data.doorPositions) {
                  if (isAdjacentToDoor(row, col, door)) isAffected = true;
                }
                for (const evap of data.evaporatorPositions) {
                  if (isUnderEvaporator(row, col, evap)) isAffected = true;
                }

                return (
                  <div
                    key={`${row}-${col}`}
                    className={cn(
                      'w-5 h-5 rounded-sm border',
                      isAffected
                        ? 'bg-amber-500/30 border-amber-500/50'
                        : 'bg-emerald-500/30 border-emerald-500/50'
                    )}
                  />
                );
              })
            )}
          </div>

          {/* Door indicators */}
          {data.doorPositions.map((door, i) => {
            const cellSize = 20;
            const gap = 2;
            let style: React.CSSProperties = { position: 'absolute' };

            switch (door.side) {
              case 'north':
                style = {
                  ...style,
                  top: -4,
                  left: 8 + door.startCol * (cellSize + gap),
                  width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                  height: 4,
                };
                break;
              case 'south':
                style = {
                  ...style,
                  bottom: -4,
                  left: 8 + door.startCol * (cellSize + gap),
                  width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                  height: 4,
                };
                break;
              case 'west':
                style = {
                  ...style,
                  left: -4,
                  top: 8 + door.startCol * (cellSize + gap),
                  width: 4,
                  height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
              case 'east':
                style = {
                  ...style,
                  right: -4,
                  top: 8 + door.startCol * (cellSize + gap),
                  width: 4,
                  height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
            }

            return <div key={`door-${i}`} className="bg-amber-500 rounded-sm" style={style} />;
          })}

          {/* Evaporator indicators */}
          {data.evaporatorPositions.map((evap, i) => {
            const cellSize = 20;
            const gap = 2;
            let style: React.CSSProperties = { position: 'absolute' };

            switch (evap.side) {
              case 'north':
                style = {
                  ...style,
                  top: -6,
                  left: 8 + evap.startCol * (cellSize + gap),
                  width: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                  height: 6,
                };
                break;
              case 'south':
                style = {
                  ...style,
                  bottom: -6,
                  left: 8 + evap.startCol * (cellSize + gap),
                  width: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                  height: 6,
                };
                break;
              case 'west':
                style = {
                  ...style,
                  left: -6,
                  top: 8 + evap.startCol * (cellSize + gap),
                  width: 6,
                  height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
              case 'east':
                style = {
                  ...style,
                  right: -6,
                  top: 8 + evap.startCol * (cellSize + gap),
                  width: 6,
                  height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
                };
                break;
            }

            return <div key={`evap-${i}`} className="bg-cyan-500 rounded-sm" style={style} />;
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-500/50 rounded-sm" />
            <span>Normaal</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500/30 border border-amber-500/50 rounded-sm" />
            <span>Verlaagd</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500 rounded-sm" />
            <span>Deur</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-cyan-500 rounded-sm" />
            <span>Verdamper</span>
          </div>
        </div>
      </motion.div>

      <p className="text-center text-sm text-muted-foreground">
        {isEditing
          ? 'Klik op "Wijzigingen opslaan" om de aanpassingen door te voeren.'
          : 'Klik op "Cel aanmaken" om de koelcel toe te voegen aan het complex.'}
      </p>
    </div>
  );
}
