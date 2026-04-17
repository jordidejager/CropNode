'use client'

/**
 * Hierarchical parcel selector for urenregistratie.
 *
 * Behaviour:
 *  - Initial view shows only hoofdpercelen (no sub-parcels visible).
 *  - Hoofdpercelen with > 1 sub-parcel are clickable (selects "heel perceel")
 *    and have a chevron that expands a nested list of their sub-parcels.
 *  - Hoofdpercelen with exactly 1 sub-parcel render as that single sub-parcel
 *    (no chevron, no "heel perceel" option) — there's nothing to disambiguate.
 *  - Search filters across hoofdperceel-naam + ras/variety; while searching,
 *    all matches are rendered flat (expand-state is ignored).
 *
 * Selection is a discriminated union (ParcelSelection): none / sub / whole.
 */

import * as React from 'react'
import { Check, ChevronDown, ChevronRight, MapPin, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { ParcelGroupOption, ParcelSelection } from '@/lib/types'

/** Format hectares as "1,2 ha" (Dutch locale). Returns "" when area is missing. */
function formatArea(area: number | null | undefined): string {
    if (area == null) return ''
    return `${area.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha`
}

interface ParcelSelectorProps {
    parcelGroups: ParcelGroupOption[]
    value: ParcelSelection
    onChange: (selection: ParcelSelection) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function ParcelSelector({
    parcelGroups,
    value,
    onChange,
    placeholder = 'Selecteer perceel...',
    disabled = false,
    className,
}: ParcelSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

    // Auto-expand the group that contains the current selection when opening
    React.useEffect(() => {
        if (open && value.kind === 'sub') {
            setExpanded(prev => {
                if (prev.has(value.parcelId)) return prev
                const next = new Set(prev)
                next.add(value.parcelId)
                return next
            })
        }
    }, [open, value])

    const toggleExpand = (parcelId: string, e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation()
        e.preventDefault()
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(parcelId)) next.delete(parcelId)
            else next.add(parcelId)
            return next
        })
    }

    const handleSelectNone = () => {
        onChange({ kind: 'none' })
        setOpen(false)
        setSearch('')
    }

    const handleSelectWhole = (group: ParcelGroupOption) => {
        onChange({ kind: 'whole', parcelId: group.parcelId, label: group.parcelName })
        setOpen(false)
        setSearch('')
    }

    const handleSelectSub = (
        group: ParcelGroupOption,
        sub: ParcelGroupOption['subParcels'][number],
    ) => {
        onChange({
            kind: 'sub',
            subParcelId: sub.id,
            parcelId: group.parcelId,
            label: sub.name,
        })
        setOpen(false)
        setSearch('')
    }

    // Trigger label
    const triggerLabel = (() => {
        if (value.kind === 'none') return placeholder
        if (value.kind === 'whole') return `${value.label} — heel perceel`
        return value.label
    })()

    const isPlaceholder = value.kind === 'none'
    const isSearching = search.trim().length > 0

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between h-12 bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white',
                        isPlaceholder && 'text-white/40',
                        className,
                    )}
                >
                    <span className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 flex-shrink-0 opacity-60" />
                        <span className="truncate">{triggerLabel}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
            </PopoverTrigger>

            <PopoverContent
                className="p-0 bg-slate-900 border-white/10 w-[--radix-popover-trigger-width] min-w-[280px]"
                align="start"
            >
                <Command
                    className="bg-transparent"
                    // We do custom rendering in non-search mode; cmdk's filter only
                    // matters while searching.
                    shouldFilter={isSearching}
                    filter={(cmdValue, searchStr) => {
                        const haystack = cmdValue.toLowerCase()
                        const needle = searchStr.toLowerCase().trim()
                        if (!needle) return 1
                        return haystack.includes(needle) ? 1 : 0
                    }}
                >
                    <CommandInput
                        value={search}
                        onValueChange={setSearch}
                        placeholder="Zoek perceel of ras..."
                        className="text-white placeholder:text-white/30"
                    />
                    <CommandList className="max-h-[320px]">
                        <CommandEmpty className="py-6 text-center text-sm text-white/40">
                            Geen percelen gevonden.
                        </CommandEmpty>

                        {/* "Geen perceel" — only visible when not searching */}
                        {!isSearching && (
                            <>
                                <CommandGroup>
                                    <CommandItem
                                        value="__none__"
                                        onSelect={handleSelectNone}
                                        className="text-white/60 hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                value.kind === 'none' ? 'opacity-100 text-primary' : 'opacity-0',
                                            )}
                                        />
                                        Geen perceel
                                    </CommandItem>
                                </CommandGroup>
                                <CommandSeparator className="bg-white/5" />
                            </>
                        )}

                        <CommandGroup>
                            {parcelGroups.map(group => {
                                const isExpanded = expanded.has(group.parcelId) || isSearching
                                const singleSub = group.subParcels.length === 1
                                const selectedWhole =
                                    value.kind === 'whole' && value.parcelId === group.parcelId
                                const selectedSubInGroup =
                                    value.kind === 'sub' && value.parcelId === group.parcelId

                                // Single sub-parcel: render that sub-parcel directly (no whole-parcel row,
                                // no chevron). Selecting it produces kind='sub'.
                                if (singleSub) {
                                    const sub = group.subParcels[0]
                                    const selected =
                                        value.kind === 'sub' && value.subParcelId === sub.id
                                    const areaText = formatArea(sub.area)
                                    return (
                                        <CommandItem
                                            key={group.parcelId}
                                            // Value is used for cmdk search + for selection. We include
                                            // all relevant tokens so search hits on hoofdperceel of ras.
                                            value={`${group.parcelName} ${sub.shortLabel} ${sub.variety ?? ''} ${sub.crop}`}
                                            onSelect={() => handleSelectSub(group, sub)}
                                            className="text-white hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer min-h-[44px]"
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 flex-shrink-0',
                                                    selected ? 'opacity-100 text-primary' : 'opacity-0',
                                                )}
                                            />
                                            <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                <span className="truncate">{sub.name}</span>
                                                {areaText && (
                                                    <span className="text-[10px] font-semibold text-white/40 flex-shrink-0 tabular-nums">
                                                        {areaText}
                                                    </span>
                                                )}
                                            </span>
                                        </CommandItem>
                                    )
                                }

                                const totalArea = group.subParcels.reduce(
                                    (sum, s) => sum + (s.area ?? 0),
                                    0,
                                )
                                const totalAreaText =
                                    totalArea > 0 ? formatArea(totalArea) : ''

                                return (
                                    <React.Fragment key={group.parcelId}>
                                        {/* Hoofdperceel row — click = selecteer heel perceel */}
                                        <CommandItem
                                            value={`${group.parcelName} heel perceel alles ${group.subParcels
                                                .map(s => `${s.shortLabel} ${s.variety ?? ''}`)
                                                .join(' ')}`}
                                            onSelect={() => handleSelectWhole(group)}
                                            className={cn(
                                                'text-white hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer min-h-[44px] pr-1',
                                                selectedSubInGroup && 'bg-white/[0.03]',
                                            )}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4 flex-shrink-0',
                                                    selectedWhole ? 'opacity-100 text-primary' : 'opacity-0',
                                                )}
                                            />
                                            <span className="flex-1 min-w-0 flex items-center gap-2">
                                                <span className="truncate font-medium">{group.parcelName}</span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                                                    <Layers className="h-3 w-3" />
                                                    {group.subParcels.length}
                                                </span>
                                                <span className="text-[10px] font-medium text-white/30 truncate">
                                                    heel perceel
                                                </span>
                                                {totalAreaText && (
                                                    <span className="ml-auto text-[10px] font-semibold text-white/40 flex-shrink-0 tabular-nums">
                                                        {totalAreaText}
                                                    </span>
                                                )}
                                            </span>
                                            {/* Chevron: expand sub-parcels. Hidden while searching
                                                because everything is auto-expanded then. */}
                                            {!isSearching && (
                                                <button
                                                    type="button"
                                                    role="button"
                                                    aria-label={
                                                        isExpanded ? 'Subpercelen verbergen' : 'Subpercelen tonen'
                                                    }
                                                    onClick={e => toggleExpand(group.parcelId, e)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            toggleExpand(group.parcelId, e)
                                                        }
                                                    }}
                                                    // Stop cmdk's Enter-select from firing when focused on chevron
                                                    onPointerDown={e => e.stopPropagation()}
                                                    className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
                                                >
                                                    <ChevronRight
                                                        className={cn(
                                                            'h-4 w-4 transition-transform duration-150',
                                                            isExpanded && 'rotate-90',
                                                        )}
                                                    />
                                                </button>
                                            )}
                                        </CommandItem>

                                        {/* Sub-parcels (indented) */}
                                        {isExpanded &&
                                            group.subParcels.map(sub => {
                                                const selected =
                                                    value.kind === 'sub' && value.subParcelId === sub.id
                                                const areaText = formatArea(sub.area)
                                                // If shortLabel is identical to variety, hide the
                                                // variety hint to avoid "Conference · Conference".
                                                const showVariety =
                                                    sub.variety &&
                                                    sub.variety.toLowerCase() !== sub.shortLabel.toLowerCase()
                                                return (
                                                    <CommandItem
                                                        key={sub.id}
                                                        value={`${group.parcelName} ${sub.shortLabel} ${sub.variety ?? ''} ${sub.crop}`}
                                                        onSelect={() => handleSelectSub(group, sub)}
                                                        className="text-white/80 hover:bg-white/10 aria-selected:bg-white/10 cursor-pointer min-h-[40px] pl-9 pr-2"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 h-4 w-4 flex-shrink-0',
                                                                selected ? 'opacity-100 text-primary' : 'opacity-0',
                                                            )}
                                                        />
                                                        <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                            <span className="flex items-center gap-1.5 min-w-0">
                                                                <span className="truncate">{sub.shortLabel}</span>
                                                                {showVariety && (
                                                                    <span className="text-[10px] text-white/30 flex-shrink-0 truncate">
                                                                        · {sub.variety}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {areaText && (
                                                                <span className="text-[10px] font-semibold text-white/40 flex-shrink-0 tabular-nums">
                                                                    {areaText}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </CommandItem>
                                                )
                                            })}
                                    </React.Fragment>
                                )
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
