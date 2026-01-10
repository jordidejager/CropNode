'use client';

import { useState, useRef, useEffect } from 'react';
import type { Parcel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineEditParcelsProps {
  allParcels: Parcel[];
  selectedParcelIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export function InlineEditParcels({ allParcels, selectedParcelIds, onSelectionChange }: InlineEditParcelsProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredParcels = allParcels.filter(parcel =>
    parcel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parcel.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parcel.variety.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedNames = selectedParcelIds
    .map(id => allParcels.find(p => p.id === id)?.name)
    .filter(Boolean);

  const handleCheckboxChange = (parcelId: string, checked: boolean) => {
    const newSelection = checked
      ? [...selectedParcelIds, parcelId]
      : selectedParcelIds.filter(id => id !== parcelId);
    onSelectionChange(newSelection);
  };

  // Focus search input when popover opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const displayText = selectedNames.length === 0
    ? 'Selecteer percelen...'
    : selectedNames.length <= 2
      ? selectedNames.join(', ')
      : `${selectedNames.length} percelen`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-[36px] py-1.5 px-2 text-left font-normal",
            selectedParcelIds.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="truncate text-sm">{displayText}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Zoek perceel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-2 space-y-1">
            {filteredParcels.length > 0 ? (
              filteredParcels.map(parcel => (
                <div
                  key={parcel.id}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer"
                  onClick={() => handleCheckboxChange(parcel.id, !selectedParcelIds.includes(parcel.id))}
                >
                  <Checkbox
                    id={`inline-parcel-${parcel.id}`}
                    checked={selectedParcelIds.includes(parcel.id)}
                    onCheckedChange={(checked) => handleCheckboxChange(parcel.id, !!checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Label
                    htmlFor={`inline-parcel-${parcel.id}`}
                    className="font-normal cursor-pointer flex-1 text-sm"
                  >
                    <span className="font-medium">{parcel.name}</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      ({parcel.crop})
                    </span>
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground p-4 text-sm">
                Geen percelen gevonden.
              </p>
            )}
          </div>
        </ScrollArea>
        {selectedParcelIds.length > 0 && (
          <div className="p-2 border-t">
            <p className="text-xs text-muted-foreground">
              {selectedParcelIds.length} perceel{selectedParcelIds.length !== 1 ? 'en' : ''} geselecteerd
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
