'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Wind, Trash2, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { CellSide, EvaporatorPosition } from '@/lib/types';
import type { CellWizardData } from './index';

interface StepEvaporatorProps {
  data: CellWizardData;
  onChange: (updates: Partial<CellWizardData>) => void;
}

const SIDE_LABELS: Record<CellSide, string> = {
  north: 'Noord (boven)',
  south: 'Zuid (onder)',
  east: 'Oost (rechts)',
  west: 'West (links)',
};

export function StepEvaporator({ data, onChange }: StepEvaporatorProps) {
  const [selectedSide, setSelectedSide] = React.useState<CellSide | null>(null);
  const [evapStart, setEvapStart] = React.useState(0);
  const [evapEnd, setEvapEnd] = React.useState(3);

  const maxCol = (side: CellSide) => {
    return side === 'north' || side === 'south' ? data.width : data.depth;
  };

  const handleAddEvaporator = () => {
    if (!selectedSide) return;

    const newEvaporator: EvaporatorPosition = {
      side: selectedSide,
      startCol: evapStart,
      endCol: evapEnd,
    };

    onChange({
      evaporatorPositions: [...data.evaporatorPositions, newEvaporator],
    });

    // Reset selection
    setSelectedSide(null);
    setEvapStart(0);
    setEvapEnd(3);
  };

  const handleRemoveEvaporator = (index: number) => {
    const newEvaps = data.evaporatorPositions.filter((_, i) => i !== index);
    onChange({ evaporatorPositions: newEvaps });
  };

  const getEvaporatorStyle = (evap: EvaporatorPosition) => {
    const cellSize = 24;
    const gap = 2;

    switch (evap.side) {
      case 'north':
        return {
          top: -10,
          left: evap.startCol * (cellSize + gap),
          width: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
          height: 8,
        };
      case 'south':
        return {
          bottom: -10,
          left: evap.startCol * (cellSize + gap),
          width: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
          height: 8,
        };
      case 'west':
        return {
          left: -10,
          top: evap.startCol * (cellSize + gap),
          width: 8,
          height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
        };
      case 'east':
        return {
          right: -10,
          top: evap.startCol * (cellSize + gap),
          width: 8,
          height: (evap.endCol - evap.startCol + 1) * (cellSize + gap) - gap,
        };
    }
  };

  // Check if side already has a door
  const hasDoorOnSide = (side: CellSide) => {
    return data.doorPositions.some((d) => d.side === side);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Verdamperposities</h3>
        <p className="text-sm text-muted-foreground">
          Plaats verdampers (koelelementen) aan de wanden. Posities direct onder verdampers krijgen een lagere stapelhoogte.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6">
        {/* Interactive grid with clickable sides */}
        <div className="relative p-8">
          {/* North side button */}
          <button
            onClick={() => setSelectedSide('north')}
            className={cn(
              'absolute -top-2 left-8 right-8 h-6 rounded-t-lg border-2 border-dashed transition-colors',
              selectedSide === 'north'
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/10'
            )}
          />

          {/* South side button */}
          <button
            onClick={() => setSelectedSide('south')}
            className={cn(
              'absolute -bottom-2 left-8 right-8 h-6 rounded-b-lg border-2 border-dashed transition-colors',
              selectedSide === 'south'
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/10'
            )}
          />

          {/* West side button */}
          <button
            onClick={() => setSelectedSide('west')}
            className={cn(
              'absolute top-8 bottom-8 -left-2 w-6 rounded-l-lg border-2 border-dashed transition-colors',
              selectedSide === 'west'
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/10'
            )}
          />

          {/* East side button */}
          <button
            onClick={() => setSelectedSide('east')}
            className={cn(
              'absolute top-8 bottom-8 -right-2 w-6 rounded-r-lg border-2 border-dashed transition-colors',
              selectedSide === 'east'
                ? 'border-cyan-500 bg-cyan-500/20'
                : 'border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/10'
            )}
          />

          {/* Grid */}
          <div
            className="relative grid gap-0.5 p-2 bg-slate-900/50 rounded-lg border border-white/10"
            style={{
              gridTemplateColumns: `repeat(${Math.min(data.width, 12)}, 24px)`,
            }}
          >
            {Array.from({ length: Math.min(data.depth, 8) }).map((_, row) =>
              Array.from({ length: Math.min(data.width, 12) }).map((_, col) => (
                <div
                  key={`${row}-${col}`}
                  className="w-6 h-6 rounded-sm bg-white/10 border border-white/5"
                />
              ))
            )}

            {/* Existing doors (for reference) */}
            {data.doorPositions.map((door, i) => {
              const cellSize = 24;
              const gap = 2;
              let style: React.CSSProperties = {};

              switch (door.side) {
                case 'north':
                  style = {
                    position: 'absolute',
                    top: -8,
                    left: door.startCol * (cellSize + gap),
                    width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                    height: 6,
                  };
                  break;
                case 'south':
                  style = {
                    position: 'absolute',
                    bottom: -8,
                    left: door.startCol * (cellSize + gap),
                    width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                    height: 6,
                  };
                  break;
                case 'west':
                  style = {
                    position: 'absolute',
                    left: -8,
                    top: door.startCol * (cellSize + gap),
                    width: 6,
                    height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                  };
                  break;
                case 'east':
                  style = {
                    position: 'absolute',
                    right: -8,
                    top: door.startCol * (cellSize + gap),
                    width: 6,
                    height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
                  };
                  break;
              }

              return (
                <div
                  key={`door-${i}`}
                  className="bg-amber-500/50 rounded-sm"
                  style={style}
                />
              );
            })}

            {/* Existing evaporators */}
            {data.evaporatorPositions.map((evap, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute bg-cyan-500 rounded-sm flex items-center justify-center"
                style={getEvaporatorStyle(evap)}
              >
                <Snowflake className="h-3 w-3 text-white" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Evaporator configuration when side is selected */}
        {selectedSide && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md p-4 bg-white/5 rounded-lg space-y-4"
          >
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-cyan-500" />
                Verdamper op {SIDE_LABELS[selectedSide]}
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSide(null)}
              >
                Annuleren
              </Button>
            </div>

            {hasDoorOnSide(selectedSide) && (
              <p className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded">
                Let op: deze zijde heeft al een deur
              </p>
            )}

            <div className="space-y-2">
              <Label>Positie: {evapStart} - {evapEnd}</Label>
              <Slider
                value={[evapStart, evapEnd]}
                onValueChange={([start, end]) => {
                  setEvapStart(start);
                  setEvapEnd(end);
                }}
                min={0}
                max={maxCol(selectedSide) - 1}
                step={1}
                className="py-2"
              />
              <p className="text-xs text-muted-foreground">
                Verdamper overspant {evapEnd - evapStart + 1} positie(s)
              </p>
            </div>

            <Button onClick={handleAddEvaporator} className="w-full bg-cyan-600 hover:bg-cyan-700">
              <Wind className="h-4 w-4 mr-2" />
              Verdamper toevoegen
            </Button>
          </motion.div>
        )}

        {/* List of added evaporators */}
        {data.evaporatorPositions.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            <Label>Toegevoegde verdampers ({data.evaporatorPositions.length})</Label>
            {data.evaporatorPositions.map((evap, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Wind className="h-4 w-4 text-cyan-500" />
                  <span className="text-sm">
                    {SIDE_LABELS[evap.side]}: positie {evap.startCol}-{evap.endCol}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemoveEvaporator(i)}
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {data.evaporatorPositions.length === 0 && !selectedSide && (
          <p className="text-sm text-muted-foreground text-center">
            Klik op een zijde van de cel om een verdamper toe te voegen.
            <br />
            Je kunt deze stap ook overslaan.
          </p>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500 rounded-sm" />
            <span>Deur</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-cyan-500 rounded-sm" />
            <span>Verdamper</span>
          </div>
        </div>
      </div>
    </div>
  );
}
