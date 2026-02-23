'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Save, Loader2, Thermometer, Grid3X3, Edit2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useDefaultStorageComplex,
  useStorageCellsByComplex,
  useAddStorageCell,
  useDeleteStorageCell,
  useUpdateStorageCell,
} from '@/hooks/use-data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { StorageCell, StorageCellSummary, ComplexPosition } from '@/lib/types';
import { ComplexCanvas, GRID_SIZE } from './complex-canvas';
import { DraggableCell } from './draggable-cell';
import { CellWizard } from './cell-wizard';

// Types for drag state
interface DragState {
  cellId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originalPosition: ComplexPosition;
}

// Helper to check collision between two cells
function checkCollision(
  cell1: { x: number; y: number; width: number; depth: number; rotation: 0 | 90 | 180 | 270 },
  cell2: { x: number; y: number; width: number; depth: number; rotation: 0 | 90 | 180 | 270 }
): boolean {
  // Get actual dimensions based on rotation
  const w1 = cell1.rotation === 90 || cell1.rotation === 270 ? cell1.depth : cell1.width;
  const h1 = cell1.rotation === 90 || cell1.rotation === 270 ? cell1.width : cell1.depth;
  const w2 = cell2.rotation === 90 || cell2.rotation === 270 ? cell2.depth : cell2.width;
  const h2 = cell2.rotation === 90 || cell2.rotation === 270 ? cell2.width : cell2.depth;

  // Simple AABB collision check
  return !(
    cell1.x + w1 <= cell2.x ||
    cell2.x + w2 <= cell1.x ||
    cell1.y + h1 <= cell2.y ||
    cell2.y + h2 <= cell1.y
  );
}

// Helper to snap position to grid
function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

// Helper to calculate default position for new cells
function calculateDefaultPosition(cells: StorageCellSummary[]): ComplexPosition {
  if (cells.length === 0) {
    return { x: 1, y: 1, rotation: 0 };
  }

  // Find the rightmost edge of existing cells
  let maxRight = 0;
  let topRow = Infinity;

  cells.forEach((cell) => {
    const rotation = cell.complexPosition?.rotation || 0;
    const width = rotation === 90 || rotation === 270 ? cell.depth : cell.width;
    const x = cell.complexPosition?.x || 0;
    const y = cell.complexPosition?.y || 0;
    const right = x + width;

    if (right > maxRight) {
      maxRight = right;
    }
    if (y < topRow) {
      topRow = y;
    }
  });

  return { x: maxRight + 1, y: topRow === Infinity ? 1 : topRow, rotation: 0 };
}

export function ComplexOverview() {
  const router = useRouter();
  const { toast } = useToast();

  // Fetch default complex and its cells
  const { data: complex, isLoading: complexLoading } = useDefaultStorageComplex();
  const { data: cells, isLoading: cellsLoading } = useStorageCellsByComplex(complex?.id || '');

  // Mutations
  const addCellMutation = useAddStorageCell();
  const deleteCellMutation = useDeleteStorageCell();
  const updateCellMutation = useUpdateStorageCell();

  // UI State
  const [editMode, setEditMode] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [selectedCellId, setSelectedCellId] = React.useState<string | null>(null);

  // Drag state
  const [dragState, setDragState] = React.useState<DragState | null>(null);
  const [pendingPositions, setPendingPositions] = React.useState<Record<string, ComplexPosition>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const isLoading = complexLoading || cellsLoading;

  // Calculate total stats
  const totalStats = React.useMemo(() => {
    if (!cells) return { positions: 0, filled: 0, capacity: 0 };
    return cells.reduce(
      (acc, cell) => ({
        positions: acc.positions + cell.totalPositions,
        filled: acc.filled + cell.filledPositions,
        capacity: acc.capacity + cell.totalCapacity,
      }),
      { positions: 0, filled: 0, capacity: 0 }
    );
  }, [cells]);

  const fillPercentage = totalStats.positions > 0
    ? Math.round((totalStats.filled / totalStats.positions) * 100)
    : 0;

  // Get effective position for a cell (pending or stored)
  const getEffectivePosition = React.useCallback((cell: StorageCellSummary): ComplexPosition => {
    if (pendingPositions[cell.id]) {
      return pendingPositions[cell.id];
    }
    return cell.complexPosition || { x: 0, y: 0, rotation: 0 };
  }, [pendingPositions]);

  // Check for collisions with a cell at a given position
  const checkCollisions = React.useCallback((
    targetCellId: string,
    position: ComplexPosition,
    targetCell: StorageCellSummary
  ): boolean => {
    if (!cells) return false;

    const targetBounds = {
      x: position.x,
      y: position.y,
      width: targetCell.width,
      depth: targetCell.depth,
      rotation: position.rotation,
    };

    for (const cell of cells) {
      if (cell.id === targetCellId) continue;

      const cellPos = getEffectivePosition(cell);
      const cellBounds = {
        x: cellPos.x,
        y: cellPos.y,
        width: cell.width,
        depth: cell.depth,
        rotation: cellPos.rotation,
      };

      if (checkCollision(targetBounds, cellBounds)) {
        return true;
      }
    }

    return false;
  }, [cells, getEffectivePosition]);

  // Handle drag start
  const handleDragStart = React.useCallback((cellId: string, e: React.PointerEvent) => {
    const cell = cells?.find((c) => c.id === cellId);
    if (!cell) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const position = getEffectivePosition(cell);
    setDragState({
      cellId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalPosition: position,
    });
    setSelectedCellId(cellId);
  }, [cells, getEffectivePosition]);

  // Handle drag move
  const handleDragMove = React.useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    setDragState((prev) => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
  }, [dragState]);

  // Handle drag end
  const handleDragEnd = React.useCallback((e: React.PointerEvent) => {
    if (!dragState || !cells) return;

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const cell = cells.find((c) => c.id === dragState.cellId);
    if (!cell) {
      setDragState(null);
      return;
    }

    // Calculate new position in grid units
    const deltaX = (dragState.currentX - dragState.startX) / GRID_SIZE;
    const deltaY = (dragState.currentY - dragState.startY) / GRID_SIZE;

    const newPosition = snapToGrid(
      dragState.originalPosition.x + deltaX,
      dragState.originalPosition.y + deltaY
    );

    // Ensure position is not negative
    newPosition.x = Math.max(0, newPosition.x);
    newPosition.y = Math.max(0, newPosition.y);

    const finalPosition: ComplexPosition = {
      ...dragState.originalPosition,
      x: newPosition.x,
      y: newPosition.y,
    };

    // Check for collision at new position
    const hasCollision = checkCollisions(dragState.cellId, finalPosition, cell);

    if (hasCollision) {
      toast({
        title: 'Positie bezet',
        description: 'Deze cel overlapt met een andere cel. Kies een andere positie.',
        variant: 'destructive',
      });
      // Revert to original position
      setPendingPositions((prev) => ({
        ...prev,
        [dragState.cellId]: dragState.originalPosition,
      }));
    } else {
      // Apply new position
      setPendingPositions((prev) => ({
        ...prev,
        [dragState.cellId]: finalPosition,
      }));
      setHasUnsavedChanges(true);
    }

    setDragState(null);
  }, [dragState, cells, checkCollisions, toast]);

  // Get current position during drag
  const getDragPosition = React.useCallback((cellId: string): ComplexPosition | null => {
    if (!dragState || dragState.cellId !== cellId) return null;

    const deltaX = (dragState.currentX - dragState.startX) / GRID_SIZE;
    const deltaY = (dragState.currentY - dragState.startY) / GRID_SIZE;

    return {
      ...dragState.originalPosition,
      x: Math.max(0, dragState.originalPosition.x + deltaX),
      y: Math.max(0, dragState.originalPosition.y + deltaY),
    };
  }, [dragState]);

  // Handle cell click (navigate in view mode)
  const handleCellClick = (cell: StorageCellSummary) => {
    if (!editMode) {
      router.push(`/harvest-hub/cold-storage/${cell.id}`);
    } else {
      setSelectedCellId(cell.id);
    }
  };

  // Handle rotation
  const handleRotate = async (cell: StorageCellSummary) => {
    const currentPos = getEffectivePosition(cell);
    const newRotation = ((currentPos.rotation + 90) % 360) as 0 | 90 | 180 | 270;

    const newPosition: ComplexPosition = {
      ...currentPos,
      rotation: newRotation,
    };

    // Check for collision at new rotation
    const hasCollision = checkCollisions(cell.id, newPosition, cell);

    if (hasCollision) {
      toast({
        title: 'Rotatie niet mogelijk',
        description: 'De gedraaide cel zou overlappen met een andere cel.',
        variant: 'destructive',
      });
      return;
    }

    setPendingPositions((prev) => ({
      ...prev,
      [cell.id]: newPosition,
    }));
    setHasUnsavedChanges(true);
  };

  // Handle delete
  const handleDelete = async (cell: StorageCellSummary) => {
    if (!confirm(`Weet je zeker dat je "${cell.name}" wilt verwijderen?`)) return;

    try {
      await deleteCellMutation.mutateAsync(cell.id);
      toast({
        title: 'Cel verwijderd',
        description: `${cell.name} is verwijderd.`,
      });
      // Remove from pending positions
      setPendingPositions((prev) => {
        const newPositions = { ...prev };
        delete newPositions[cell.id];
        return newPositions;
      });
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon de cel niet verwijderen.',
        variant: 'destructive',
      });
    }
  };

  // Handle copy
  const handleCopy = async (cell: StorageCellSummary) => {
    const defaultPos = calculateDefaultPosition(cells || []);

    try {
      await addCellMutation.mutateAsync({
        name: `${cell.name} (kopie)`,
        width: cell.width,
        depth: cell.depth,
        blockedPositions: cell.blockedPositions,
        status: cell.status,
        maxStackHeight: cell.maxStackHeight,
        doorPositions: cell.doorPositions,
        evaporatorPositions: cell.evaporatorPositions,
        positionHeightOverrides: cell.positionHeightOverrides,
        complexId: cell.complexId,
        complexPosition: defaultPos,
      });
      toast({
        title: 'Cel gekopieerd',
        description: `Kopie van ${cell.name} is aangemaakt.`,
      });
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon de cel niet kopiëren.',
        variant: 'destructive',
      });
    }
  };

  // Save all pending changes
  const handleSaveLayout = async () => {
    if (!hasUnsavedChanges || Object.keys(pendingPositions).length === 0) return;

    setIsSaving(true);

    try {
      const updates = Object.entries(pendingPositions).map(([cellId, position]) =>
        updateCellMutation.mutateAsync({
          id: cellId,
          updates: { complexPosition: position },
        })
      );

      await Promise.all(updates);

      toast({
        title: 'Layout opgeslagen',
        description: 'De celposities zijn succesvol opgeslagen.',
      });

      setPendingPositions({});
      setHasUnsavedChanges(false);
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon de layout niet opslaan.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Discard changes
  const handleDiscardChanges = () => {
    setPendingPositions({});
    setHasUnsavedChanges(false);
  };

  // Handle wizard save
  const handleWizardSave = async (cellData: Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt' | 'blockedPositions'>) => {
    const defaultPos = calculateDefaultPosition(cells || []);

    try {
      await addCellMutation.mutateAsync({
        ...cellData,
        blockedPositions: [],
        complexPosition: cellData.complexPosition || defaultPos,
      });
      toast({
        title: 'Cel aangemaakt',
        description: `${cellData.name} is succesvol aangemaakt.`,
      });
      setWizardOpen(false);
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon de cel niet aanmaken.',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <CardTitle>Koelcomplex Overzicht</CardTitle>
          <CardDescription>Beheer je koelcellen en bewaarfaciliteiten.</CardDescription>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      </div>
    );
  }

  // Empty state
  if (!cells || cells.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Koelcomplex Overzicht</CardTitle>
            <CardDescription>
              {complex?.name || 'Hoofdlocatie'}
            </CardDescription>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/20 rounded-xl bg-white/5"
        >
          <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <Thermometer className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Geen koelcellen
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Je hebt nog geen koelcellen aangemaakt. Maak je eerste cel aan om te beginnen met het beheren van je opslag.
          </p>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Eerste cel aanmaken
          </Button>
        </motion.div>

        <CellWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onSave={handleWizardSave}
          complexId={complex?.id}
          isLoading={addCellMutation.isPending}
        />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {complex?.name || 'Koelcomplex'}
              <Badge variant="outline" className="ml-2">
                {cells.length} {cells.length === 1 ? 'cel' : 'cellen'}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-4 mt-1">
              <span>{totalStats.filled}/{totalStats.positions} posities ({fillPercentage}%)</span>
              <span>|</span>
              <span>Capaciteit: {totalStats.capacity} kisten</span>
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            {/* Unsaved changes indicator */}
            {hasUnsavedChanges && (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Niet-opgeslagen wijzigingen</span>
              </div>
            )}

            {/* Edit Mode Toggle */}
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
              <Label htmlFor="edit-mode" className="text-sm text-muted-foreground">
                {editMode ? (
                  <span className="flex items-center gap-1">
                    <Edit2 className="h-3.5 w-3.5" /> Bewerk
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Grid3X3 className="h-3.5 w-3.5" /> Overzicht
                  </span>
                )}
              </Label>
              <Switch
                id="edit-mode"
                checked={editMode}
                onCheckedChange={(checked) => {
                  if (!checked && hasUnsavedChanges) {
                    if (confirm('Je hebt niet-opgeslagen wijzigingen. Wil je deze verwerpen?')) {
                      handleDiscardChanges();
                      setEditMode(false);
                    }
                  } else {
                    setEditMode(checked);
                  }
                }}
              />
            </div>

            {/* Save button (edit mode) */}
            {editMode && hasUnsavedChanges && (
              <Button
                onClick={handleSaveLayout}
                disabled={isSaving}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Layout opslaan
              </Button>
            )}

            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe cel
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <ComplexCanvas editMode={editMode} className="h-[600px] border border-white/10">
          {cells.map((cell) => {
            const isDragging = dragState?.cellId === cell.id;
            const dragPos = getDragPosition(cell.id);

            // Calculate effective position (drag position or pending or stored)
            let effectivePosition = getEffectivePosition(cell);
            if (dragPos) {
              effectivePosition = {
                ...effectivePosition,
                x: dragPos.x,
                y: dragPos.y,
              };
            }

            // Check for collision at current position
            const hasCollision = isDragging && checkCollisions(cell.id, effectivePosition, cell);

            // Create a modified cell with the effective position
            const cellWithPosition: StorageCellSummary = {
              ...cell,
              complexPosition: effectivePosition,
            };

            return (
              <DraggableCell
                key={cell.id}
                cell={cellWithPosition}
                editMode={editMode}
                isSelected={selectedCellId === cell.id}
                isDragging={isDragging}
                hasCollision={hasCollision}
                onDragStart={(e) => handleDragStart(cell.id, e)}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onClick={() => handleCellClick(cell)}
                onRotate={() => handleRotate(cell)}
                onEdit={() => router.push(`/harvest-hub/cold-storage/${cell.id}`)}
                onDelete={() => handleDelete(cell)}
                onCopy={() => handleCopy(cell)}
              />
            );
          })}
        </ComplexCanvas>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground bg-slate-900/50 rounded-xl p-4 border border-white/5">
          {/* Status indicators */}
          <div className="flex items-center gap-4">
            <span className="text-slate-500 font-medium">Status:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <span>Actief</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
              <span>Inkoelen</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-slate-600" />
              <span>Niet actief</span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Fill indicators */}
          <div className="flex items-center gap-4">
            <span className="text-slate-500 font-medium">Vulgraad:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-emerald-500" />
              <span>80%+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-amber-500" />
              <span>50-80%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-orange-500" />
              <span>&lt;50%</span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Equipment indicators */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 bg-amber-500 rounded-sm shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
              <span>Deur</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 bg-cyan-500 rounded-sm shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
              <span>Verdamper</span>
            </div>
          </div>
        </div>

        {/* Cell Wizard */}
        <CellWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onSave={handleWizardSave}
          complexId={complex?.id}
          isLoading={addCellMutation.isPending}
        />
      </div>
    </TooltipProvider>
  );
}
