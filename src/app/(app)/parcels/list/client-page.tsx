"use client";

import { useState, useCallback, useMemo } from "react";
import { useParcels, useParcelGroups, useInvalidateQueries, useSpuitschriftEntries } from "@/hooks/use-data";
import { addParcel, updateParcel, deleteParcel, addSubParcel, addParcelGroup, deleteParcelGroup, setParcelGroupMembers } from "@/lib/supabase-store";
import type { SubParcel, RvoParcel } from "@/lib/types";
import type { SprayableParcel } from "@/lib/supabase-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Map as MapIcon, LayoutList, List, Search, ArrowLeft, Layers, Grid3X3, ArrowUpDown, ArrowUp, ArrowDown, Eye, Apple, Leaf, Pencil, X as XIcon, FolderPlus, Trash2 } from "lucide-react";
import { ParcelFormDialog, type RvoData } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton, ErrorState, EmptyState } from "@/components/ui/data-states";
import { ParcelsTreeTable } from "@/components/parcels-tree-table";
import { ParcelComposer } from "@/components/parcel-composer";
import { ParcelDetailView } from "@/components/parcel-detail-view";
import { MainParcelView } from "@/components/main-parcel-view";
import { CompanyStatsHeader } from "@/components/company-stats-header";
import { ParcelCard } from "@/components/parcel-card";
import { ParcelGroupDialog } from "@/components/parcel-group-dialog";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { RvoParcelSheet } from "@/components/rvo-map/rvo-parcel-sheet";
import { RvoMultiSelectBar } from "@/components/rvo-map/rvo-multi-select-bar";
import { calculateAreaHectares, calculateCenter } from "@/lib/rvo-api";
import dynamic from "next/dynamic";

const RvoMap = dynamic(
  () => import("@/components/rvo-map/rvo-map").then((m) => m.RvoMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-white/5 animate-pulse rounded-xl" />,
  }
);

// Grouped parcel type for main parcel view
interface GroupedParcel {
  id: string;
  name: string;
  totalArea: number;
  subParcels: SprayableParcel[];
  crops: string[];
  varieties: string[];
  // Take first subparcel's data for display
  location: string | null;
  geometry: any;
}

export function PercelenClientPage({ forcedView }: { forcedView?: 'list' | 'map' }) {
  const [viewMode, setViewMode] = useState<'list' | 'map'>(forcedView || 'list');
  const [groupByMainParcel, setGroupByMainParcel] = useState(false);
  const [selectedMainParcel, setSelectedMainParcel] = useState<SprayableParcel | null>(null);
  const [selectedGroupedParcel, setSelectedGroupedParcel] = useState<GroupedParcel | null>(null);
  const [selectedSubParcel, setSelectedSubParcel] = useState<SubParcel | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [activeParcelForComposer, setActiveParcelForComposer] = useState<SprayableParcel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCrops, setSelectedCrops] = useState<Set<string>>(new Set());
  const [selectedVarieties, setSelectedVarieties] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<'name' | 'crop' | 'variety' | 'area'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());

  // Map specific state
  const [selectedRvoParcels, setSelectedRvoParcels] = useState<RvoParcel[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [rvoDataForForm, setRvoDataForForm] = useState<RvoData | null>(null);
  const [mergeOnImport, setMergeOnImport] = useState(false);
  const [pendingSubParcels, setPendingSubParcels] = useState<Omit<SubParcel, 'id' | 'parcelId' | 'createdAt' | 'updatedAt'>[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [formSource, setFormSource] = useState<"RVO_IMPORT" | "MANUAL">("RVO_IMPORT");

  // Groups
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);
  const [groupInitialSelectedIds, setGroupInitialSelectedIds] = useState<Set<string> | undefined>(undefined);

  const { toast } = useToast();
  const { data: parcels = [], isLoading, isError, error, refetch } = useParcels();
  const { data: parcelGroups = [] } = useParcelGroups();
  const { data: spuitschriftEntries = [] } = useSpuitschriftEntries();
  const { invalidateParcels, invalidateParcelGroups } = useInvalidateQueries();

  // Find last spray for selected main parcel
  const lastSprayForParcel = useMemo(() => {
    if (!selectedMainParcel) return undefined;

    // Sort by date desc
    const sorted = [...spuitschriftEntries].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Find first entry that contains this parcel name in plots
    return sorted.find(entry =>
      entry.plots.some(p => p.toLowerCase() === selectedMainParcel.name.toLowerCase())
    );
  }, [selectedMainParcel, spuitschriftEntries]);

  // Get active group member IDs for filtering
  const activeGroupMemberIds = useMemo(() => {
    if (!activeGroupFilter) return null;
    const group = parcelGroups.find(g => g.id === activeGroupFilter);
    return group?.subParcelIds ? new Set(group.subParcelIds) : null;
  }, [activeGroupFilter, parcelGroups]);

  const filteredParcels = useMemo(() => {
    let result = parcels;

    // Group filter
    if (activeGroupMemberIds) {
      result = result.filter(p => activeGroupMemberIds.has(p.id));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.crop?.toLowerCase().includes(q) ||
        p.variety?.toLowerCase().includes(q) ||
        p.parcelName?.toLowerCase().includes(q) ||
        p.synonyms?.some(s => s.toLowerCase().includes(q))
      );
    }

    if (selectedCrops.size > 0) {
      result = result.filter(p => selectedCrops.has(p.crop || 'Onbekend'));
    }

    if (selectedVarieties.size > 0) {
      result = result.filter(p => selectedVarieties.has(p.variety || 'Onbekend'));
    }

    return result;
  }, [parcels, searchQuery, selectedCrops, selectedVarieties]);

  // Group parcels by parcelName for main parcel view
  const groupedParcels = useMemo(() => {
    const groups = new Map<string, SprayableParcel[]>();

    filteredParcels.forEach(parcel => {
      const key = parcel.parcelName || parcel.name;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(parcel);
    });

    return Array.from(groups.entries()).map(([name, subParcels]) => {
      const totalArea = subParcels.reduce((sum, p) => sum + (p.area || 0), 0);
      const crops = [...new Set(subParcels.map(p => p.crop).filter(Boolean))];
      const varieties = [...new Set(subParcels.map(p => p.variety).filter(Boolean))] as string[];

      return {
        id: `group-${name}`,
        name,
        totalArea,
        subParcels,
        crops,
        varieties,
        location: subParcels[0]?.location || null,
        geometry: subParcels[0]?.geometry || null,
      } as GroupedParcel;
    });
  }, [filteredParcels]);

  // Crop counts (from all parcels, unfiltered)
  const cropCounts = useMemo(() => {
    const counts = new Map<string, number>();
    parcels.forEach(p => {
      const crop = p.crop || 'Onbekend';
      counts.set(crop, (counts.get(crop) || 0) + 1);
    });
    return counts;
  }, [parcels]);

  // Variety counts (filtered by selected crops)
  const varietyCounts = useMemo(() => {
    const relevantParcels = selectedCrops.size > 0
      ? parcels.filter(p => selectedCrops.has(p.crop || 'Onbekend'))
      : parcels;

    const counts = new Map<string, { count: number; crop: string }>();
    relevantParcels.forEach(p => {
      const variety = p.variety || 'Onbekend';
      if (!counts.has(variety)) {
        counts.set(variety, { count: 0, crop: p.crop || 'Onbekend' });
      }
      counts.get(variety)!.count++;
    });
    return counts;
  }, [parcels, selectedCrops]);

  // Sorted parcels for table view
  const sortedParcels = useMemo(() => {
    return [...filteredParcels].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'crop': cmp = (a.crop || '').localeCompare(b.crop || ''); break;
        case 'variety': cmp = (a.variety || '').localeCompare(b.variety || ''); break;
        case 'area': cmp = (a.area || 0) - (b.area || 0); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredParcels, sortColumn, sortDirection]);

  const totalFilteredArea = useMemo(() =>
    filteredParcels.reduce((sum, p) => sum + (p.area || 0), 0),
  [filteredParcels]);

  // Selection computed values
  const selectedParcelsArea = useMemo(() => {
    if (selectedParcelIds.size === 0) return 0;
    return filteredParcels
      .filter(p => selectedParcelIds.has(p.id))
      .reduce((sum, p) => sum + (p.area || 0), 0);
  }, [filteredParcels, selectedParcelIds]);

  const allVisibleSelected = useMemo(() =>
    sortedParcels.length > 0 && sortedParcels.every(p => selectedParcelIds.has(p.id)),
  [sortedParcels, selectedParcelIds]);

  const toggleParcelSelection = useCallback((id: string) => {
    setSelectedParcelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedParcelIds(new Set());
    } else {
      setSelectedParcelIds(new Set(sortedParcels.map(p => p.id)));
    }
  }, [allVisibleSelected, sortedParcels]);

  // Helpers
  const getCropColor = (crop: string) => {
    if (crop === 'Appel') return { bg: 'bg-rose-500/10', text: 'text-rose-400', ring: 'ring-rose-500/30' };
    if (crop === 'Peer') return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/30' };
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/30' };
  };

  const toggleCrop = useCallback((crop: string) => {
    setSelectedCrops(prev => {
      const next = new Set(prev);
      if (next.has(crop)) next.delete(crop);
      else next.add(crop);

      // Clear varieties that no longer match active crops
      if (next.size > 0) {
        const validVarieties = new Set<string>();
        parcels.forEach(p => {
          if (next.has(p.crop || 'Onbekend')) validVarieties.add(p.variety || 'Onbekend');
        });
        setSelectedVarieties(prevV => {
          const nextV = new Set<string>();
          prevV.forEach(v => { if (validVarieties.has(v)) nextV.add(v); });
          return nextV;
        });
      }
      return next;
    });
  }, [parcels]);

  const toggleVariety = useCallback((variety: string) => {
    setSelectedVarieties(prev => {
      const next = new Set(prev);
      if (next.has(variety)) next.delete(variety);
      else next.add(variety);
      return next;
    });
  }, []);

  const handleSort = useCallback((column: 'name' | 'crop' | 'variety' | 'area') => {
    setSortColumn(prev => {
      if (prev === column) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
      } else {
        setSortDirection('asc');
      }
      return column;
    });
  }, []);

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const handleAdd = () => {
    setRvoDataForForm(null);
    setPendingSubParcels([]);
    setFormSource("MANUAL");
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (values: any) => {
    try {
      const newParcel = await addParcel({
        ...values,
        source: formSource,
      });

      // Instead of saving sub-parcels directly, we open the composer 
      // with the pending sub-parcels so the user can finish the configuration.
      setActiveParcelForComposer(newParcel);
      setIsComposerOpen(true);

      toast({
        title: 'Perceel aangemaakt',
        description: pendingSubParcels.length > 0
          ? 'Configureer nu de details voor de samengevoegde blokken.'
          : 'Stel nu de rassen verder samen.'
      });

      invalidateParcels();

      // Cleanup map states
      setIsSheetOpen(false);
      setSelectedRvoParcels([]);
      // We keep pendingSubParcels until the composer component has picked them up
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fout opgetreden', description: 'Kon perceel niet opslaan.' });
    }
  };

  const handleDeleteParcel = async (parcelId: string) => {
    if (!confirm("Weet je zeker dat je dit perceel en alle bijbehorende blokken wilt verwijderen?")) return;

    try {
      await deleteParcel(parcelId);
      toast({ title: 'Perceel verwijderd', description: 'Het perceel is succesvol verwijderd.' });
      invalidateParcels();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Fout opgetreden', description: 'Kon perceel niet verwijderen.' });
    }
  };

  const handleComposerSave = async (subParcels: Omit<SubParcel, 'id' | 'parcelId' | 'createdAt' | 'updatedAt'>[]) => {
    if (!activeParcelForComposer) return;

    try {
      await Promise.all(subParcels.map(sp => addSubParcel({
        ...sp,
        parcelId: activeParcelForComposer.id
      })));

      toast({ title: 'Samenstelling opgeslagen', description: 'Het perceel is succesvol ingedeeld.' });
      invalidateParcels();
      setActiveParcelForComposer(null);
      setPendingSubParcels([]);
    } catch (error: any) {
      console.error("Fout bij opslaan rassen:", error);
      toast({
        variant: 'destructive',
        title: 'Fout opgetreden',
        description: `Kon rassen niet opslaan: ${error.message || 'Onbekende fout'}.`
      });
    }
  };

  const handleParcelSelect = useCallback((parcel: RvoParcel | null) => {
    if (parcel) {
      setSelectedRvoParcels([parcel]);
      setIsSheetOpen(true);
    } else {
      setSelectedRvoParcels([]);
      setIsSheetOpen(false);
    }
  }, []);

  const handleSelectionChange = useCallback((parcels: RvoParcel[]) => {
    setSelectedRvoParcels(parcels);
    if (parcels.length === 1) {
      setIsSheetOpen(true);
    } else if (parcels.length === 0) {
      setIsSheetOpen(false);
    }
    // If > 1, the Sheet might be closed and MultiSelectBar handles it
  }, []);

  const handleAddFromRvo = useCallback(async (merge: boolean) => {
    if (selectedRvoParcels.length === 0) return;

    if (merge && selectedRvoParcels.length > 1) {
      // Fallback: Create a MultiPolygon since turf is unavailable due to network issues
      const polygons = selectedRvoParcels.map(p => {
        if (p.geometry.type === 'Polygon') return [p.geometry.coordinates];
        if (p.geometry.type === 'MultiPolygon') return p.geometry.coordinates;
        return [];
      }).flat();

      const unionGeo = {
        type: 'MultiPolygon',
        coordinates: polygons
      };

      const totalArea = selectedRvoParcels.reduce((sum, p) => sum + calculateAreaHectares(p.geometry), 0);
      const center = calculateCenter(selectedRvoParcels[0].geometry); // Simplified center

      const subParcels = selectedRvoParcels.map(p => ({
        name: `Blok ${p.properties.gewascode}`,
        crop: p.properties.gewas === 'Consumptieaardappelen' ? 'Overig' : (p.properties.gewas.includes('appel') ? 'Appel' : 'Peer'),
        variety: p.properties.gewas,
        area: parseFloat(calculateAreaHectares(p.geometry).toFixed(2)),
        irrigationType: 'Geen'
      }));

      setPendingSubParcels(subParcels);
      setRvoDataForForm({
        name: "Nieuw Verzamelperceel",
        area: parseFloat(totalArea.toFixed(2)),
        location: center,
        geometry: unionGeo,
      });
      setFormSource("RVO_IMPORT");
      setIsSheetOpen(false);
      setIsFormOpen(true);
    } else {
      // Individual logic (handles 1 or more but creates separate main parcels - currently simple 1-by-1)
      // For simplicity, if many are selected but user says no merge, we'll just process the first or show a warning.
      // The user said: "De app maakt dan voor elk vlak een apart hoofdperceel aan."
      // We'll process them one by one or just the first for now to avoid multiple dialogs popping up.
      const p = selectedRvoParcels[0];
      const center = calculateCenter(p.geometry);
      const area = calculateAreaHectares(p.geometry);

      setPendingSubParcels([]);
      setRvoDataForForm({
        name: `Perceel ${p.properties.gewascode || 'Nieuw'}`,
        area: parseFloat(area.toFixed(2)),
        location: center,
        geometry: p.geometry,
      });
      setFormSource("RVO_IMPORT");
      setIsSheetOpen(false);
      setIsFormOpen(true);
    }
  }, [selectedRvoParcels]);

  // Handle drawn geometry from drawing mode on map
  const handleDrawnGeometry = useCallback((geometry: any) => {
    if (geometry) {
      const center = calculateCenter(geometry);
      const area = calculateAreaHectares(geometry);

      setPendingSubParcels([]);
      setRvoDataForForm({
        name: "",
        area: parseFloat(area.toFixed(4)),
        location: center,
        geometry: geometry,
      });
      setFormSource("MANUAL");
      setIsDrawingMode(false);
      setIsFormOpen(true);
    }
  }, []);

  // --- Render logic ---

  // Sub-parcel detail view (deepest level)
  if (selectedSubParcel) {
    return (
      <ParcelDetailView
        subParcel={selectedSubParcel}
        onBack={() => setSelectedSubParcel(null)}
        soilSamples={selectedSubParcel.soilSamples || []}
        productionHistory={selectedSubParcel.productionHistory || []}
      />
    );
  }

  // Main parcel executive dashboard (middle level)
  if (selectedMainParcel) {
    return (
      <MainParcelView
        parcel={selectedMainParcel}
        onBack={() => setSelectedMainParcel(null)}
        onSubParcelClick={(sub) => setSelectedSubParcel(sub)}
        lastSpray={lastSprayForParcel}
      />
    )
  }

  // Grouped parcel view - shows subparcels within a main parcel
  if (selectedGroupedParcel) {
    return (
      <div className="space-y-6 h-full flex flex-col pb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedGroupedParcel(null)}
            className="h-12 w-12 rounded-full bg-white/5 hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white">{selectedGroupedParcel.name}</h1>
            <p className="text-sm text-white/50">
              {selectedGroupedParcel.subParcels.length} blokken • {selectedGroupedParcel.totalArea.toFixed(2)} ha totaal
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-grow overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {selectedGroupedParcel.subParcels.map((parcel, index) => (
              <ParcelCard
                key={parcel.id}
                parcel={parcel}
                index={index}
                onClick={() => setSelectedMainParcel(parcel)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Main list/map view (top level)
  if (isError) {
    return (
      <ErrorState
        title="Kon percelen niet laden"
        message={error?.message || 'Er is een fout opgetreden.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-8 h-full flex flex-col pb-8">
      {/* Hero Stats Section */}
      {!selectedMainParcel && !selectedSubParcel && (
        <CompanyStatsHeader parcels={parcels} />
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 px-1">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Zoek op perceelnaam, gewas of ras..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 bg-white/5 border-white/10 hover:border-white/20 focus:border-primary/50 transition-all rounded-full h-12 text-white font-medium shadow-2xl"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          {viewMode === 'list' && (
            <Button
              variant="outline"
              onClick={() => setGroupByMainParcel(!groupByMainParcel)}
              className={`flex-1 md:flex-none border-white/10 font-bold gap-2 h-12 rounded-full transition-colors ${
                groupByMainParcel
                  ? 'bg-primary/20 border-primary/50 text-primary hover:bg-primary/30'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {groupByMainParcel ? (
                <>
                  <Grid3X3 className="h-4 w-4" />
                  Subpercelen
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4" />
                  Hoofdpercelen
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            className="flex-1 md:flex-none bg-white/5 border-white/10 font-bold gap-2 h-12 rounded-full hover:bg-white/10"
          >
            {viewMode === 'list' ? (
              <>
                <MapIcon className="h-4 w-4" />
                Kaart
              </>
            ) : (
              <>
                <List className="h-4 w-4" />
                Lijst
              </>
            )}
          </Button>
          <Button
            onClick={handleAdd}
            className="flex-1 md:flex-none bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 h-12 rounded-full shadow-lg shadow-primary/20"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Nieuw Perceel
          </Button>
        </div>
      </div>

      <div className="flex-grow min-h-0">
        {viewMode === 'list' ? (
          <div className="h-full flex flex-col gap-4">
            {/* Filter Chips */}
            {!isLoading && parcels.length > 0 && (
              <div className="space-y-3 shrink-0 px-1">
                {/* Groepen */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-1">Groepen</span>
                  {parcelGroups.length > 0 && parcelGroups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => setActiveGroupFilter(activeGroupFilter === group.id ? null : group.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all group/chip ${
                          activeGroupFilter === group.id
                            ? 'bg-primary/20 text-primary ring-1 ring-primary/50'
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {group.name}
                        <span className="ml-1 text-[10px] opacity-50">({group.memberCount})</span>
                        <Trash2
                          className="inline-block ml-1.5 h-3 w-3 opacity-0 group-hover/chip:opacity-50 hover:!opacity-100 hover:!text-rose-400 transition-all cursor-pointer"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await deleteParcelGroup(group.id);
                              if (activeGroupFilter === group.id) setActiveGroupFilter(null);
                              invalidateParcelGroups();
                              toast({ title: 'Groep verwijderd' });
                            } catch { toast({ variant: 'destructive', title: 'Fout bij verwijderen' }); }
                          }}
                        />
                      </button>
                    ))}
                    <button
                      onClick={() => { setGroupInitialSelectedIds(undefined); setIsGroupDialogOpen(true); }}
                      className="px-2 py-1.5 rounded-full text-xs text-white/30 hover:text-white/60 border border-dashed border-white/10 hover:border-white/20 transition-all"
                    >
                      + Groep
                    </button>
                  </div>

                {/* Gewas filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-1">Gewas</span>
                  <button
                    onClick={() => { setSelectedCrops(new Set()); setSelectedVarieties(new Set()); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedCrops.size === 0
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                  >
                    Alles
                  </button>
                  {Array.from(cropCounts.entries()).map(([crop, count]) => {
                    const active = selectedCrops.has(crop);
                    const colors = getCropColor(crop);
                    return (
                      <button
                        key={crop}
                        onClick={() => toggleCrop(crop)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          active
                            ? `${colors.bg} ${colors.text} ring-1 ${colors.ring}`
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {crop} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Ras filters */}
                {Array.from(varietyCounts.entries()).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-1">Ras</span>
                    {Array.from(varietyCounts.entries())
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([variety, { count, crop }]) => {
                        const active = selectedVarieties.has(variety);
                        const colors = getCropColor(crop);
                        return (
                          <button
                            key={variety}
                            onClick={() => toggleVariety(variety)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              active
                                ? `${colors.bg} ${colors.text} ring-1 ${colors.ring}`
                                : `bg-white/5 text-white/40 hover:bg-white/10 border-l-2 ${
                                    crop === 'Appel' ? 'border-l-rose-500/30' :
                                    crop === 'Peer' ? 'border-l-emerald-500/30' :
                                    'border-l-amber-500/30'
                                  }`
                            }`}
                          >
                            {variety} ({count})
                          </button>
                        );
                    })}
                  </div>
                )}

                {/* Result count */}
                <p className="text-xs text-white/30">
                  {filteredParcels.length === parcels.length
                    ? `${parcels.length} percelen`
                    : `${filteredParcels.length} van ${parcels.length} percelen`
                  }
                </p>
              </div>
            )}

            {/* Content */}
            <div className="flex-grow min-h-0 overflow-auto custom-scrollbar">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : groupByMainParcel && groupedParcels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pr-2">
                  <AnimatePresence mode="popLayout">
                    {groupedParcels.map((group, index) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => {
                          if (group.subParcels.length === 1) {
                            setSelectedMainParcel(group.subParcels[0]);
                          } else {
                            setSelectedGroupedParcel(group);
                          }
                        }}
                        className="group relative bg-white/5 backdrop-blur-sm border-l-4 border-primary/50 hover:border-primary rounded-xl p-6 cursor-pointer transition-all duration-300 hover:bg-white/[0.08] hover:-translate-y-1"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-1">
                            <h3 className="text-xl font-black text-white group-hover:text-primary transition-colors">
                              {group.name}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {group.crops.map(crop => {
                                const colors = getCropColor(crop);
                                return (
                                  <span key={crop} className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                    {crop}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-sm font-black text-primary">{group.subParcels.length}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/5 rounded-lg">
                              <MapIcon className="h-4 w-4 text-white/40" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-lg font-black text-white">{group.totalArea.toFixed(2)}</span>
                              <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Hectares</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/5 rounded-lg">
                              <Layers className="h-4 w-4 text-white/40" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-lg font-black text-white">{group.subParcels.length}</span>
                              <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Blokken</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/20">
                          <div className="flex items-center gap-2 flex-wrap">
                            {group.varieties.slice(0, 3).map(v => (
                              <span key={v}>{v}</span>
                            ))}
                            {group.varieties.length > 3 && <span>+{group.varieties.length - 3}</span>}
                          </div>
                          <span className="group-hover:text-primary transition-colors">Bekijk blokken</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : !groupByMainParcel && sortedParcels.length > 0 ? (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-[#0A0A0A]/95 backdrop-blur-sm">
                      <tr className="border-b border-white/10">
                        <th className="w-10 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50 cursor-pointer accent-emerald-500"
                          />
                        </th>
                        <th
                          className="text-left px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-widest cursor-pointer hover:text-white/60 select-none"
                          onClick={() => handleSort('name')}
                        >
                          <span className="flex items-center gap-1">Perceelnaam {getSortIcon('name')}</span>
                        </th>
                        <th
                          className="text-left px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-widest cursor-pointer hover:text-white/60 select-none"
                          onClick={() => handleSort('crop')}
                        >
                          <span className="flex items-center gap-1">Gewas {getSortIcon('crop')}</span>
                        </th>
                        <th
                          className="text-left px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-widest cursor-pointer hover:text-white/60 select-none"
                          onClick={() => handleSort('variety')}
                        >
                          <span className="flex items-center gap-1">Ras {getSortIcon('variety')}</span>
                        </th>
                        <th
                          className="text-right px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-widest cursor-pointer hover:text-white/60 select-none"
                          onClick={() => handleSort('area')}
                        >
                          <span className="flex items-center justify-end gap-1">Oppervlakte (ha) {getSortIcon('area')}</span>
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-widest text-center w-20">
                          Acties
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedParcels.map((parcel, index) => {
                        const crop = parcel.crop || 'Onbekend';
                        const colors = getCropColor(crop);
                        return (
                          <tr
                            key={parcel.id}
                            className={`border-b border-white/5 hover:bg-white/[0.06] transition-colors cursor-pointer ${
                              selectedParcelIds.has(parcel.id)
                                ? 'bg-primary/[0.06]'
                                : index % 2 === 0 ? 'bg-white/[0.02]' : ''
                            }`}
                            onClick={() => setSelectedMainParcel(parcel)}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedParcelIds.has(parcel.id)}
                                onChange={() => toggleParcelSelection(parcel.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50 cursor-pointer accent-emerald-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-white hover:text-primary transition-colors">
                                {parcel.name}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${colors.bg} ${colors.text}`}>
                                {crop === 'Appel' ? <Apple className="h-3 w-3" /> : <Leaf className="h-3 w-3" />}
                                {crop}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white/70">
                              {parcel.variety || '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-mono text-white/70">
                              {(parcel.area || 0).toFixed(2)} ha
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedMainParcel(parcel); }}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-primary/20 hover:text-primary text-white/30 transition-colors"
                                title="Bekijk details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-card/30 backdrop-blur-md border border-white/5 rounded-3xl p-12">
                  <EmptyState
                    icon={LayoutList}
                    title={searchQuery || selectedCrops.size > 0 || selectedVarieties.size > 0 ? "Geen resultaten" : "Geen percelen gevonden"}
                    description={
                      searchQuery || selectedCrops.size > 0 || selectedVarieties.size > 0
                        ? "Geen percelen gevonden met de huidige filters."
                        : "Begin met het toevoegen van je eerste fysieke perceel."
                    }
                    action={
                      !searchQuery && selectedCrops.size === 0 && selectedVarieties.size === 0 && (
                        <Button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 rounded-full">
                          Nieuw Perceel
                        </Button>
                      )
                    }
                  />
                </div>
              )}
            </div>

            {/* Summary footer */}
            {!isLoading && !groupByMainParcel && filteredParcels.length > 0 && (
              <div className="shrink-0 px-4 py-3 bg-white/5 rounded-xl border border-white/10 flex justify-between items-center">
                <span className="text-sm text-white/50">
                  Totaal: <span className="font-bold text-white">{filteredParcels.length}</span> percelen
                </span>
                <div className="flex items-center gap-4">
                  {selectedParcelIds.size > 0 && (
                    <span className="text-sm text-primary/80 flex items-center gap-2">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="font-bold text-primary">{selectedParcelIds.size}</span> geselecteerd
                      <span className="text-white/20">•</span>
                      <span className="font-bold text-primary">{selectedParcelsArea.toFixed(2)}</span> ha
                      <button
                        onClick={() => setSelectedParcelIds(new Set())}
                        className="ml-1 text-[10px] text-white/30 hover:text-white/60 underline transition-colors"
                      >
                        wis
                      </button>
                      <button
                        onClick={() => { setGroupInitialSelectedIds(new Set(selectedParcelIds)); setIsGroupDialogOpen(true); }}
                        className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                      >
                        <FolderPlus className="h-3 w-3" />
                        Opslaan als groep
                      </button>
                    </span>
                  )}
                  <span className="text-sm text-white/50">
                    <span className="font-bold text-white">{totalFilteredArea.toFixed(2)}</span> ha
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card className="bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/10 h-[calc(100vh-24rem)] overflow-hidden relative rounded-3xl">
            <RvoMap
              onParcelSelect={handleParcelSelect}
              onSelectionChange={handleSelectionChange}
              selectedParcel={selectedRvoParcels[0] || null}
              selectedParcels={selectedRvoParcels}
              selectionMode="multi"
              userParcels={parcels}
              onUserParcelClick={(p) => setSelectedMainParcel(p)}
              isDrawingEnabled={isDrawingMode}
              onGeometryChange={handleDrawnGeometry}
            />
            {/* Drawing mode toggle button */}
            <div className="absolute top-4 right-4 z-[1000]">
              {isDrawingMode ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsDrawingMode(false)}
                  className="shadow-lg rounded-full font-bold"
                >
                  <XIcon className="mr-2 h-4 w-4" />
                  Tekenen annuleren
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => { setIsDrawingMode(true); setIsSheetOpen(false); setSelectedRvoParcels([]); }}
                  className="shadow-lg rounded-full font-bold bg-primary hover:bg-primary/90"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Perceel intekenen
                </Button>
              )}
            </div>
            {/* Drawing mode info banner */}
            {isDrawingMode && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground rounded-full px-6 py-2 shadow-lg">
                <span className="text-sm font-bold">
                  Klik op de kaart om punten te plaatsen. Sluit af door op het eerste punt te klikken.
                </span>
              </div>
            )}
            {!isDrawingMode && selectedRvoParcels.length === 1 && (
              <RvoParcelSheet
                parcel={selectedRvoParcels[0]}
                isOpen={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                onAddParcel={() => handleAddFromRvo(false)}
              />
            )}
            {!isDrawingMode && selectedRvoParcels.length > 1 && (
              <RvoMultiSelectBar
                selectedParcels={selectedRvoParcels}
                onCancel={() => setSelectedRvoParcels([])}
                onAddSelected={(merge) => handleAddFromRvo(merge)}
              />
            )}
          </Card>
        )}
      </div>

      <ParcelFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        parcel={null}
        rvoData={rvoDataForForm}
        onSubmit={handleFormSubmit}
        userParcels={parcels}
      />

      {activeParcelForComposer && (
        <ParcelComposer
          isOpen={isComposerOpen}
          onOpenChange={setIsComposerOpen}
          totalArea={activeParcelForComposer.area}
          parcelName={activeParcelForComposer.name}
          initialItems={pendingSubParcels.length > 0 ? (pendingSubParcels as any) : undefined}
          onSave={handleComposerSave}
        />
      )}

      <ParcelGroupDialog
        isOpen={isGroupDialogOpen}
        onOpenChange={setIsGroupDialogOpen}
        allParcels={parcels}
        initialSelectedIds={groupInitialSelectedIds}
        onSave={async (name, subParcelIds) => {
          try {
            const group = await addParcelGroup(name);
            await setParcelGroupMembers(group.id, subParcelIds);
            invalidateParcelGroups();
            setSelectedParcelIds(new Set());
            toast({ title: 'Groep aangemaakt', description: `"${name}" met ${subParcelIds.length} percelen` });
          } catch (e: any) {
            toast({ variant: 'destructive', title: 'Fout', description: e.message?.includes('duplicate') ? 'Er bestaat al een groep met deze naam' : 'Kon groep niet aanmaken' });
          }
        }}
      />
    </div>
  );
}
