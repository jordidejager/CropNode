'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Settings,
  Lock,
  Unlock,
  Loader2,
  Thermometer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useStorageCell,
  useStoragePositions,
  useUpdateStorageCell,
  useUpsertStoragePosition,
  useClearStoragePosition,
  useParcels,
  // New hooks for sub-parcel system
  useCellSubParcels,
  useCreateCellSubParcel,
  useUpdateCellSubParcel,
  useDeleteCellSubParcel,
  usePositionStacks,
  useAddPositionContent,
  useUpdatePositionContent,
  useDeletePositionContent,
  useClearPositionContents,
  useAssignSubParcelToPositions,
  useFillRowWithSubParcel,
  useFillColumnWithSubParcel,
  useFillAllEmptyPositions,
} from '@/hooks/use-data';
import {
  StorageFloorPlan,
  StoragePositionModal,
  StorageLegend,
  CellWizard,
} from '@/components/storage';
import { SubParcelSidebar } from '@/components/storage/sub-parcel-sidebar';
import { SubParcelAddModal } from '@/components/storage/sub-parcel-add-modal';
import { AssignmentToolbar } from '@/components/storage/assignment-toolbar';
import { StorageFloorPlanV2 } from '@/components/storage/storage-floor-plan-v2';
import { PositionStackModal } from '@/components/storage/position-stack-modal';
import type { StorageCell, StoragePosition, BlockedPosition, QualityClass, CellSubParcel, PositionStack, CellSubParcelInput, PickNumber } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function CellDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const cellId = params.id as string;

  // Data fetching
  const { data: cell, isLoading: cellLoading, isError: cellError } = useStorageCell(cellId);
  const { data: positions, isLoading: positionsLoading } = useStoragePositions(cellId);
  const { data: parcels } = useParcels();

  // New data fetching for sub-parcel system
  const { data: cellSubParcels, isLoading: subParcelsLoading } = useCellSubParcels(cellId);
  const { data: positionStacksData } = usePositionStacks(cellId, cell || null);

  // Mutations
  const updateCellMutation = useUpdateStorageCell();
  const upsertPositionMutation = useUpsertStoragePosition();
  const clearPositionMutation = useClearStoragePosition();

  // New mutations for sub-parcel system
  const createSubParcelMutation = useCreateCellSubParcel();
  const updateSubParcelMutation = useUpdateCellSubParcel();
  const deleteSubParcelMutation = useDeleteCellSubParcel();
  const addPositionContentMutation = useAddPositionContent();
  const updatePositionContentMutation = useUpdatePositionContent();
  const deletePositionContentMutation = useDeletePositionContent();
  const clearPositionContentsMutation = useClearPositionContents();
  const assignSubParcelMutation = useAssignSubParcelToPositions();
  const fillRowMutation = useFillRowWithSubParcel();
  const fillColumnMutation = useFillColumnWithSubParcel();
  const fillAllEmptyMutation = useFillAllEmptyPositions();

  // UI State
  const [editMode, setEditMode] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [positionModalOpen, setPositionModalOpen] = React.useState(false);
  const [selectedPosition, setSelectedPosition] = React.useState<{
    row: number;
    col: number;
    data?: StoragePosition;
  } | null>(null);

  // New UI State for sub-parcel system
  const [useNewSystem, setUseNewSystem] = React.useState(true); // Toggle between old and new system
  const [selectedSubParcelId, setSelectedSubParcelId] = React.useState<string | null>(null);
  const [selectedPositions, setSelectedPositions] = React.useState<Array<{ rowIndex: number; colIndex: number }>>([]);
  const [subParcelModalOpen, setSubParcelModalOpen] = React.useState(false);
  const [editingSubParcel, setEditingSubParcel] = React.useState<CellSubParcel | null>(null);
  const [stackModalOpen, setStackModalOpen] = React.useState(false);
  const [selectedStackPosition, setSelectedStackPosition] = React.useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [assignmentCount, setAssignmentCount] = React.useState<number>(1);
  const [showAssignmentDialog, setShowAssignmentDialog] = React.useState(false);
  const [pendingAssignmentPosition, setPendingAssignmentPosition] = React.useState<{ rowIndex: number; colIndex: number } | null>(null);
  const [quickFillMode, setQuickFillMode] = React.useState(false); // Multi-select mode for bulk assignment

  // Convert position stacks array to Map for efficient lookup
  const positionStacksMap = React.useMemo(() => {
    const map = new Map<string, PositionStack>();
    if (positionStacksData) {
      positionStacksData.forEach((stack) => {
        map.set(`${stack.rowIndex}-${stack.colIndex}`, stack);
      });
    }
    return map;
  }, [positionStacksData]);

  // Get selected sub-parcel object
  const selectedSubParcel = React.useMemo(() => {
    if (!selectedSubParcelId || !cellSubParcels) return null;
    return cellSubParcels.find((sp) => sp.id === selectedSubParcelId) || null;
  }, [selectedSubParcelId, cellSubParcels]);

  // Get used colors in this cell
  const usedColors = React.useMemo(() => {
    if (!cellSubParcels) return [];
    return cellSubParcels.map((sp) => sp.color);
  }, [cellSubParcels]);

  // Compute available varieties from parcels
  const varieties = React.useMemo(() => {
    if (!parcels) return [];
    const uniqueVarieties = new Set<string>();
    parcels.forEach((p) => {
      if (p.variety) uniqueVarieties.add(p.variety);
    });
    return Array.from(uniqueVarieties).sort();
  }, [parcels]);

  // Compute parcel options for the modal
  const parcelOptions = React.useMemo(() => {
    if (!parcels) return [];
    return parcels.map((p) => ({
      id: p.id,
      name: p.name,
      variety: p.variety || '',
    }));
  }, [parcels]);

  // Compute active varieties in the cell for the legend
  const activeVarieties = React.useMemo(() => {
    if (!positions) return [];
    const uniqueVarieties = new Set<string>();
    positions.forEach((p) => {
      if (p.variety) uniqueVarieties.add(p.variety);
    });
    return Array.from(uniqueVarieties);
  }, [positions]);

  // ========== Old System Handlers ==========

  // Handle position click (old system)
  const handlePositionClick = (row: number, col: number, position?: StoragePosition) => {
    setSelectedPosition({ row, col, data: position });
    setPositionModalOpen(true);
  };

  // Handle block toggle in edit mode
  const handleBlockToggle = async (row: number, col: number) => {
    if (!cell) return;

    const isCurrentlyBlocked = cell.blockedPositions.some(
      (bp) => bp.row === row && bp.col === col
    );

    let newBlockedPositions: BlockedPosition[];
    if (isCurrentlyBlocked) {
      newBlockedPositions = cell.blockedPositions.filter(
        (bp) => !(bp.row === row && bp.col === col)
      );
    } else {
      newBlockedPositions = [...cell.blockedPositions, { row, col }];
    }

    try {
      await updateCellMutation.mutateAsync({
        id: cellId,
        updates: { blockedPositions: newBlockedPositions },
      });
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon de geblokkeerde positie niet bijwerken.',
        variant: 'destructive',
      });
    }
  };

  // Handle position save (old system)
  const handleSavePosition = async (data: {
    variety: string | null;
    subParcelId: string | null;
    dateStored: Date | null;
    quantity: number;
    qualityClass: QualityClass | null;
    notes: string | null;
  }) => {
    if (!selectedPosition) return;

    try {
      await upsertPositionMutation.mutateAsync({
        cellId,
        rowIndex: selectedPosition.row,
        colIndex: selectedPosition.col,
        variety: data.variety,
        subParcelId: data.subParcelId,
        dateStored: data.dateStored,
        quantity: data.quantity,
        qualityClass: data.qualityClass,
        notes: data.notes,
      });
      toast({
        title: 'Positie opgeslagen',
        description: 'De kistgegevens zijn succesvol opgeslagen.',
      });
      setPositionModalOpen(false);
      setSelectedPosition(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon de positie niet opslaan.',
        variant: 'destructive',
      });
    }
  };

  // Handle position clear (old system)
  const handleClearPosition = async () => {
    if (!selectedPosition) return;

    try {
      await clearPositionMutation.mutateAsync({
        cellId,
        rowIndex: selectedPosition.row,
        colIndex: selectedPosition.col,
      });
      toast({
        title: 'Positie geleegd',
        description: 'De kistgegevens zijn verwijderd.',
      });
      setPositionModalOpen(false);
      setSelectedPosition(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon de positie niet legen.',
        variant: 'destructive',
      });
    }
  };

  // ========== New System Handlers ==========

  // Handle sub-parcel add/edit
  const handleSubParcelSubmit = async (data: {
    parcelId: string | null;
    subParcelId: string | null;
    variety: string;
    color: string;
    pickDate: Date;
    pickNumber: PickNumber;
    notes: string | null;
    harvestRegistrationId: string | null;
  }) => {
    try {
      if (editingSubParcel) {
        await updateSubParcelMutation.mutateAsync({
          id: editingSubParcel.id,
          updates: {
            parcelId: data.parcelId,
            subParcelId: data.subParcelId,
            variety: data.variety,
            color: data.color,
            pickDate: data.pickDate,
            pickNumber: data.pickNumber,
            notes: data.notes,
            harvestRegistrationId: data.harvestRegistrationId,
          },
        });
        toast({ title: 'Partij bijgewerkt' });
      } else {
        await createSubParcelMutation.mutateAsync({
          cellId,
          parcelId: data.parcelId,
          subParcelId: data.subParcelId,
          variety: data.variety,
          color: data.color,
          pickDate: data.pickDate,
          pickNumber: data.pickNumber,
          notes: data.notes,
          harvestRegistrationId: data.harvestRegistrationId,
        });
        toast({ title: 'Partij toegevoegd' });
      }
      setEditingSubParcel(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon partij niet opslaan.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Handle sub-parcel delete
  const handleDeleteSubParcel = async (subParcel: CellSubParcel) => {
    try {
      await deleteSubParcelMutation.mutateAsync({ id: subParcel.id, cellId });
      toast({ title: 'Subperceel verwijderd' });
      if (selectedSubParcelId === subParcel.id) {
        setSelectedSubParcelId(null);
      }
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon subperceel niet verwijderen.',
        variant: 'destructive',
      });
    }
  };

  // Handle position click in new system
  const handlePositionClickV2 = (row: number, col: number, stack?: PositionStack) => {
    if (editMode) {
      handleBlockToggle(row, col);
      return;
    }

    // If in quick fill mode with a sub-parcel selected, toggle position selection
    if (quickFillMode && selectedSubParcelId) {
      // Only allow selecting empty positions
      if (!stack || stack.totalHeight === 0) {
        const exists = selectedPositions.some((p) => p.rowIndex === row && p.colIndex === col);
        if (exists) {
          setSelectedPositions((prev) => prev.filter((p) => !(p.rowIndex === row && p.colIndex === col)));
        } else {
          setSelectedPositions((prev) => [...prev, { rowIndex: row, colIndex: col }]);
        }
      } else {
        // If clicking on a filled position, open stack modal
        setSelectedStackPosition({ rowIndex: row, colIndex: col });
        setStackModalOpen(true);
      }
      return;
    }

    // If in assignment mode and a sub-parcel is selected (normal mode)
    if (selectedSubParcelId) {
      // If position is empty, show assignment dialog
      if (!stack || stack.totalHeight === 0) {
        setPendingAssignmentPosition({ rowIndex: row, colIndex: col });
        setAssignmentCount(cell?.maxStackHeight || 8);
        setShowAssignmentDialog(true);
      } else {
        // Position has content, open stack modal
        setSelectedStackPosition({ rowIndex: row, colIndex: col });
        setStackModalOpen(true);
      }
    } else {
      // No sub-parcel selected, just view the stack
      if (stack && stack.totalHeight > 0) {
        setSelectedStackPosition({ rowIndex: row, colIndex: col });
        setStackModalOpen(true);
      }
    }
  };

  // Handle shift+click for multi-select
  const handlePositionShiftClick = (row: number, col: number) => {
    const key = `${row}-${col}`;
    const exists = selectedPositions.some((p) => p.rowIndex === row && p.colIndex === col);

    if (exists) {
      setSelectedPositions((prev) => prev.filter((p) => !(p.rowIndex === row && p.colIndex === col)));
    } else {
      setSelectedPositions((prev) => [...prev, { rowIndex: row, colIndex: col }]);
    }
  };

  // Handle assignment confirmation
  const handleConfirmAssignment = async () => {
    if (!pendingAssignmentPosition || !selectedSubParcelId) return;

    try {
      await addPositionContentMutation.mutateAsync({
        cellId,
        rowIndex: pendingAssignmentPosition.rowIndex,
        colIndex: pendingAssignmentPosition.colIndex,
        cellSubParcelId: selectedSubParcelId,
        stackCount: assignmentCount,
        stackOrder: 1, // Add at bottom of stack
      });
      toast({ title: 'Positie toegewezen' });
      setShowAssignmentDialog(false);
      setPendingAssignmentPosition(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon positie niet toewijzen.',
        variant: 'destructive',
      });
    }
  };

  // Handle fill row
  const handleFillRow = async (rowIndex: number) => {
    if (!selectedSubParcelId || !cell) return;

    try {
      await fillRowMutation.mutateAsync({
        cellId,
        cellSubParcelId: selectedSubParcelId,
        rowIndex,
        stackCount: cell.maxStackHeight || 8,
        cell,
      });
      toast({ title: `Rij ${rowIndex + 1} gevuld` });
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon rij niet vullen.',
        variant: 'destructive',
      });
    }
  };

  // Handle fill column
  const handleFillColumn = async (colIndex: number) => {
    if (!selectedSubParcelId || !cell) return;

    try {
      await fillColumnMutation.mutateAsync({
        cellId,
        cellSubParcelId: selectedSubParcelId,
        colIndex,
        stackCount: cell.maxStackHeight || 8,
        cell,
      });
      toast({ title: `Kolom ${colIndex + 1} gevuld` });
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon kolom niet vullen.',
        variant: 'destructive',
      });
    }
  };

  // Handle fill all empty
  const handleFillAllEmpty = async () => {
    if (!selectedSubParcelId || !cell) return;

    try {
      await fillAllEmptyMutation.mutateAsync({
        cellId,
        cellSubParcelId: selectedSubParcelId,
        stackCount: cell.maxStackHeight || 8,
        cell,
      });
      toast({ title: 'Alle lege posities gevuld' });
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon posities niet vullen.',
        variant: 'destructive',
      });
    }
  };

  // Handle bulk fill selected positions with full stacks
  const handleFillSelectedPositions = async () => {
    if (!selectedSubParcelId || !cell || selectedPositions.length === 0) return;

    try {
      for (const pos of selectedPositions) {
        // Check if position is blocked
        const isBlocked = cell.blockedPositions?.some(
          (bp) => bp.row === pos.rowIndex && bp.col === pos.colIndex
        );
        if (isBlocked) continue;

        // Calculate max height for this position (accounting for doors/evaporators)
        let maxHeight = cell.maxStackHeight || 8;
        const key = `${pos.rowIndex}-${pos.colIndex}`;
        if (cell.positionHeightOverrides?.[key] !== undefined) {
          maxHeight = cell.positionHeightOverrides[key];
        }

        // Check if position already has content
        const existingStack = positionStacksMap.get(key);
        if (existingStack && existingStack.totalHeight > 0) continue;

        await addPositionContentMutation.mutateAsync({
          cellId,
          rowIndex: pos.rowIndex,
          colIndex: pos.colIndex,
          cellSubParcelId: selectedSubParcelId,
          stackCount: maxHeight,
          stackOrder: 1,
        });
      }
      toast({ title: `${selectedPositions.length} posities gevuld` });
      setSelectedPositions([]);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon posities niet vullen.',
        variant: 'destructive',
      });
    }
  };

  // Handle clear selected positions
  const handleClearSelectedPositions = async () => {
    try {
      for (const pos of selectedPositions) {
        await clearPositionContentsMutation.mutateAsync({
          cellId,
          rowIndex: pos.rowIndex,
          colIndex: pos.colIndex,
        });
      }
      toast({ title: 'Selectie geleegd' });
      setSelectedPositions([]);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon posities niet legen.',
        variant: 'destructive',
      });
    }
  };

  // Position stack modal handlers
  const handleUpdateLayer = async (layerId: string, newCount: number) => {
    await updatePositionContentMutation.mutateAsync({
      id: layerId,
      updates: { stackCount: newCount },
    });
  };

  const handleDeleteLayer = async (layerId: string) => {
    await deletePositionContentMutation.mutateAsync({ id: layerId, cellId });
  };

  const handleAddLayer = async (cellSubParcelId: string, stackCount: number) => {
    if (!selectedStackPosition) return;
    const stack = positionStacksMap.get(`${selectedStackPosition.rowIndex}-${selectedStackPosition.colIndex}`);
    const nextOrder = (stack?.contents.length || 0) + 1;

    await addPositionContentMutation.mutateAsync({
      cellId,
      rowIndex: selectedStackPosition.rowIndex,
      colIndex: selectedStackPosition.colIndex,
      cellSubParcelId,
      stackCount,
      stackOrder: nextOrder,
    });
  };

  const handleClearStackPosition = async () => {
    if (!selectedStackPosition) return;
    await clearPositionContentsMutation.mutateAsync({
      cellId,
      rowIndex: selectedStackPosition.rowIndex,
      colIndex: selectedStackPosition.colIndex,
    });
  };

  // Handle settings save (from wizard)
  const handleSaveSettings = async (data: Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt' | 'blockedPositions'>) => {
    try {
      await updateCellMutation.mutateAsync({
        id: cellId,
        updates: {
          name: data.name,
          width: data.width,
          depth: data.depth,
          status: data.status,
          maxStackHeight: data.maxStackHeight,
          doorPositions: data.doorPositions,
          evaporatorPositions: data.evaporatorPositions,
          positionHeightOverrides: data.positionHeightOverrides,
          complexPosition: data.complexPosition,
        },
      });
      toast({
        title: 'Instellingen opgeslagen',
        description: 'De celinstellingen zijn bijgewerkt.',
      });
      setSettingsOpen(false);
    } catch (error) {
      toast({
        title: 'Fout',
        description: 'Kon de instellingen niet opslaan.',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (cellLoading || positionsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <CardTitle>Laden...</CardTitle>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      </div>
    );
  }

  // Error state
  if (cellError || !cell) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <CardTitle>Cel niet gevonden</CardTitle>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Thermometer className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            Deze koelcel kon niet worden gevonden.
          </p>
          <Button onClick={() => router.push('/harvest-hub/cold-storage')}>
            Terug naar overzicht
          </Button>
        </div>
      </div>
    );
  }

  // Calculate totals from new system
  const totalCratesNew = cellSubParcels?.reduce((sum, sp) => sum + (sp.totalCrates || 0), 0) || 0;
  const filledPositionsNew = new Set(Array.from(positionStacksMap.keys())).size;

  // Old system stats
  const filledCount = positions?.length || 0;
  const blockedCount = cell.blockedPositions.length;
  const totalPositions = cell.width * cell.depth - blockedCount;
  const fillPercentage = totalPositions > 0 ? Math.round((filledCount / totalPositions) * 100) : 0;

  // Max capacity
  const maxCapacity = totalPositions * (cell.maxStackHeight || 8);
  const fillPercentageNew = maxCapacity > 0 ? Math.round((totalCratesNew / maxCapacity) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/harvest-hub/cold-storage')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              {cell.name}
              <Badge
                variant="outline"
                className={cn(
                  cell.status === 'active' && 'border-emerald-500/50 text-emerald-400',
                  cell.status === 'inactive' && 'border-gray-500/50 text-gray-400',
                  cell.status === 'cooling_down' && 'border-amber-500/50 text-amber-400'
                )}
              >
                {cell.status === 'active' ? 'Actief' : cell.status === 'inactive' ? 'Inactief' : 'Inkoelen'}
              </Badge>
            </CardTitle>
            <CardDescription>
              {cell.width} x {cell.depth} posities | {useNewSystem ? `${totalCratesNew} kisten (${fillPercentageNew}%)` : `${filledCount}/${totalPositions} gevuld (${fillPercentage}%)`}
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* System Toggle */}
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <Label htmlFor="system-toggle" className="text-sm text-muted-foreground">
              {useNewSystem ? 'Nieuw systeem' : 'Oud systeem'}
            </Label>
            <Switch
              id="system-toggle"
              checked={useNewSystem}
              onCheckedChange={(checked) => {
                setUseNewSystem(checked);
                setSelectedSubParcelId(null);
                setSelectedPositions([]);
              }}
            />
          </div>

          {/* Edit Mode Toggle */}
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <Label htmlFor="edit-mode" className="text-sm text-muted-foreground">
              {editMode ? (
                <span className="flex items-center gap-1">
                  <Unlock className="h-3.5 w-3.5" /> Bewerk
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Bekijk
                </span>
              )}
            </Label>
            <Switch
              id="edit-mode"
              checked={editMode}
              onCheckedChange={setEditMode}
            />
          </div>

          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Edit Mode Info */}
      {editMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4"
        >
          <p className="text-sm text-amber-200">
            <strong>Bewerk modus actief:</strong> Klik op een positie om deze te blokkeren (bijv. voor pilaren of deuren).
            Geblokkeerde posities kunnen niet worden gebruikt voor opslag.
          </p>
        </motion.div>
      )}

      {/* Assignment Toolbar (when sub-parcel selected) */}
      {useNewSystem && selectedSubParcel && !editMode && (
        <AssignmentToolbar
          selectedSubParcel={selectedSubParcel}
          selectedPositions={selectedPositions}
          quickFillMode={quickFillMode}
          onQuickFillModeChange={setQuickFillMode}
          onClearSelection={() => setSelectedPositions([])}
          onDone={() => {
            setSelectedSubParcelId(null);
            setSelectedPositions([]);
            setQuickFillMode(false);
          }}
          onFillRow={handleFillRow}
          onFillColumn={handleFillColumn}
          onFillAllEmpty={handleFillAllEmpty}
          onFillSelectedPositions={handleFillSelectedPositions}
          onClearPositions={handleClearSelectedPositions}
        />
      )}

      {/* Main Content */}
      <div className={cn(
        'grid gap-6',
        useNewSystem ? 'lg:grid-cols-[280px_1fr]' : ''
      )}>
        {/* Sub-parcel Sidebar (new system only) */}
        {useNewSystem && (
          <SubParcelSidebar
            cellSubParcels={cellSubParcels || []}
            selectedSubParcelId={selectedSubParcelId}
            onSelectSubParcel={setSelectedSubParcelId}
            onAddSubParcel={() => {
              setEditingSubParcel(null);
              setSubParcelModalOpen(true);
            }}
            onEditSubParcel={(sp) => {
              setEditingSubParcel(sp);
              setSubParcelModalOpen(true);
            }}
            onDeleteSubParcel={handleDeleteSubParcel}
            isLoading={subParcelsLoading}
            className="lg:max-h-[calc(100vh-300px)]"
          />
        )}

        {/* Floor Plan */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          {useNewSystem ? (
            <StorageFloorPlanV2
              cell={cell}
              positionStacks={positionStacksMap}
              editMode={editMode}
              assignmentMode={!!selectedSubParcelId}
              selectedPositions={selectedPositions}
              onPositionClick={handlePositionClickV2}
              onPositionShiftClick={handlePositionShiftClick}
              onBlockToggle={handleBlockToggle}
              showHeights
            />
          ) : (
            <StorageFloorPlan
              cell={cell}
              positions={positions || []}
              editMode={editMode}
              onPositionClick={handlePositionClick}
              onBlockToggle={handleBlockToggle}
              selectedPosition={selectedPosition ? { row: selectedPosition.row, col: selectedPosition.col } : null}
            />
          )}
        </div>
      </div>

      {/* Legend (old system only) */}
      {!useNewSystem && <StorageLegend activeVarieties={activeVarieties} />}

      {/* Position Modal (old system) */}
      <StoragePositionModal
        open={positionModalOpen}
        onOpenChange={setPositionModalOpen}
        position={selectedPosition?.data}
        rowIndex={selectedPosition?.row || 0}
        colIndex={selectedPosition?.col || 0}
        varieties={varieties}
        parcels={parcelOptions}
        onSave={handleSavePosition}
        onClear={handleClearPosition}
        isLoading={upsertPositionMutation.isPending || clearPositionMutation.isPending}
      />

      {/* Sub-parcel Add/Edit Modal (new system) */}
      <SubParcelAddModal
        open={subParcelModalOpen}
        onOpenChange={(open) => {
          setSubParcelModalOpen(open);
          if (!open) setEditingSubParcel(null);
        }}
        cellId={cellId}
        existingSubParcel={editingSubParcel || undefined}
        usedColors={usedColors}
        onSubmit={handleSubParcelSubmit}
      />

      {/* Position Stack Modal (new system) */}
      <PositionStackModal
        open={stackModalOpen}
        onOpenChange={setStackModalOpen}
        position={selectedStackPosition}
        stack={selectedStackPosition ? positionStacksMap.get(`${selectedStackPosition.rowIndex}-${selectedStackPosition.colIndex}`) || null : null}
        maxHeight={cell.maxStackHeight || 8}
        cellSubParcels={cellSubParcels || []}
        onUpdateLayer={handleUpdateLayer}
        onDeleteLayer={handleDeleteLayer}
        onAddLayer={handleAddLayer}
        onClearPosition={handleClearStackPosition}
      />

      {/* Assignment Count Dialog */}
      <Dialog open={showAssignmentDialog} onOpenChange={setShowAssignmentDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Hoeveel kisten?</DialogTitle>
            <DialogDescription>
              Geef aan hoeveel kisten je wilt plaatsen op deze positie.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="number"
              min={1}
              max={cell.maxStackHeight || 8}
              value={assignmentCount}
              onChange={(e) => setAssignmentCount(parseInt(e.target.value) || 1)}
              className="text-center text-lg"
            />
            <p className="text-xs text-muted-foreground text-center mt-2">
              Max: {cell.maxStackHeight || 8}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignmentDialog(false)}>
              Annuleren
            </Button>
            <Button onClick={handleConfirmAssignment}>
              Toewijzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Wizard */}
      <CellWizard
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        editCell={cell}
        onSave={handleSaveSettings}
        isLoading={updateCellMutation.isPending}
        complexId={cell.complexId || undefined}
      />
    </div>
  );
}
