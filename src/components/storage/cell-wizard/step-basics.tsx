'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CellWizardData } from './index';
import type { StorageCellStatus } from '@/lib/types';

interface StepBasicsProps {
  data: CellWizardData;
  onChange: (updates: Partial<CellWizardData>) => void;
}

export function StepBasics({ data, onChange }: StepBasicsProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Basisgegevens</h3>
        <p className="text-sm text-muted-foreground">
          Vul de naam en afmetingen van de koelcel in.
        </p>
      </div>

      {/* Name and Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cell-name">Naam koelcel</Label>
          <Input
            id="cell-name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="bijv. Cel 1, Elstar cel"
            className="bg-white/5"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={data.status}
            onValueChange={(value: StorageCellStatus) => onChange({ status: value })}
          >
            <SelectTrigger className="bg-white/5">
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
      </div>

      {/* Width and Depth */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Breedte (kolommen): {data.width}</Label>
          <Slider
            value={[data.width]}
            onValueChange={([value]) => onChange({ width: value })}
            min={3}
            max={20}
            step={1}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            Aantal kistposities in de breedte
          </p>
        </div>
        <div className="space-y-2">
          <Label>Diepte (rijen): {data.depth}</Label>
          <Slider
            value={[data.depth]}
            onValueChange={([value]) => onChange({ depth: value })}
            min={2}
            max={15}
            step={1}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            Aantal kistposities in de diepte
          </p>
        </div>
      </div>

      {/* Max Stack Height */}
      <div className="space-y-2">
        <Label>Maximale stapelhoogte: {data.maxStackHeight} kisten</Label>
        <Slider
          value={[data.maxStackHeight]}
          onValueChange={([value]) => onChange({ maxStackHeight: value })}
          min={4}
          max={12}
          step={1}
          className="py-2"
        />
        <p className="text-xs text-muted-foreground">
          Standaard aantal kisten dat gestapeld kan worden
        </p>
      </div>

      {/* Preview */}
      <div className="mt-6 p-4 bg-white/5 rounded-lg">
        <h4 className="text-sm font-medium mb-3">Voorvertoning</h4>
        <div className="flex items-center justify-center">
          <div
            className="grid gap-0.5 p-2 bg-slate-900/50 rounded-lg border border-white/10"
            style={{
              gridTemplateColumns: `repeat(${Math.min(data.width, 15)}, minmax(16px, 24px))`,
            }}
          >
            {Array.from({ length: Math.min(data.depth, 10) }).map((_, row) =>
              Array.from({ length: Math.min(data.width, 15) }).map((_, col) => (
                <div
                  key={`${row}-${col}`}
                  className={cn(
                    'aspect-square rounded-sm',
                    'bg-white/10 border border-white/5'
                  )}
                />
              ))
            )}
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-3">
          {data.width} × {data.depth} = {data.width * data.depth} posities
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Totale capaciteit: {data.width * data.depth * data.maxStackHeight} kisten
        </p>
      </div>
    </div>
  );
}
