'use client';

/**
 * UnifiedParcelMultiSelect — één hiërarchische perceelselector voor de hele app.
 *
 * Gebruik:
 * - Spuitschrift, Veldnotities, Oogst: `mode='multi'`
 * - Urenregistratie, Ziektedruk: `mode='single'` (via boundary-adapter)
 *
 * Hiërarchie komt uit `useParcelGroupOptions()` (groepeert SprayableParcels op
 * lowercased `parcelName`). Selectie werkt op sub_parcel.id niveau.
 *
 * Klik op hoofdperceel-checkbox = (de)selecteer alle subs van die groep.
 * Klik op chevron = expand/collapse subs (zonder te (de)selecteren).
 * Klik op sub-checkbox = toggle individueel.
 * Indeterminate state als sommige subs in een groep geselecteerd zijn.
 */

import * as React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Layers,
  MapPin,
  X as XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { ParcelGroupOption, ParcelGroup } from '@/lib/types';

export type UnifiedParcelSelectionMode = 'multi' | 'single';

export interface UnifiedParcelMultiSelectProps {
  /** Gegroepeerde data — gebruik `useParcelGroupOptions().data`. */
  groups: ParcelGroupOption[];
  /** Geselecteerde sub_parcel.ids. In 'single' mode max 1 entry. */
  selectedSubParcelIds: string[];
  /** Callback met de nieuwe lijst van sub_parcel.ids. */
  onChange: (ids: string[]) => void;
  /** Default 'multi'. */
  mode?: UnifiedParcelSelectionMode;
  /** Toon "Alles selecteren" / "Wissen" actions. Default: true (multi), false (single). */
  showSelectAllActions?: boolean;
  /** Optionele favorietengroepen (parcel_groups tabel) bovenaan de lijst. */
  favoriteGroups?: ParcelGroup[];
  /** Trigger toont "X percelen, Y blokken" i.p.v. badges (multi-select met veel selecties). */
  showScopeSummary?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function formatArea(area: number | null | undefined): string {
  if (area == null) return '';
  return `${area.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

function TriCheckbox({
  state,
  className,
}: {
  state: 'checked' | 'indeterminate' | 'unchecked';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded border-2 transition-colors shrink-0',
        state === 'checked' && 'bg-primary border-primary text-primary-foreground',
        state === 'indeterminate' && 'bg-primary/40 border-primary/60',
        state === 'unchecked' && 'border-white/20 bg-transparent',
        className,
      )}
    >
      {state === 'checked' && <Check className="h-3 w-3" />}
      {state === 'indeterminate' && <span className="block h-0.5 w-2 bg-primary" />}
    </span>
  );
}

export function UnifiedParcelMultiSelect({
  groups,
  selectedSubParcelIds,
  onChange,
  mode = 'multi',
  showSelectAllActions,
  favoriteGroups = [],
  showScopeSummary = false,
  placeholder = 'Selecteer percelen...',
  className,
  disabled = false,
}: UnifiedParcelMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const isMulti = mode === 'multi';
  const showActions = showSelectAllActions ?? isMulti;
  const isSearching = search.trim().length > 0;
  const selectedSet = React.useMemo(() => new Set(selectedSubParcelIds), [selectedSubParcelIds]);

  // Auto-expand groepen die geselecteerde subs bevatten — handig na openen
  React.useEffect(() => {
    if (!open || selectedSet.size === 0) return;
    setExpanded(prev => {
      const next = new Set(prev);
      for (const g of groups) {
        if (g.subParcels.some(s => selectedSet.has(s.id))) next.add(g.parcelId);
      }
      return next;
    });
  }, [open, groups, selectedSet]);

  // Filter groups op zoekterm — match op groep-naam, sub-naam, shortLabel, variety, crop
  const filteredGroups = React.useMemo<ParcelGroupOption[]>(() => {
    if (!isSearching) return groups;
    const q = search.toLowerCase().trim();
    return groups
      .map(g => {
        const groupHit = g.parcelName.toLowerCase().includes(q);
        const subHits = g.subParcels.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.shortLabel.toLowerCase().includes(q) ||
          (s.variety?.toLowerCase().includes(q) ?? false) ||
          s.crop.toLowerCase().includes(q),
        );
        if (groupHit) return g; // groep-hit → toon alle subs
        if (subHits.length > 0) return { ...g, subParcels: subHits };
        return null;
      })
      .filter((g): g is ParcelGroupOption => g !== null);
  }, [groups, isSearching, search]);

  // Totalen voor header
  const totalSubs = React.useMemo(
    () => groups.reduce((sum, g) => sum + g.subParcels.length, 0),
    [groups],
  );

  // Selected groups (alle subs van de groep zitten in selectedSet) — voor scope summary
  const selectedGroupCount = React.useMemo(() => {
    let n = 0;
    for (const g of groups) {
      if (g.subParcels.length > 0 && g.subParcels.every(s => selectedSet.has(s.id))) n++;
    }
    return n;
  }, [groups, selectedSet]);

  const selectedSubs = React.useMemo(() => {
    const subs: { id: string; label: string }[] = [];
    for (const g of groups) {
      for (const s of g.subParcels) {
        if (selectedSet.has(s.id)) subs.push({ id: s.id, label: s.name });
      }
    }
    return subs;
  }, [groups, selectedSet]);

  const toggleExpand = (parcelId: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(parcelId)) next.delete(parcelId);
      else next.add(parcelId);
      return next;
    });
  };

  const toggleGroup = (group: ParcelGroupOption) => {
    const subIds = group.subParcels.map(s => s.id);
    const allSelected = subIds.every(id => selectedSet.has(id));
    if (isMulti) {
      if (allSelected) {
        onChange(selectedSubParcelIds.filter(id => !subIds.includes(id)));
      } else {
        onChange(Array.from(new Set([...selectedSubParcelIds, ...subIds])));
      }
    } else {
      // single mode: groep-checkbox = alle subs (alle-of-niks).
      // Voor single is dat semantisch "heel perceel". Roep onChange met alle ids;
      // adapter (urenregistratie) zet dat om naar `kind:'whole'`.
      if (allSelected) onChange([]);
      else onChange(subIds);
    }
  };

  const toggleSub = (subId: string) => {
    if (isMulti) {
      if (selectedSet.has(subId)) {
        onChange(selectedSubParcelIds.filter(id => id !== subId));
      } else {
        onChange([...selectedSubParcelIds, subId]);
      }
    } else {
      // single mode: vervang selectie met deze ene sub
      onChange([subId]);
      setOpen(false);
    }
  };

  const removeSub = (subId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedSubParcelIds.filter(id => id !== subId));
  };

  const selectAll = () => onChange(groups.flatMap(g => g.subParcels.map(s => s.id)));
  const clearAll = () => onChange([]);

  const toggleFavorite = (favorite: ParcelGroup) => {
    const memberIds = favorite.subParcelIds || [];
    if (memberIds.length === 0) return;
    const allSelected = memberIds.every(id => selectedSet.has(id));
    if (allSelected) {
      onChange(selectedSubParcelIds.filter(id => !memberIds.includes(id)));
    } else {
      onChange(Array.from(new Set([...selectedSubParcelIds, ...memberIds])));
    }
  };

  // Trigger label
  const renderTrigger = () => {
    if (selectedSubs.length === 0) {
      return <span className="text-muted-foreground">{placeholder}</span>;
    }
    if (showScopeSummary || selectedSubs.length > 3) {
      const blocks = selectedSubs.length;
      const groupsHit = (() => {
        let n = 0;
        for (const g of groups) {
          if (g.subParcels.some(s => selectedSet.has(s.id))) n++;
        }
        return n;
      })();
      return (
        <Badge variant="secondary" className="font-normal">
          {groupsHit} {groupsHit === 1 ? 'perceel' : 'percelen'} · {blocks}{' '}
          {blocks === 1 ? 'blok' : 'blokken'}
          {selectedGroupCount > 0 && ` (${selectedGroupCount} heel)`}
        </Badge>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {selectedSubs.map(s => (
          <Badge key={s.id} variant="secondary" className="text-xs font-normal">
            {s.label}
            <XIcon
              className="ml-1 h-3 w-3 cursor-pointer hover:text-destructive"
              onClick={e => removeSub(s.id, e)}
            />
          </Badge>
        ))}
      </div>
    );
  };

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
            'w-full justify-between font-normal min-h-[40px] h-auto py-2',
            !selectedSubs.length && 'text-muted-foreground',
            className,
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 items-center min-w-0">
            {renderTrigger()}
          </div>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[360px] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Zoek perceel of ras..."
            value={search}
            onValueChange={setSearch}
          />

          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b text-xs">
            <span className="text-muted-foreground">
              {selectedSubs.length} van {totalSubs} geselecteerd
            </span>
            {showActions && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={selectAll}
                  type="button"
                >
                  Alles selecteren
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={clearAll}
                  type="button"
                >
                  Wissen
                </Button>
              </div>
            )}
          </div>

          {/* Scrollable list — KEY FIX: max-h + overflow-y-auto */}
          <CommandList className="max-h-[400px] overflow-y-auto overscroll-contain">
            {/* Favorieten-groepen sectie (parcel_groups) */}
            {favoriteGroups.length > 0 && !isSearching && (
              <div className="border-b py-1">
                <div className="px-3 py-1 text-[10px] font-bold text-primary/60 uppercase tracking-wider">
                  Groepen
                </div>
                {favoriteGroups.map(fav => {
                  const memberIds = fav.subParcelIds || [];
                  const allSelected = memberIds.length > 0 && memberIds.every(id => selectedSet.has(id));
                  const someSelected = !allSelected && memberIds.some(id => selectedSet.has(id));
                  return (
                    <button
                      key={fav.id}
                      type="button"
                      onClick={() => toggleFavorite(fav)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-sm"
                    >
                      <TriCheckbox
                        state={allSelected ? 'checked' : someSelected ? 'indeterminate' : 'unchecked'}
                      />
                      <span className="font-medium flex-1 text-left">{fav.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {memberIds.length} {memberIds.length === 1 ? 'perceel' : 'percelen'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredGroups.length === 0 ? (
              <CommandEmpty>Geen percelen gevonden</CommandEmpty>
            ) : (
              <div className="py-1">
                {filteredGroups.map(group => {
                  const subIds = group.subParcels.map(s => s.id);
                  const allSelected = subIds.length > 0 && subIds.every(id => selectedSet.has(id));
                  const someSelected = !allSelected && subIds.some(id => selectedSet.has(id));
                  const groupState: 'checked' | 'indeterminate' | 'unchecked' = allSelected
                    ? 'checked'
                    : someSelected
                    ? 'indeterminate'
                    : 'unchecked';
                  const isExpanded = expanded.has(group.parcelId) || isSearching;
                  const totalArea = group.subParcels.reduce((s, sp) => s + (sp.area ?? 0), 0);
                  const singleSub = group.subParcels.length === 1;

                  // Single-sub: render direct als sub-rij (geen chevron, geen "heel perceel")
                  if (singleSub) {
                    const sub = group.subParcels[0];
                    const selected = selectedSet.has(sub.id);
                    return (
                      <button
                        key={group.parcelId}
                        type="button"
                        onClick={() => toggleSub(sub.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 hover:bg-accent text-sm',
                          selected && 'bg-accent/50',
                        )}
                      >
                        <TriCheckbox state={selected ? 'checked' : 'unchecked'} />
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-left truncate">{group.parcelName}</span>
                        {sub.area != null && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            {formatArea(sub.area)}
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                    <React.Fragment key={group.parcelId}>
                      {/* Hoofdperceel-rij: chevron-area (links, klap uit/in) + content (klik = toggle alle subs) */}
                      <div
                        className={cn(
                          'flex items-center gap-1 px-2 py-2 hover:bg-accent/60 group/row',
                          groupState !== 'unchecked' && 'bg-accent/20',
                        )}
                      >
                        {!isSearching && group.subParcels.length > 1 ? (
                          <button
                            type="button"
                            aria-label={isExpanded ? 'Subpercelen verbergen' : 'Subpercelen tonen'}
                            onClick={e => toggleExpand(group.parcelId, e)}
                            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="w-7 shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          <TriCheckbox state={groupState} />
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-semibold truncate text-sm">{group.parcelName}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <Layers className="h-3 w-3" />
                            {group.subParcels.length}
                          </span>
                          {totalArea > 0 && (
                            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {formatArea(totalArea)}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Sub-rijen (indented) */}
                      {isExpanded &&
                        group.subParcels.map(sub => {
                          const selected = selectedSet.has(sub.id);
                          const showVariety =
                            sub.variety &&
                            sub.variety.toLowerCase() !== sub.shortLabel.toLowerCase();
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => toggleSub(sub.id)}
                              className={cn(
                                'w-full flex items-center gap-3 pl-9 pr-3 py-1.5 hover:bg-accent text-sm',
                                selected && 'bg-accent/50',
                              )}
                            >
                              <TriCheckbox state={selected ? 'checked' : 'unchecked'} />
                              <span className="flex-1 text-left truncate flex items-center gap-1.5">
                                <span className="truncate">{sub.shortLabel}</span>
                                {showVariety && (
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    · {sub.variety}
                                  </span>
                                )}
                              </span>
                              {sub.area != null && (
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                  {formatArea(sub.area)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
