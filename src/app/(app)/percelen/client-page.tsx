"use client";

import { useState, useCallback, useMemo } from "react";
import { useParcels, useParcelGroups, useInvalidateQueries, useSpuitschriftEntries } from "@/hooks/use-data";
import { addParcel, updateParcel, deleteParcel, addSubParcel, addParcelGroup, deleteParcelGroup, setParcelGroupMembers } from "@/lib/supabase-store";
import type { Parcel, SubParcel, RvoParcel } from "@/lib/types";
import type { SprayableParcel } from "@/lib/supabase-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Map as MapIcon, LayoutList, List, Search, ArrowLeft, Layers, Grid3X3, ArrowUpDown, ArrowUp, ArrowDown, Eye, Apple, Leaf, Pencil, X as XIcon, FolderPlus, Trash2, ChevronDown, ChevronRight, Merge, FlaskConical, TreePine, Boxes } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SoilAnalysisPanel } from "@/components/domain/soil-analysis-panel";
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
import { ParcelReorganizeDialog } from "@/components/domain/parcel-reorganize-dialog";
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedMainParcel, setSelectedMainParcel] = useState<Parcel | SprayableParcel | null>(null);
  const [selectedGroupedParcel, setSelectedGroupedParcel] = useState<GroupedParcel | null>(null);
  const [selectedSubParcel, setSelectedSubParcel] = useState<SubParcel | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [activeParcelForComposer, setActiveParcelForComposer] = useState<Parcel | SprayableParcel | null>(null);
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
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingParcel, setOnboardingParcel] = useState<any>(null);
  const [mapOverlay, setMapOverlay] = useState<'standaard' | 'laatste_spray' | 'bodem_ph' | 'ziektedruk'>('standaard');
  const [formSource, setFormSource] = useState<"RVO_IMPORT" | "MANUAL">("RVO_IMPORT");

  // Groups
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isReorganizeOpen, setIsReorganizeOpen] = useState(false);
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

  const toggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((group: GroupedParcel) => {
    const groupIds = group.subParcels.map(p => p.id);
    const allSelected = groupIds.every(id => selectedParcelIds.has(id));
    setSelectedParcelIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach(id => next.delete(id));
      } else {
        groupIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [selectedParcelIds]);

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

      // Show onboarding wizard to explain block concept
      setOnboardingParcel(newParcel);
      setShowOnboardingWizard(true);

      toast({ title: 'Perceel aangemaakt', description: 'Kies hoe je het perceel wilt indelen.' });

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
        parcel={selectedMainParcel as Parcel}
        onBack={() => setSelectedMainParcel(null)}
        onSubParcelClick={(sub) => setSelectedSubParcel(sub)}
        lastSpray={lastSprayForParcel}
      />
    )
  }

  // Grouped parcel view - hoofdperceel overview met subpercelen
  if (selectedGroupedParcel) {
    const gp = selectedGroupedParcel;
    const cropSet = new Set(gp.subParcels.map(p => p.crop));
    const varietySet = new Set(gp.subParcels.map(p => p.variety).filter(Boolean));
    // Use the first sub_parcel's parcelId as the real parcels-table ID (for grondmonster upload)
    const realParcelId = (gp.subParcels[0] as unknown as { parcelId?: string })?.parcelId;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
        {/* Hero Header */}
        <div className="relative h-56 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/80 via-slate-900 to-black" />
          <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex justify-between items-end">
              <div className="space-y-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedGroupedParcel(null)} className="text-white/60 hover:text-white -ml-2 gap-2">
                  <ArrowLeft className="h-4 w-4" /> Terug naar overzicht
                </Button>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-black text-white">{gp.name}</h1>
                  <span className="inline-flex items-center justify-center h-7 min-w-[1.75rem] px-2.5 rounded-full bg-primary/20 border border-primary/30 text-sm font-black text-primary">
                    {gp.subParcels.length}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-white/50 text-sm font-medium">
                  <span>{gp.totalArea.toFixed(2)} ha totaal</span>
                  <span>&middot;</span>
                  <span>{gp.subParcels.length} blokken</span>
                  <span>&middot;</span>
                  <span>{varietySet.size} rassen</span>
                </div>
              </div>
              <div className="flex gap-2">
                {gp.crops.map(crop => {
                  const colors = getCropColor(crop);
                  return (
                    <span key={crop} className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${colors.bg} ${colors.text}`}>
                      {crop === 'Appel' ? <Apple className="h-3 w-3" /> : <Leaf className="h-3 w-3" />}
                      {crop}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Oppervlakte", value: `${gp.totalArea.toFixed(2)} ha`, color: "text-blue-400" },
            { label: "Blokken", value: `${gp.subParcels.length}`, color: "text-emerald-400" },
            { label: "Gewassen", value: `${cropSet.size}`, color: "text-amber-400" },
            { label: "Rassen", value: `${varietySet.size}`, color: "text-purple-400" },
          ].map((kpi, i) => (
            <div key={i} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-black mt-1 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Grondmonster upload — op hoofdperceel-niveau */}
        {realParcelId && (
          <div className="space-y-3">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Grondmonsters (hoofdperceel)
            </h3>
            <p className="text-xs text-white/30">
              Grondmonsters die hier worden geüpload gelden voor alle {gp.subParcels.length} blokken, tenzij een blok een eigen grondmonster heeft.
            </p>
            <SoilAnalysisPanel parcelId={realParcelId} />
          </div>
        )}

        {/* Subpercelen grid */}
        <div className="space-y-3">
          <h3 className="text-lg font-black text-white">Blokken</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gp.subParcels.map((parcel, index) => {
              const crop = parcel.crop || 'Onbekend';
              const colors = getCropColor(crop);
              return (
                <motion.div
                  key={parcel.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedMainParcel(parcel)}
                  className="group relative rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-5 cursor-pointer hover:border-white/[0.12] hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg}`}>
                        {crop === 'Appel' ? <Apple className={`h-5 w-5 ${colors.text}`} /> : <Leaf className={`h-5 w-5 ${colors.text}`} />}
                      </div>
                      <div>
                        <h4 className="font-black text-white group-hover:text-primary transition-colors">
                          {parcel.name.startsWith(gp.name) ? parcel.name.slice(gp.name.length).trim() || parcel.name : parcel.name}
                        </h4>
                        <p className="text-[10px] text-white/30 uppercase font-bold">{parcel.variety}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/10 group-hover:text-primary/50 transition-colors" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-bold text-white/60">{(parcel.area || 0).toFixed(2)} ha</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>{crop}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
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
            variant="outline"
            onClick={() => setIsReorganizeOpen(true)}
            className="flex-1 md:flex-none border-white/10 font-bold gap-2 h-12 rounded-full bg-white/5 hover:bg-white/10"
          >
            <Merge className="h-4 w-4" />
            <span className="hidden md:inline">Reorganiseren</span>
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
              ) : groupedParcels.length > 0 ? (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                  {groupedParcels.map((group, groupIndex) => {
                    const isExpanded = expandedGroups.has(group.id);
                    const groupAllSelected = group.subParcels.every(p => selectedParcelIds.has(p.id));
                    const groupSomeSelected = !groupAllSelected && group.subParcels.some(p => selectedParcelIds.has(p.id));
                    const isSingleParcel = group.subParcels.length === 1;
                    const primaryCrop = group.crops[0] || 'Onbekend';
                    const borderColor = primaryCrop === 'Appel' ? 'border-l-rose-500/50' : primaryCrop === 'Peer' ? 'border-l-emerald-500/50' : 'border-l-amber-500/50';
                    const glowColor = primaryCrop === 'Appel' ? 'hover:shadow-rose-500/5' : primaryCrop === 'Peer' ? 'hover:shadow-emerald-500/5' : 'hover:shadow-amber-500/5';

                    return (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: groupIndex * 0.03, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className={`group/card relative rounded-2xl border-l-[3px] ${borderColor} border border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent overflow-hidden transition-all duration-300 hover:shadow-xl ${glowColor} hover:border-white/[0.1] ${
                          groupAllSelected ? 'ring-1 ring-primary/20 bg-primary/[0.03]' : ''
                        }`}
                      >
                        {/* Group Header */}
                        <div
                          className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                          onClick={() => {
                            if (isSingleParcel) {
                              setSelectedMainParcel(group.subParcels[0]);
                            } else {
                              toggleGroupExpand(group.id);
                            }
                          }}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroupSelection(group); }}
                            className={`h-5 w-5 rounded-lg border-2 transition-all duration-300 flex items-center justify-center shrink-0 ${
                              groupAllSelected
                                ? 'bg-primary border-primary shadow-lg shadow-primary/30 scale-110'
                                : groupSomeSelected
                                ? 'border-primary/50 bg-primary/20'
                                : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                            }`}
                          >
                            {groupAllSelected && (
                              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            )}
                            {groupSomeSelected && !groupAllSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                          </button>

                          {/* Expand indicator */}
                          {!isSingleParcel && (
                            <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
                              <ChevronRight className="h-4 w-4 text-white/20" />
                            </div>
                          )}

                          {/* Bekijk hoofdperceel button — links naast naam */}
                          {!isSingleParcel && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedGroupedParcel(group); }}
                              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-200 shrink-0"
                              title="Bekijk hoofdperceel"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Name + meta */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h3 className="font-black text-[17px] text-white truncate group-hover/card:text-primary transition-colors duration-300">
                                {group.name}
                              </h3>
                              {!isSingleParcel && (
                                <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 rounded-full bg-white/[0.06] text-[11px] font-bold text-white/40 tabular-nums">
                                  {group.subParcels.length}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {group.varieties.slice(0, 4).map((v, i) => (
                                <span key={v} className="text-[11px] text-white/25">
                                  {i > 0 && <span className="mr-1.5">&middot;</span>}{v}
                                </span>
                              ))}
                              {group.varieties.length > 4 && (
                                <span className="text-[11px] text-white/15">+{group.varieties.length - 4}</span>
                              )}
                            </div>
                          </div>

                          {/* Crop badges */}
                          <div className="flex items-center gap-2 shrink-0">
                            {group.crops.map(crop => {
                              const colors = getCropColor(crop);
                              return (
                                <span key={crop} className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${colors.bg} ${colors.text} backdrop-blur-sm`}>
                                  {crop === 'Appel' ? <Apple className="h-3 w-3" /> : <Leaf className="h-3 w-3" />}
                                  {crop}
                                </span>
                              );
                            })}
                          </div>

                          {/* Area */}
                          <div className="text-right shrink-0 w-24">
                            <span className="text-lg font-black text-white/80 tabular-nums tracking-tight">
                              {group.totalArea.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-white/25 ml-1">ha</span>
                          </div>

                        </div>

                        {/* Expanded Sub-parcels with tree connectors */}
                        {isExpanded && !isSingleParcel && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="border-t border-white/[0.04] bg-black/20"
                          >
                            {group.subParcels.map((parcel, i) => {
                              const crop = parcel.crop || 'Onbekend';
                              const isSelected = selectedParcelIds.has(parcel.id);
                              const displayName = parcel.name.startsWith(group.name)
                                ? parcel.name.slice(group.name.length).trim() || parcel.name
                                : parcel.name;
                              const accentColor = crop === 'Appel' ? 'bg-rose-500' : crop === 'Peer' ? 'bg-emerald-500' : 'bg-amber-500';

                              return (
                                <motion.div
                                  key={parcel.id}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.04, duration: 0.2 }}
                                  onClick={() => setSelectedMainParcel(parcel)}
                                  className={`group/row relative flex items-center gap-4 pl-10 pr-5 py-3 cursor-pointer transition-all duration-200 ${
                                    isSelected ? 'bg-primary/[0.08]' : 'hover:bg-white/[0.03]'
                                  } ${i > 0 ? 'border-t border-white/[0.03]' : ''}`}
                                >
                                  {/* Tree connector */}
                                  <div className="absolute left-[1.85rem] top-0 bottom-0 w-px bg-white/[0.06]" />
                                  <div className={`absolute left-[1.85rem] top-1/2 w-3 h-px ${isSelected ? 'bg-primary/40' : 'bg-white/[0.06]'}`} />
                                  <div className={`absolute left-[2.85rem] top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${isSelected ? accentColor : 'bg-white/10'} transition-colors`} />

                                  {/* Checkbox */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleParcelSelection(parcel.id); }}
                                    className={`h-4 w-4 rounded border-[1.5px] transition-all duration-200 flex items-center justify-center shrink-0 ml-4 ${
                                      isSelected ? 'bg-primary border-primary shadow-sm shadow-primary/20' : 'border-white/10 hover:border-white/25 bg-transparent'
                                    }`}
                                  >
                                    {isSelected && (
                                      <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    )}
                                  </button>

                                  {/* Name */}
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[13px] font-medium text-white/60 group-hover/row:text-white transition-colors duration-200 truncate block">
                                      {displayName}
                                    </span>
                                  </div>

                                  {/* Variety pill */}
                                  <div className="shrink-0 hidden lg:block">
                                    <span className="text-[11px] text-white/30 bg-white/[0.04] px-2.5 py-1 rounded-lg group-hover/row:text-white/50 transition-colors">
                                      {parcel.variety || '\u2014'}
                                    </span>
                                  </div>

                                  {/* Area */}
                                  <div className="w-20 text-right shrink-0">
                                    <span className="text-[13px] font-mono font-semibold text-white/40 tabular-nums group-hover/row:text-white/70 transition-colors">
                                      {(parcel.area || 0).toFixed(2)}
                                    </span>
                                    <span className="text-[9px] text-white/15 ml-0.5">ha</span>
                                  </div>

                                  {/* Arrow */}
                                  <ChevronRight className="h-3.5 w-3.5 text-white/0 group-hover/row:text-white/30 transition-all duration-200 shrink-0" />
                                </motion.div>
                              );
                            })}
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
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

            {/* Floating selection bar */}
            <AnimatePresence>
              {!isLoading && selectedParcelIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl bg-[#111]/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
                >
                  {/* Pulsing indicator */}
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                    </span>
                    <span className="text-sm font-bold text-white">{selectedParcelIds.size}</span>
                    <span className="text-sm text-white/50">geselecteerd</span>
                  </div>

                  <div className="w-px h-5 bg-white/10" />

                  {/* Area */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-mono font-bold text-primary">{selectedParcelsArea.toFixed(2)}</span>
                    <span className="text-[10px] text-white/30">ha</span>
                  </div>

                  <div className="w-px h-5 bg-white/10" />

                  {/* Actions */}
                  <button
                    onClick={() => { setGroupInitialSelectedIds(new Set(selectedParcelIds)); setIsGroupDialogOpen(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Opslaan als groep
                  </button>

                  <button
                    onClick={() => setSelectedParcelIds(new Set())}
                    className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-all duration-200"
                    title="Deselecteer alles"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Card className="bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/10 h-[calc(100vh-24rem)] overflow-hidden relative rounded-3xl">
            <RvoMap
              onParcelSelect={handleParcelSelect}
              onSelectionChange={handleSelectionChange}
              selectedParcel={selectedRvoParcels[0] || null}
              selectedParcels={selectedRvoParcels}
              selectionMode="multi"
              userParcels={parcels as unknown as Parcel[]}
              onUserParcelClick={(p) => setSelectedMainParcel(p)}
              isDrawingEnabled={isDrawingMode}
              onGeometryChange={handleDrawnGeometry}
              overlayMode={mapOverlay}
            />
            {/* Map overlay selector */}
            <div className="absolute top-4 left-4 z-[1000]">
              <div className="flex gap-1 bg-black/70 backdrop-blur-md rounded-full p-1 border border-white/10">
                {([
                  { value: 'standaard', label: 'Gewas' },
                  { value: 'laatste_spray', label: 'Laatste spray' },
                  { value: 'bodem_ph', label: 'Bodem pH' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMapOverlay(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                      mapOverlay === opt.value
                        ? 'bg-primary text-primary-foreground shadow-lg'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
        userParcels={parcels as unknown as Parcel[]}
      />

      {/* Onboarding wizard na import */}
      <Dialog open={showOnboardingWizard} onOpenChange={setShowOnboardingWizard}>
        <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-white">
              {onboardingParcel?.name || 'Perceel'} is aangemaakt
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Heeft dit perceel verschillende blokken met verschillende rassen of aanplantjaren?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={() => {
                setShowOnboardingWizard(false);
                if (onboardingParcel) {
                  setActiveParcelForComposer(onboardingParcel);
                  setIsComposerOpen(true);
                }
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all group"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Boxes className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-white text-sm">Ja, opdelen</p>
                <p className="text-[10px] text-white/30 mt-1">Meerdere rassen of blokken</p>
              </div>
            </button>
            <button
              onClick={async () => {
                setShowOnboardingWizard(false);
                if (onboardingParcel) {
                  // Maak automatisch 1 sub_parcel met dezelfde data
                  try {
                    await addSubParcel({
                      parcelId: onboardingParcel.id,
                      crop: onboardingParcel.crop || 'Peer',
                      variety: onboardingParcel.variety || '',
                      area: onboardingParcel.area || 0,
                    } as any);
                    invalidateParcels();
                    toast({ title: 'Blok aangemaakt', description: 'Perceel is klaar voor gebruik.' });
                  } catch (err) {
                    console.error(err);
                  }
                }
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-all group"
            >
              <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TreePine className="h-6 w-6 text-white/50" />
              </div>
              <div className="text-center">
                <p className="font-bold text-white text-sm">Nee, één blok</p>
                <p className="text-[10px] text-white/30 mt-1">Eén gewas, één ras</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {activeParcelForComposer && (
        <ParcelComposer
          isOpen={isComposerOpen}
          onOpenChange={setIsComposerOpen}
          totalArea={activeParcelForComposer.area ?? 0}
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

      <ParcelReorganizeDialog
        open={isReorganizeOpen}
        onOpenChange={setIsReorganizeOpen}
        onSuccess={() => {
          invalidateParcels();
          toast({ title: 'Percelen samengevoegd', description: 'De percelenlijst is bijgewerkt.' });
        }}
      />
    </div>
  );
}
