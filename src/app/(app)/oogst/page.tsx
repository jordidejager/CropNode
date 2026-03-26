'use client';

import * as React from 'react';
import { Plus, List, Calendar, Filter, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useHarvestRegistrations,
  useHarvestSeasons,
  useCreateHarvestRegistration,
  useUpdateHarvestRegistration,
  useDeleteHarvestRegistration,
} from '@/hooks/use-data';
import {
  HarvestDateGroup,
  HarvestRegistrationForm,
} from '@/components/harvest';
import type { HarvestRegistration, HarvestRegistrationInput } from '@/lib/types';

type ViewMode = 'list' | 'day';

export default function HarvestRegistrationPage() {
  const { toast } = useToast();

  // State
  const [viewMode, setViewMode] = React.useState<ViewMode>('list');
  const [selectedSeason, setSelectedSeason] = React.useState<string>('');
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingHarvest, setEditingHarvest] = React.useState<HarvestRegistration | null>(null);
  const [deletingHarvest, setDeletingHarvest] = React.useState<HarvestRegistration | null>(null);

  // Data
  const { data: seasons = [], isLoading: seasonsLoading } = useHarvestSeasons();
  const { data: harvests = [], isLoading: harvestsLoading } = useHarvestRegistrations(
    selectedSeason ? { season: selectedSeason } : undefined
  );

  // Mutations
  const createMutation = useCreateHarvestRegistration();
  const updateMutation = useUpdateHarvestRegistration();
  const deleteMutation = useDeleteHarvestRegistration();

  // Set default season on load
  React.useEffect(() => {
    if (seasons.length > 0 && !selectedSeason) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  // Group harvests by date
  const harvestsByDate = React.useMemo(() => {
    const groups: Map<string, HarvestRegistration[]> = new Map();

    for (const harvest of harvests) {
      const dateKey = harvest.harvestDate.toISOString().split('T')[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(harvest);
    }

    // Sort dates descending
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateStr, items]) => ({
        date: new Date(dateStr),
        harvests: items,
      }));
  }, [harvests]);

  // Calculate totals
  const totalCrates = harvests.reduce((sum, h) => sum + h.totalCrates, 0);
  const storedCrates = harvests.reduce((sum, h) => sum + (h.storedCrates || 0), 0);

  // Handlers
  const handleCreateOrUpdate = async (data: HarvestRegistrationInput) => {
    try {
      if (editingHarvest) {
        await updateMutation.mutateAsync({
          id: editingHarvest.id,
          updates: data,
        });
        toast({
          title: 'Oogst bijgewerkt',
          description: 'De oogstregistratie is succesvol bijgewerkt.',
        });
      } else {
        await createMutation.mutateAsync(data);
        toast({
          title: 'Oogst geregistreerd',
          description: `${data.totalCrates} kisten zijn geregistreerd.`,
        });
      }
      setIsFormOpen(false);
      setEditingHarvest(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: error instanceof Error ? error.message : 'Er is een fout opgetreden.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingHarvest) return;

    try {
      await deleteMutation.mutateAsync(deletingHarvest.id);
      toast({
        title: 'Oogst verwijderd',
        description: 'De oogstregistratie is verwijderd.',
      });
      setDeletingHarvest(null);
    } catch (error) {
      toast({
        title: 'Fout',
        description: error instanceof Error ? error.message : 'Er is een fout opgetreden.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (harvest: HarvestRegistration) => {
    setEditingHarvest(harvest);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingHarvest(null);
    setIsFormOpen(true);
  };

  const isLoading = seasonsLoading || harvestsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <CardTitle>Oogstregistratie</CardTitle>
          <CardDescription>
            Registreer en beheer je oogstgegevens per perceel.
          </CardDescription>
        </div>
        <Button
          onClick={handleAdd}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe Oogst
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <TabsList>
            <TabsTrigger value="list">
              <List className="h-4 w-4 mr-2" />
              Lijst
            </TabsTrigger>
            <TabsTrigger value="day">
              <Calendar className="h-4 w-4 mr-2" />
              Dagweergave
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          {/* Season filter */}
          {seasons.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Seizoen" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((season) => (
                    <SelectItem key={season} value={season}>
                      {season}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Season totals */}
          {harvests.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{totalCrates}</span>
              <span className="text-muted-foreground">kisten totaal</span>
              <span className="text-xs text-muted-foreground">
                ({storedCrates} opgeslagen)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : harvests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/10 rounded-lg">
          <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Geen oogstregistraties
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            {selectedSeason
              ? `Er zijn nog geen oogstregistraties voor seizoen ${selectedSeason}.`
              : 'Begin met het registreren van je oogst.'}
          </p>
          <Button
            onClick={handleAdd}
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Eerste oogst registreren
          </Button>
        </div>
      ) : viewMode === 'list' ? (
        // List view: grouped by date
        <div className="space-y-6">
          {harvestsByDate.map(({ date, harvests: dateHarvests }) => (
            <HarvestDateGroup
              key={date.toISOString()}
              date={date}
              harvests={dateHarvests}
              onEditHarvest={handleEdit}
              onDeleteHarvest={setDeletingHarvest}
            />
          ))}
        </div>
      ) : (
        // Day view: TODO - implement spreadsheet-style bulk entry
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/10 rounded-lg">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Dagweergave</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Bulk invoer voor een specifieke dag komt binnenkort beschikbaar.
          </p>
        </div>
      )}

      {/* Registration form modal */}
      <HarvestRegistrationForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={handleCreateOrUpdate}
        editingHarvest={editingHarvest}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingHarvest}
        onOpenChange={(open) => !open && setDeletingHarvest(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oogst verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze oogstregistratie wilt verwijderen?
              {deletingHarvest && (
                <span className="block mt-2 font-medium">
                  {deletingHarvest.variety} — {deletingHarvest.totalCrates} kisten
                </span>
              )}
              {deletingHarvest?.storedCrates && deletingHarvest.storedCrates > 0 && (
                <span className="block mt-1 text-orange-400">
                  Let op: {deletingHarvest.storedCrates} kisten zijn al gekoppeld aan opslag.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
