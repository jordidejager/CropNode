'use client';

import { useState } from 'react';
import type { Parcel } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EditParcelsProps {
  allParcels: Parcel[];
  selectedParcelIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export function EditParcels({ allParcels, selectedParcelIds, onSelectionChange }: EditParcelsProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredParcels = allParcels.filter(parcel =>
    parcel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCheckboxChange = (parcelId: string, checked: boolean) => {
    const newSelection = checked
      ? [...selectedParcelIds, parcelId]
      : selectedParcelIds.filter(id => id !== parcelId);
    onSelectionChange(newSelection);
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="parcel-search" className="font-semibold">Percelen</Label>
      <Input
        id="parcel-search"
        placeholder="Zoek perceel..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <ScrollArea className="h-48 rounded-md border p-2">
        <div className="space-y-2">
          {filteredParcels.map(parcel => (
            <div key={parcel.id} className="flex items-center gap-2">
              <Checkbox
                id={`parcel-${parcel.id}`}
                checked={selectedParcelIds.includes(parcel.id)}
                onCheckedChange={(checked) => handleCheckboxChange(parcel.id, !!checked)}
              />
              <Label htmlFor={`parcel-${parcel.id}`} className="font-normal cursor-pointer">
                {parcel.name} ({parcel.crop} - {parcel.variety})
              </Label>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
