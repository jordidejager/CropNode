'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { SprayableParcel } from '@/lib/supabase-store';
import type { ParcelGroup } from '@/lib/types';

interface ParcelMultiSelectProps {
    parcels: SprayableParcel[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    groups?: ParcelGroup[];
}

type GroupedParcels = {
    crop: string;
    parcels: SprayableParcel[];
};

export function ParcelMultiSelect({
    parcels,
    selectedIds,
    onChange,
    disabled = false,
    placeholder = 'Selecteer percelen...',
    className,
    groups = [],
}: ParcelMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');

    // Group parcels by crop
    const groupedParcels = React.useMemo<GroupedParcels[]>(() => {
        const groups = new Map<string, SprayableParcel[]>();

        for (const parcel of parcels) {
            const crop = parcel.crop || 'Overig';
            if (!groups.has(crop)) {
                groups.set(crop, []);
            }
            groups.get(crop)!.push(parcel);
        }

        return Array.from(groups.entries())
            .map(([crop, parcels]) => ({
                crop,
                parcels: parcels.sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => a.crop.localeCompare(b.crop));
    }, [parcels]);

    // Filter parcels based on search
    const filteredGroups = React.useMemo<GroupedParcels[]>(() => {
        if (!searchQuery) return groupedParcels;

        const query = searchQuery.toLowerCase();
        return groupedParcels
            .map((group) => ({
                crop: group.crop,
                parcels: group.parcels.filter(
                    (p) =>
                        p.name.toLowerCase().includes(query) ||
                        p.variety?.toLowerCase().includes(query) ||
                        p.crop.toLowerCase().includes(query)
                ),
            }))
            .filter((group) => group.parcels.length > 0);
    }, [groupedParcels, searchQuery]);

    const toggleParcel = (parcelId: string) => {
        if (selectedIds.includes(parcelId)) {
            onChange(selectedIds.filter((id) => id !== parcelId));
        } else {
            onChange([...selectedIds, parcelId]);
        }
    };

    const toggleGroup = (group: GroupedParcels) => {
        const groupIds = group.parcels.map((p) => p.id);
        const allSelected = groupIds.every((id) => selectedIds.includes(id));

        if (allSelected) {
            // Deselect all in group
            onChange(selectedIds.filter((id) => !groupIds.includes(id)));
        } else {
            // Select all in group
            const newIds = new Set([...selectedIds, ...groupIds]);
            onChange(Array.from(newIds));
        }
    };

    const selectedParcels = parcels.filter((p) => selectedIds.includes(p.id));

    const removeParcel = (parcelId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selectedIds.filter((id) => id !== parcelId));
    };

    const selectAll = () => {
        onChange(parcels.map((p) => p.id));
    };

    const clearAll = () => {
        onChange([]);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between font-normal min-h-[40px] h-auto',
                        !selectedIds.length && 'text-muted-foreground',
                        className
                    )}
                >
                    <div className="flex flex-wrap gap-1 flex-1 items-center">
                        {selectedIds.length === 0 ? (
                            <span>{placeholder}</span>
                        ) : selectedIds.length <= 3 ? (
                            selectedParcels.map((parcel) => (
                                <Badge
                                    key={parcel.id}
                                    variant="secondary"
                                    className="text-xs"
                                >
                                    {parcel.name}
                                    <X
                                        className="ml-1 h-3 w-3 cursor-pointer hover:text-destructive"
                                        onClick={(e) => removeParcel(parcel.id, e)}
                                    />
                                </Badge>
                            ))
                        ) : (
                            <Badge variant="secondary">
                                {selectedIds.length} percelen geselecteerd
                            </Badge>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Zoek perceel..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                        <span className="text-xs text-muted-foreground">
                            {selectedIds.length} van {parcels.length} geselecteerd
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={selectAll}
                            >
                                Alles selecteren
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={clearAll}
                            >
                                Wissen
                            </Button>
                        </div>
                    </div>
                    <CommandList className="max-h-[300px]">
                        {/* Perceelgroepen sectie */}
                        {groups.length > 0 && !searchQuery && (
                            <CommandGroup heading={<span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Groepen</span>}>
                                {groups.map((g) => {
                                    const memberIds = g.subParcelIds || [];
                                    const allSelected = memberIds.length > 0 && memberIds.every(id => selectedIds.includes(id));
                                    return (
                                        <CommandItem
                                            key={g.id}
                                            onSelect={() => {
                                                if (allSelected) {
                                                    onChange(selectedIds.filter(id => !memberIds.includes(id)));
                                                } else {
                                                    onChange(Array.from(new Set([...selectedIds, ...memberIds])));
                                                }
                                            }}
                                            className="flex items-center gap-2"
                                        >
                                            <Checkbox checked={allSelected} className="h-4 w-4" />
                                            <span className="font-medium">{g.name}</span>
                                            <span className="text-[10px] text-muted-foreground ml-auto">{memberIds.length} percelen</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        )}
                        {filteredGroups.length === 0 ? (
                            <CommandEmpty>Geen percelen gevonden</CommandEmpty>
                        ) : (
                            filteredGroups.map((group) => {
                                const groupIds = group.parcels.map((p) => p.id);
                                const allSelected = groupIds.every((id) =>
                                    selectedIds.includes(id)
                                );
                                const someSelected =
                                    !allSelected &&
                                    groupIds.some((id) => selectedIds.includes(id));

                                return (
                                    <CommandGroup
                                        key={group.crop}
                                        heading={
                                            <div
                                                className="flex items-center gap-2 cursor-pointer hover:text-foreground"
                                                onClick={() => toggleGroup(group)}
                                            >
                                                <Checkbox
                                                    checked={allSelected}
                                                    className={cn(
                                                        'h-4 w-4',
                                                        someSelected && 'opacity-50'
                                                    )}
                                                />
                                                <MapPin className="h-3 w-3" />
                                                <span>{group.crop}</span>
                                                <span className="text-muted-foreground font-normal">
                                                    ({group.parcels.length})
                                                </span>
                                            </div>
                                        }
                                    >
                                        {group.parcels.map((parcel) => (
                                            <CommandItem
                                                key={parcel.id}
                                                value={parcel.id}
                                                onSelect={() => toggleParcel(parcel.id)}
                                                className="flex items-center gap-2 pl-6"
                                            >
                                                <Checkbox
                                                    checked={selectedIds.includes(parcel.id)}
                                                    className="h-4 w-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <span className="truncate block">
                                                        {parcel.name}
                                                    </span>
                                                    {parcel.variety && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {parcel.variety}
                                                        </span>
                                                    )}
                                                </div>
                                                {parcel.area && (
                                                    <span className="text-xs text-muted-foreground shrink-0">
                                                        {parcel.area.toFixed(2)} ha
                                                    </span>
                                                )}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                );
                            })
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
