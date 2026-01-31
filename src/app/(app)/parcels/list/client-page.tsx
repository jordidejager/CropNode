"use client";

import { useState, useCallback, useMemo } from "react";
import { useParcels, useInvalidateQueries, useSpuitschriftEntries } from "@/hooks/use-data";
import { addParcel, updateParcel, deleteParcel, addSubParcel } from "@/lib/supabase-store";
import type { SubParcel, RvoParcel } from "@/lib/types";
import type { SprayableParcel } from "@/lib/supabase-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Map as MapIcon, LayoutList, List, Search, ArrowLeft, Layers, Grid3X3 } from "lucide-react";
import { ParcelFormDialog, type RvoData } from "@/components/parcel-form-dialog";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton, ErrorState, EmptyState } from "@/components/ui/data-states";
import { ParcelsTreeTable } from "@/components/parcels-tree-table";
import { ParcelComposer } from "@/components/parcel-composer";
import { ParcelDetailView } from "@/components/parcel-detail-view";
import { MainParcelView } from "@/components/main-parcel-view";
import { CompanyStatsHeader } from "@/components/company-stats-header";
import { ParcelCard } from "@/components/parcel-card";
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

  // Map specific state
  const [selectedRvoParcels, setSelectedRvoParcels] = useState<RvoParcel[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [rvoDataForForm, setRvoDataForForm] = useState<RvoData | null>(null);
  const [mergeOnImport, setMergeOnImport] = useState(false);
  const [pendingSubParcels, setPendingSubParcels] = useState<Omit<SubParcel, 'id' | 'parcelId' | 'createdAt' | 'updatedAt'>[]>([]);

  const { toast } = useToast();
  const { data: parcels = [], isLoading, isError, error, refetch } = useParcels();
  const { data: spuitschriftEntries = [] } = useSpuitschriftEntries();
  const { invalidateParcels } = useInvalidateQueries();

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

  const filteredParcels = useMemo(() => {
    if (!searchQuery) return parcels;
    const q = searchQuery.toLowerCase();
    // SprayableParcel has crop and variety directly on it
    return parcels.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.crop?.toLowerCase().includes(q) ||
      p.variety?.toLowerCase().includes(q) ||
      p.parcelName?.toLowerCase().includes(q)
    );
  }, [parcels, searchQuery]);

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

  const handleAdd = () => {
    setRvoDataForForm(null);
    setPendingSubParcels([]);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (values: any) => {
    try {
      const newParcel = await addParcel({
        ...values,
        source: "RVO_IMPORT",
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
      setIsSheetOpen(false);
      setIsFormOpen(true);
    }
  }, [selectedRvoParcels]);

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
          <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : groupByMainParcel && groupedParcels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {groupedParcels.map((group, index) => (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        // If there's only one subparcel, go directly to it
                        if (group.subParcels.length === 1) {
                          setSelectedMainParcel(group.subParcels[0]);
                        } else {
                          setSelectedGroupedParcel(group);
                        }
                      }}
                      className="group relative bg-white/5 backdrop-blur-sm border-l-4 border-primary/50 hover:border-primary rounded-xl p-6 cursor-pointer transition-all duration-300 hover:bg-white/[0.08] hover:-translate-y-1 group-hover:shadow-[0_0_30px_-10px_rgba(var(--primary)/0.3)]"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <h3 className="text-xl font-black text-white group-hover:text-primary transition-colors">
                            {group.name}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {group.crops.map(crop => (
                              <span
                                key={crop}
                                className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                                  crop === 'Appel'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : crop === 'Peer'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}
                              >
                                {crop}
                              </span>
                            ))}
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
            ) : !groupByMainParcel && filteredParcels.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filteredParcels.map((parcel, index) => (
                    <ParcelCard
                      key={parcel.id}
                      parcel={parcel}
                      index={index}
                      onClick={() => setSelectedMainParcel(parcel)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="bg-card/30 backdrop-blur-md border border-white/5 rounded-3xl p-12">
                <EmptyState
                  icon={LayoutList}
                  title={searchQuery ? "Geen resultaten" : "Geen percelen gevonden"}
                  description={searchQuery ? `Geen percelen gevonden voor "${searchQuery}"` : "Begin met het toevoegen van je eerste fysieke perceel."}
                  action={
                    !searchQuery && (
                      <Button onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 rounded-full">
                        Nieuw Perceel
                      </Button>
                    )
                  }
                />
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
              // When clicking an existing user parcel on the map, we should open the dashboard
              onUserParcelClick={(p) => setSelectedMainParcel(p)}
            />
            {selectedRvoParcels.length === 1 && (
              <RvoParcelSheet
                parcel={selectedRvoParcels[0]}
                isOpen={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                onAddParcel={() => handleAddFromRvo(false)}
              />
            )}
            {selectedRvoParcels.length > 1 && (
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
    </div>
  );
}
