'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  StorageCell,
  DoorPosition,
  EvaporatorPosition,
  ComplexPosition,
  PositionHeightOverrides,
  StorageCellStatus,
} from '@/lib/types';
import { StepBasics } from './step-basics';
import { StepDoor } from './step-door';
import { StepEvaporator } from './step-evaporator';
import { StepHeights } from './step-heights';
import { StepConfirm } from './step-confirm';

// Wizard state type
export type CellWizardData = {
  name: string;
  width: number;
  depth: number;
  maxStackHeight: number;
  doorPositions: DoorPosition[];
  evaporatorPositions: EvaporatorPosition[];
  positionHeightOverrides: PositionHeightOverrides;
  status: StorageCellStatus;
  complexId: string | null;
  complexPosition: ComplexPosition;
};

// Default wizard state
const defaultWizardData: CellWizardData = {
  name: '',
  width: 10,
  depth: 6,
  maxStackHeight: 8,
  doorPositions: [],
  evaporatorPositions: [],
  positionHeightOverrides: {},
  status: 'active',
  complexId: null,
  complexPosition: { x: 0, y: 0, rotation: 0 },
};

const STEPS = [
  { id: 'basics', title: 'Basis', description: 'Naam en afmetingen' },
  { id: 'door', title: 'Deuren', description: 'Deurposities plaatsen' },
  { id: 'evaporator', title: 'Verdampers', description: 'Verdamperposities' },
  { id: 'heights', title: 'Hoogtes', description: 'Stapelhoogtes instellen' },
  { id: 'confirm', title: 'Bevestigen', description: 'Overzicht en opslaan' },
];

// Storage cell summary type for edit mode (from summary view)
type StorageCellSummaryForEdit = {
  id: string;
  name: string;
  width: number;
  depth: number;
  status: StorageCellStatus;
  maxStackHeight: number;
  doorPositions: DoorPosition[];
  evaporatorPositions: EvaporatorPosition[];
  positionHeightOverrides: PositionHeightOverrides;
  complexId: string | null;
  complexPosition: ComplexPosition;
  blockedPositions?: { row: number; col: number }[];
};

interface CellWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (cell: Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt' | 'blockedPositions'>) => Promise<void>;
  complexId?: string;
  isLoading?: boolean;
  /** Pass existing cell data to enable edit mode */
  editCell?: StorageCellSummaryForEdit | null;
}

export function CellWizard({
  open,
  onOpenChange,
  onSave,
  complexId,
  isLoading = false,
  editCell,
}: CellWizardProps) {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [wizardData, setWizardData] = React.useState<CellWizardData>({
    ...defaultWizardData,
    complexId: complexId || null,
  });

  const isEditing = !!editCell;

  // Reset wizard when opened - populate from editCell if editing
  React.useEffect(() => {
    if (open) {
      setCurrentStep(0);
      if (editCell) {
        // Edit mode: populate with existing cell data
        setWizardData({
          name: editCell.name,
          width: editCell.width,
          depth: editCell.depth,
          maxStackHeight: editCell.maxStackHeight || 8,
          doorPositions: editCell.doorPositions || [],
          evaporatorPositions: editCell.evaporatorPositions || [],
          positionHeightOverrides: editCell.positionHeightOverrides || {},
          status: editCell.status,
          complexId: editCell.complexId || complexId || null,
          complexPosition: editCell.complexPosition || { x: 0, y: 0, rotation: 0 },
        });
      } else {
        // Create mode: use defaults
        setWizardData({
          ...defaultWizardData,
          complexId: complexId || null,
        });
      }
    }
  }, [open, complexId, editCell]);

  const updateWizardData = (updates: Partial<CellWizardData>) => {
    setWizardData((prev) => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: // Basics
        return wizardData.name.trim().length > 0 && wizardData.width > 0 && wizardData.depth > 0;
      case 1: // Door - Optional
        return true;
      case 2: // Evaporator - Optional
        return true;
      case 3: // Heights - Optional adjustments
        return true;
      case 4: // Confirm
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSave = async () => {
    await onSave({
      name: wizardData.name,
      width: wizardData.width,
      depth: wizardData.depth,
      maxStackHeight: wizardData.maxStackHeight,
      doorPositions: wizardData.doorPositions,
      evaporatorPositions: wizardData.evaporatorPositions,
      positionHeightOverrides: wizardData.positionHeightOverrides,
      status: wizardData.status,
      complexId: wizardData.complexId,
      complexPosition: wizardData.complexPosition,
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepBasics data={wizardData} onChange={updateWizardData} />;
      case 1:
        return <StepDoor data={wizardData} onChange={updateWizardData} />;
      case 2:
        return <StepEvaporator data={wizardData} onChange={updateWizardData} />;
      case 3:
        return <StepHeights data={wizardData} onChange={updateWizardData} />;
      case 4:
        return <StepConfirm data={wizardData} isEditing={isEditing} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `${editCell.name} bewerken` : 'Nieuwe koelcel aanmaken'}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    index < currentStep
                      ? 'bg-emerald-500 text-white'
                      : index === currentStep
                        ? 'bg-emerald-500/20 text-emerald-500 border-2 border-emerald-500'
                        : 'bg-white/10 text-muted-foreground'
                  }`}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-xs mt-1 text-muted-foreground hidden sm:block">
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    index < currentStep ? 'bg-emerald-500' : 'bg-white/10'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="min-h-[300px]"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Vorige
          </Button>

          {currentStep === STEPS.length - 1 ? (
            <Button
              onClick={handleSave}
              disabled={!canProceed() || isLoading}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {isLoading ? 'Opslaan...' : isEditing ? 'Wijzigingen opslaan' : 'Cel aanmaken'}
              <Check className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Volgende
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
