'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { CellSide, DoorPosition } from '@/lib/types';
import type { CellWizardData } from './index';

interface StepDoorProps {
  data: CellWizardData;
  onChange: (updates: Partial<CellWizardData>) => void;
}

const SIDE_LABELS: Record<CellSide, string> = {
  north: 'Noord (boven)',
  south: 'Zuid (onder)',
  east: 'Oost (rechts)',
  west: 'West (links)',
};

export function StepDoor({ data, onChange }: StepDoorProps) {
  const [selectedSide, setSelectedSide] = React.useState<CellSide | null>(null);
  const [doorStart, setDoorStart] = React.useState(0);
  const [doorEnd, setDoorEnd] = React.useState(2);

  const maxCol = (side: CellSide) => {
    return side === 'north' || side === 'south' ? data.width : data.depth;
  };

  const handleAddDoor = () => {
    if (!selectedSide) return;

    const newDoor: DoorPosition = {
      side: selectedSide,
      startCol: doorStart,
      endCol: doorEnd,
    };

    onChange({
      doorPositions: [...data.doorPositions, newDoor],
    });

    // Reset selection
    setSelectedSide(null);
    setDoorStart(0);
    setDoorEnd(2);
  };

  const handleRemoveDoor = (index: number) => {
    const newDoors = data.doorPositions.filter((_, i) => i !== index);
    onChange({ doorPositions: newDoors });
  };

  const getDoorStyle = (door: DoorPosition) => {
    const { width, depth } = data;
    const cellSize = 24;
    const gap = 2;

    switch (door.side) {
      case 'north':
        return {
          top: -8,
          left: door.startCol * (cellSize + gap),
          width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
          height: 6,
        };
      case 'south':
        return {
          bottom: -8,
          left: door.startCol * (cellSize + gap),
          width: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
          height: 6,
        };
      case 'west':
        return {
          left: -8,
          top: door.startCol * (cellSize + gap),
          width: 6,
          height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
        };
      case 'east':
        return {
          right: -8,
          top: door.startCol * (cellSize + gap),
          width: 6,
          height: (door.endCol - door.startCol + 1) * (cellSize + gap) - gap,
        };
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Deurposities</h3>
        <p className="text-sm text-muted-foreground">
          Klik op een zijde om een deur te plaatsen. Posities bij deuren krijgen een lagere stapelhoogte.
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
                ? 'border-amber-500 bg-amber-500/20'
                : 'border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10'
            )}
          />

          {/* South side button */}
          <button
            onClick={() => setSelectedSide('south')}
            className={cn(
              'absolute -bottom-2 left-8 right-8 h-6 rounded-b-lg border-2 border-dashed transition-colors',
              selectedSide === 'south'
                ? 'border-amber-500 bg-amber-500/20'
                : 'border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10'
            )}
          />

          {/* West side button */}
          <button
            onClick={() => setSelectedSide('west')}
            className={cn(
              'absolute top-8 bottom-8 -left-2 w-6 rounded-l-lg border-2 border-dashed transition-colors',
              selectedSide === 'west'
                ? 'border-amber-500 bg-amber-500/20'
                : 'border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10'
            )}
          />

          {/* East side button */}
          <button
            onClick={() => setSelectedSide('east')}
            className={cn(
              'absolute top-8 bottom-8 -right-2 w-6 rounded-r-lg border-2 border-dashed transition-colors',
              selectedSide === 'east'
                ? 'border-amber-500 bg-amber-500/20'
                : 'border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10'
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

            {/* Existing doors */}
            {data.doorPositions.map((door, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute bg-amber-500 rounded-sm"
                style={getDoorStyle(door)}
              />
            ))}
          </div>
        </div>

        {/* Door configuration when side is selected */}
        {selectedSide && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md p-4 bg-white/5 rounded-lg space-y-4"
          >
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-amber-500" />
                Deur op {SIDE_LABELS[selectedSide]}
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSide(null)}
              >
                Annuleren
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Positie: {doorStart} - {doorEnd}</Label>
              <Slider
                value={[doorStart, doorEnd]}
                onValueChange={([start, end]) => {
                  setDoorStart(start);
                  setDoorEnd(end);
                }}
                min={0}
                max={maxCol(selectedSide) - 1}
                step={1}
                className="py-2"
              />
              <p className="text-xs text-muted-foreground">
                Deur overspant {doorEnd - doorStart + 1} positie(s)
              </p>
            </div>

            <Button onClick={handleAddDoor} className="w-full">
              <DoorOpen className="h-4 w-4 mr-2" />
              Deur toevoegen
            </Button>
          </motion.div>
        )}

        {/* List of added doors */}
        {data.doorPositions.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            <Label>Toegevoegde deuren ({data.doorPositions.length})</Label>
            {data.doorPositions.map((door, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">
                    {SIDE_LABELS[door.side]}: positie {door.startCol}-{door.endCol}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleRemoveDoor(i)}
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {data.doorPositions.length === 0 && !selectedSide && (
          <p className="text-sm text-muted-foreground text-center">
            Klik op een zijde van de cel om een deur toe te voegen.
            <br />
            Je kunt deze stap ook overslaan.
          </p>
        )}
      </div>
    </div>
  );
}
