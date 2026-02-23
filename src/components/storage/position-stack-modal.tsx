'use client';

import * as React from 'react';
import { Minus, Plus, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PositionStack, CellSubParcel } from '@/lib/types';

interface StackLayer {
  id: string;
  cellSubParcelId: string;
  stackCount: number;
  stackOrder: number;
  variety?: string;
  color?: string;
}

interface PositionStackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { rowIndex: number; colIndex: number } | null;
  stack: PositionStack | null;
  maxHeight: number;
  cellSubParcels: CellSubParcel[];
  onUpdateLayer: (layerId: string, newCount: number) => Promise<void>;
  onDeleteLayer: (layerId: string) => Promise<void>;
  onAddLayer: (cellSubParcelId: string, stackCount: number) => Promise<void>;
  onClearPosition: () => Promise<void>;
}

export function PositionStackModal({
  open,
  onOpenChange,
  position,
  stack,
  maxHeight,
  cellSubParcels,
  onUpdateLayer,
  onDeleteLayer,
  onAddLayer,
  onClearPosition,
}: PositionStackModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pendingChanges, setPendingChanges] = React.useState<Map<string, number>>(new Map());
  const [newLayerSubParcelId, setNewLayerSubParcelId] = React.useState<string | null>(null);
  const [newLayerCount, setNewLayerCount] = React.useState(1);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setPendingChanges(new Map());
      setNewLayerSubParcelId(null);
      setNewLayerCount(1);
    }
  }, [open]);

  if (!position || !stack) return null;

  // Calculate total height with pending changes
  const currentTotal = stack.contents.reduce((sum, layer) => {
    const pending = pendingChanges.get(layer.id);
    return sum + (pending !== undefined ? pending : layer.stackCount);
  }, 0);

  const remainingCapacity = maxHeight - currentTotal;
  const newLayerMaxCount = Math.min(remainingCapacity, maxHeight);

  // Get sub-parcels not yet in this stack
  const usedSubParcelIds = new Set(stack.contents.map((c) => c.cellSubParcelId));
  const availableSubParcels = cellSubParcels.filter(
    (sp) => !usedSubParcelIds.has(sp.id)
  );

  const handleLayerCountChange = (layerId: string, delta: number) => {
    const layer = stack.contents.find((l) => l.id === layerId);
    if (!layer) return;

    const currentCount = pendingChanges.get(layerId) ?? layer.stackCount;
    const newCount = Math.max(0, Math.min(maxHeight, currentCount + delta));
    setPendingChanges((prev) => new Map(prev).set(layerId, newCount));
  };

  const handleSaveChanges = async () => {
    setIsSubmitting(true);
    try {
      // Process all pending changes
      for (const [layerId, newCount] of pendingChanges) {
        if (newCount === 0) {
          await onDeleteLayer(layerId);
        } else {
          const layer = stack.contents.find((l) => l.id === layerId);
          if (layer && layer.stackCount !== newCount) {
            await onUpdateLayer(layerId, newCount);
          }
        }
      }

      // Add new layer if specified
      if (newLayerSubParcelId && newLayerCount > 0) {
        await onAddLayer(newLayerSubParcelId, newLayerCount);
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    try {
      await onClearPosition();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-400" />
            Positie {position.rowIndex + 1}, {position.colIndex + 1}
          </DialogTitle>
          <DialogDescription>
            {stack.isMixed
              ? 'Deze positie bevat meerdere subpercelen (gemengde stapel).'
              : 'Beheer de inhoud van deze positie.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stack visualization */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Stapel</span>
              <span className="font-medium">
                {currentTotal} / {maxHeight} kisten
              </span>
            </div>

            {/* Visual stack representation */}
            <div className="relative h-32 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
              <div className="absolute inset-0 flex flex-col-reverse">
                {stack.contents.map((layer) => {
                  const count = pendingChanges.get(layer.id) ?? layer.stackCount;
                  const heightPercent = (count / maxHeight) * 100;

                  return (
                    <div
                      key={layer.id}
                      className="transition-all duration-200 flex items-center justify-center text-xs font-medium text-white"
                      style={{
                        backgroundColor: layer.color || '#888',
                        height: `${heightPercent}%`,
                        minHeight: count > 0 ? '20px' : '0',
                      }}
                    >
                      {count > 0 && (
                        <>
                          {layer.variety}: {count}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Layer controls */}
          <div className="space-y-3">
            <Label>Lagen</Label>
            {stack.contents.map((layer, index) => {
              const count = pendingChanges.get(layer.id) ?? layer.stackCount;

              return (
                <div
                  key={layer.id}
                  className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                >
                  {/* Color indicator */}
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/20"
                    style={{ backgroundColor: layer.color || '#888' }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {layer.variety}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Laag {index + 1} (van onder)
                    </div>
                  </div>

                  {/* Count controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleLayerCountChange(layer.id, -1)}
                      disabled={count <= 0}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={maxHeight}
                      value={count}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setPendingChanges((prev) =>
                          new Map(prev).set(layer.id, Math.max(0, Math.min(maxHeight, val)))
                        );
                      }}
                      className="w-14 h-7 text-center"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleLayerCountChange(layer.id, 1)}
                      disabled={remainingCapacity <= 0}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-400 hover:text-red-300"
                    onClick={() => {
                      setPendingChanges((prev) => new Map(prev).set(layer.id, 0));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Add new layer */}
          {availableSubParcels.length > 0 && remainingCapacity > 0 && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              <Label>Nieuwe laag toevoegen</Label>
              <div className="flex items-center gap-2">
                <select
                  className={cn(
                    'flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                  )}
                  value={newLayerSubParcelId || ''}
                  onChange={(e) => setNewLayerSubParcelId(e.target.value || null)}
                >
                  <option value="">Selecteer subperceel...</option>
                  {availableSubParcels.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.variety}
                      {sp.subParcelName && ` (${sp.subParcelName})`}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={1}
                  max={newLayerMaxCount}
                  value={newLayerCount}
                  onChange={(e) => setNewLayerCount(parseInt(e.target.value) || 1)}
                  className="w-16 h-9"
                  placeholder="Aantal"
                  disabled={!newLayerSubParcelId}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={isSubmitting || stack.contents.length === 0}
            className="sm:mr-auto"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Positie leegmaken
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuleren
          </Button>
          <Button onClick={handleSaveChanges} disabled={isSubmitting}>
            {isSubmitting ? 'Opslaan...' : 'Opslaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
