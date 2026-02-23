'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StorageCell, StorageCellStatus } from '@/lib/types';

const storageCellSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  width: z.number().min(1, 'Minimaal 1 kolom').max(50, 'Maximaal 50 kolommen'),
  depth: z.number().min(1, 'Minimaal 1 rij').max(50, 'Maximaal 50 rijen'),
  status: z.enum(['active', 'cooling_down', 'inactive']),
});

type StorageCellFormData = z.infer<typeof storageCellSchema>;

interface StorageCellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cell?: StorageCell | null;
  onSave: (data: Omit<StorageCell, 'id' | 'createdAt' | 'updatedAt'>) => void;
  isLoading?: boolean;
}

export function StorageCellDialog({
  open,
  onOpenChange,
  cell,
  onSave,
  isLoading,
}: StorageCellDialogProps) {
  const isEditing = !!cell;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<StorageCellFormData>({
    resolver: zodResolver(storageCellSchema),
    defaultValues: {
      name: '',
      width: 10,
      depth: 5,
      status: 'active',
    },
  });

  const width = watch('width');
  const depth = watch('depth');

  // Reset form when dialog opens/closes or cell changes
  React.useEffect(() => {
    if (open) {
      if (cell) {
        reset({
          name: cell.name,
          width: cell.width,
          depth: cell.depth,
          status: cell.status,
        });
      } else {
        reset({
          name: '',
          width: 10,
          depth: 5,
          status: 'active',
        });
      }
    }
  }, [open, cell, reset]);

  const onSubmit = (data: StorageCellFormData) => {
    onSave({
      name: data.name,
      width: data.width,
      depth: data.depth,
      status: data.status,
      blockedPositions: cell?.blockedPositions || [],
      maxStackHeight: cell?.maxStackHeight ?? 8,
      doorPositions: cell?.doorPositions ?? [],
      evaporatorPositions: cell?.evaporatorPositions ?? [],
      positionHeightOverrides: cell?.positionHeightOverrides ?? {},
      complexId: cell?.complexId ?? null,
      complexPosition: cell?.complexPosition ?? { x: 0, y: 0, rotation: 0 },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Cel bewerken' : 'Nieuwe cel aanmaken'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Pas de instellingen van deze koelcel aan.'
              : 'Maak een nieuwe koelcel aan met de gewenste afmetingen.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Naam</Label>
            <Input
              id="name"
              placeholder="Bijv. Cel 1, Koelcel A"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Breedte (kolommen)</Label>
              <Input
                id="width"
                type="number"
                min={1}
                max={50}
                {...register('width', { valueAsNumber: true })}
              />
              {errors.width && (
                <p className="text-xs text-red-400">{errors.width.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="depth">Diepte (rijen)</Label>
              <Input
                id="depth"
                type="number"
                min={1}
                max={50}
                {...register('depth', { valueAsNumber: true })}
              />
              {errors.depth && (
                <p className="text-xs text-red-400">{errors.depth.message}</p>
              )}
            </div>
          </div>

          {/* Grid Preview */}
          <div className="space-y-2">
            <Label>Voorvertoning ({width} x {depth} = {width * depth} posities)</Label>
            <div className="bg-white/5 rounded-lg p-4 overflow-auto max-h-[200px]">
              <div
                className="grid gap-1 mx-auto"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(width, 20)}, minmax(16px, 1fr))`,
                  maxWidth: '100%',
                }}
              >
                {Array.from({ length: Math.min(width * depth, 100) }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-white/10 border border-white/20 rounded-sm"
                  />
                ))}
                {width * depth > 100 && (
                  <div className="col-span-full text-center text-xs text-muted-foreground mt-2">
                    +{width * depth - 100} meer posities
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={watch('status')}
              onValueChange={(value: StorageCellStatus) => setValue('status', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Actief
                  </div>
                </SelectItem>
                <SelectItem value="cooling_down">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Inkoelen
                  </div>
                </SelectItem>
                <SelectItem value="inactive">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-500" />
                    Niet actief
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Opslaan...' : isEditing ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
