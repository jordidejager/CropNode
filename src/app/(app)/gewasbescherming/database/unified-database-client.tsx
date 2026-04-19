'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, Shield, Leaf, Wheat,
  Droplets, Bug, Sprout, TrendingUp,
  Building2, Hash, Droplet, Combine,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductCard } from '@/components/product-card';
import { FertilizerCard } from '@/components/fertilizer-card';
import { FertilizerDetailDialog } from '@/components/fertilizer-detail-dialog';
import { CtgbCategoryBadge } from '@/components/ctgb-category-badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import type { CtgbGebruiksvoorschrift, FertilizerProduct } from '@/lib/types';
import type { PaletteColor } from '@/components/ui/premium';

// ============================================
// Types
// ============================================

type Segment = 'gwb' | 'blad' | 'strooien';

// ============================================
// Sector definitions — crop keyword groups for CTGB filtering
// ============================================

type SectorId = 'hardfruit' | 'steenfruit' | 'aardappelen' | 'akkerbouw' | 'groenten' | 'bollen' | 'boomkwekerij' | 'alle';

const SECTORS: { id: SectorId; label: string; keywords: string[] }[] = [
  {
    id: 'hardfruit',
    label: 'Hardfruit (appel & peer)',
    keywords: ['appel', 'appels', 'appelboom', 'peer', 'peren', 'perenboom', 'pitvruchten', 'pitvrucht', 'pitfruit', 'vruchtbomen', 'vruchtboom', 'malus', 'pyrus'],
  },
  {
    id: 'steenfruit',
    label: 'Steenfruit (kers, pruim)',
    keywords: ['kers', 'kersen', 'pruim', 'pruimen', 'steenvruchten', 'steenvrucht', 'perzik', 'abrikoos', 'prunus'],
  },
  {
    id: 'aardappelen',
    label: 'Aardappelen',
    keywords: ['aardappel', 'aardappelen', 'pootaardappel', 'consumptieaardappel', 'zetmeelaardappel'],
  },
  {
    id: 'akkerbouw',
    label: 'Akkerbouw',
    keywords: ['graan', 'tarwe', 'gerst', 'haver', 'rogge', 'mais', 'suikerbiet', 'koolzaad', 'akkerbouw'],
  },
  {
    id: 'groenten',
    label: 'Groenten',
    keywords: ['ui', 'uien', 'prei', 'kool', 'sla', 'wortel', 'wortelen', 'tomaat', 'paprika', 'groente', 'groenten'],
  },
  {
    id: 'bollen',
    label: 'Bloembollen',
    keywords: ['tulp', 'tulpen', 'lelie', 'narcis', 'hyacint', 'bloembollen', 'bollen'],
  },
  {
    id: 'boomkwekerij',
    label: 'Boomkwekerij',
    keywords: ['boomkwekerij', 'laanbomen', 'siergewassen', 'bosplantsoen', 'vaste planten'],
  },
  {
    id: 'alle',
    label: 'Alle sectoren',
    keywords: [],
  },
];

type CtgbProductInList = {
  id: string;
  toelatingsnummer: string;
  naam: string;
  werkzameStoffen: string[];
  status: string;
  gebruiksvoorschriften: CtgbGebruiksvoorschrift[];
  categorie: string;
  toelatingshouder?: string;
  productTypes?: string[];
  popularity?: number;
};

interface UnifiedDatabaseClientProps {
  ctgbProducts: CtgbProductInList[];      // All CTGB products (unfiltered)
  ctgbHardfruit: CtgbProductInList[];     // Pre-filtered for hardfruit (default view)
  fertilizers: FertilizerProduct[];
}

// ============================================
// Segment config
// ============================================

const segmentConfig = [
  { id: 'gwb' as const, label: 'Gewasbescherming', shortLabel: 'Middelen', icon: Shield, palette: 'emerald' as PaletteColor, active: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400' },
  { id: 'blad' as const, label: 'Bladmeststoffen', shortLabel: 'Blad', icon: Leaf, palette: 'green' as PaletteColor, active: 'border-green-500/60 bg-green-500/10 text-green-400' },
  { id: 'strooien' as const, label: 'Strooimeststoffen', shortLabel: 'Strooien', icon: Wheat, palette: 'amber' as PaletteColor, active: 'border-amber-500/60 bg-amber-500/10 text-amber-400' },
];

// GWB type filters — with product card palette colors
const gwbFilterConfig = [
  { id: 'fungicide', label: 'Fungicide', icon: Droplets, palette: 'purple' as PaletteColor, active: 'bg-purple-500/15 border-purple-500/50 text-purple-400', hover: 'hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30' },
  { id: 'insecticide', label: 'Insecticide', icon: Bug, palette: 'orange' as PaletteColor, active: 'bg-rose-500/15 border-rose-500/50 text-rose-400', hover: 'hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30' },
  { id: 'herbicide', label: 'Herbicide', icon: Sprout, palette: 'amber' as PaletteColor, active: 'bg-amber-500/15 border-amber-500/50 text-amber-400', hover: 'hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30' },
  { id: 'groeiregulator', label: 'Groeiregulator', icon: TrendingUp, palette: 'blue' as PaletteColor, active: 'bg-blue-500/15 border-blue-500/50 text-blue-400', hover: 'hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30' },
] as const;

// Meststof category filters
const fertCategoryConfig = [
  { id: 'Leaf', label: 'Blad', icon: Droplet, active: 'bg-green-500/15 border-green-500/50 text-green-400', hover: 'hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30' },
  { id: 'Soil', label: 'Bodem', icon: Combine, active: 'bg-amber-500/15 border-amber-500/50 text-amber-400', hover: 'hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30' },
  { id: 'Fertigation', label: 'Fertigatie', icon: Sprout, active: 'bg-blue-500/15 border-blue-500/50 text-blue-400', hover: 'hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30' },
] as const;

// Determine product card palette color from product types
function getProductPalette(productTypes?: string[]): PaletteColor {
  if (!productTypes || productTypes.length === 0) return 'emerald';
  const types = productTypes.map(t => t.toLowerCase());
  if (types.some(t => t.includes('fungicide'))) return 'purple';
  if (types.some(t => t.includes('insecticide'))) return 'orange';
  if (types.some(t => t.includes('herbicide'))) return 'amber';
  if (types.some(t => t.includes('groeiregulator'))) return 'blue';
  return 'emerald';
}

// ============================================
// DosageSelector (re-used from original)
// ============================================

const DosageSelector: React.FC<{ voorschriften: CtgbGebruiksvoorschrift[] }> = ({ voorschriften }) => {
  const relevantCrops = ['appel', 'peer', 'pitvruchten'];
  const pomeFruitVoorschriften = voorschriften.filter(v =>
    v.gewas && relevantCrops.some(crop => v.gewas.toLowerCase().includes(crop))
  );
  const allVoorschriften = pomeFruitVoorschriften.length > 0 ? pomeFruitVoorschriften : voorschriften;
  const [selectedVoorschrift, setSelectedVoorschrift] = React.useState(allVoorschriften[0]);

  if (!selectedVoorschrift) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="font-mono text-primary font-bold h-10 px-3 flex items-center gap-2 bg-primary/10 hover:bg-primary/20 hover:text-primary rounded-lg border border-primary/30"
        >
          <span className="text-xs text-primary/70 font-bold uppercase tracking-wider">Dosis</span>
          <span className="text-base">{selectedVoorschrift.dosering || '—'}</span>
          {allVoorschriften.length > 1 && <ChevronDown className="h-4 w-4 opacity-70" />}
        </Button>
      </DropdownMenuTrigger>
      {allVoorschriften.length > 1 && (
        <DropdownMenuContent align="end" className="w-72">
          {allVoorschriften.map((item, index) => (
            <DropdownMenuItem key={index} onSelect={() => setSelectedVoorschrift(item)} className="cursor-pointer py-3">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">{item.gewas}</span>
                <span className="font-mono font-bold text-primary text-base">{item.dosering}</span>
                {item.maxToepassingen && <span className="text-xs text-muted-foreground/80">Max. {item.maxToepassingen}× per jaar</span>}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
};

// ============================================
// Main Component
// ============================================

export function UnifiedDatabaseClient({ ctgbProducts, ctgbHardfruit, fertilizers }: UnifiedDatabaseClientProps) {
  const [segment, setSegment] = React.useState<Segment>('gwb');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [gwbFilter, setGwbFilter] = React.useState<string | null>(null);
  const [fertFilter, setFertFilter] = React.useState<string | null>(null);
  const [sector, setSector] = React.useState<SectorId>('hardfruit');
  const [selectedFertilizer, setSelectedFertilizer] = React.useState<FertilizerProduct | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const router = useRouter();

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Reset sub-filter when switching segments
  React.useEffect(() => {
    setGwbFilter(null);
    setFertFilter(null);
    setSearchTerm('');
  }, [segment]);

  // Filter CTGB by sector
  const sectorFilteredCtgb = React.useMemo(() => {
    if (sector === 'hardfruit') return ctgbHardfruit; // Use pre-filtered list
    if (sector === 'alle') return ctgbProducts;

    const sectorDef = SECTORS.find(s => s.id === sector);
    if (!sectorDef) return ctgbProducts;

    // Word-boundary matching to avoid "aardappel" matching "appel"
    const matchesCrop = (gewas: string, keyword: string) => {
      const regex = new RegExp(`(^|[\\s,;/()]+)${keyword}([\\s,;/()]+|$)`, 'i');
      return regex.test(gewas);
    };

    // Skip overly broad GV entries (boomkwekerij with 8+ crops listed)
    const isSpecificGV = (gewas: string, sectorId: SectorId) => {
      const cropCount = gewas.split(',').length;
      if (cropCount > 8 && sectorId === 'hardfruit') {
        const startsWithHardfruit = /^\s*(appel|peer|pitvruchten|pitvrucht|vruchtbomen)\b/i.test(gewas);
        const isPitvruchten = gewas.toLowerCase().startsWith('pitvruchten') || gewas.toLowerCase().startsWith('pitvrucht');
        return startsWithHardfruit || isPitvruchten;
      }
      return true;
    };

    return ctgbProducts.filter(product =>
      product.gebruiksvoorschriften?.some(gv =>
        gv.gewas &&
        isSpecificGV(gv.gewas, sector) &&
        sectorDef.keywords.some(kw => matchesCrop(gv.gewas!, kw))
      )
    );
  }, [ctgbProducts, ctgbHardfruit, sector]);

  // Deduplicate CTGB products on toelatingsnummer
  const dedupedCtgb = React.useMemo(() => {
    const seen = new Set<string>();
    return sectorFilteredCtgb.filter(p => {
      if (seen.has(p.toelatingsnummer)) return false;
      seen.add(p.toelatingsnummer);
      return true;
    });
  }, [sectorFilteredCtgb]);

  // Filter meststoffen by segment type
  const bladFertilizers = React.useMemo(
    () => fertilizers.filter(f => f.category === 'Leaf'),
    [fertilizers]
  );
  const strooiFertilizers = React.useMemo(
    () => fertilizers.filter(f => f.category === 'Soil' || f.category === 'Fertigation'),
    [fertilizers]
  );

  // Counts for segment buttons
  const counts = {
    gwb: dedupedCtgb.length,
    blad: bladFertilizers.length,
    strooien: strooiFertilizers.length,
  };

  // Filtered GWB products
  const filteredGwb = React.useMemo(() => {
    let results = dedupedCtgb;
    if (gwbFilter) {
      results = results.filter(p => {
        const types = p.productTypes?.map(t => t.toLowerCase()) || [];
        return types.some(t => t.includes(gwbFilter));
      });
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      results = results.filter(p =>
        p.naam.toLowerCase().includes(q) ||
        p.werkzameStoffen.some(s => s.toLowerCase().includes(q))
      );
    }
    return results;
  }, [dedupedCtgb, gwbFilter, debouncedSearch]);

  // Filtered fertilizers for active segment
  const filteredFert = React.useMemo(() => {
    const base = segment === 'blad' ? bladFertilizers : strooiFertilizers;
    let results = base;
    if (fertFilter) {
      results = results.filter(f => f.category === fertFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      results = results.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.manufacturer.toLowerCase().includes(q) ||
        Object.keys(f.composition || {}).some(k => k.toLowerCase().includes(q))
      );
    }
    return results;
  }, [segment, bladFertilizers, strooiFertilizers, fertFilter, debouncedSearch]);

  const handleShowFertDetails = (f: FertilizerProduct) => {
    setSelectedFertilizer(f);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Segment Switch — chunky chunky, grote tap targets */}
      <div className="grid grid-cols-3 gap-3">
        {segmentConfig.map(({ id, label, shortLabel, icon: Icon, active }) => (
          <button
            key={id}
            onClick={() => setSegment(id)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 min-h-[108px] transition-all duration-200',
              segment === id
                ? cn(active, 'shadow-lg shadow-current/5')
                : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.04]'
            )}
          >
            <Icon className={cn('h-6 w-6', segment === id ? '' : 'opacity-60')} />
            <span className="text-base font-semibold leading-tight text-center">
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </span>
            <span className={cn(
              'text-2xl font-bold tabular-nums',
              segment === id ? 'text-white' : 'text-white/60'
            )}>
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      {/* Sector filter (only for GWB segment) */}
      {segment === 'gwb' && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base text-slate-300 font-medium whitespace-nowrap">Sector:</span>
          <Select value={sector} onValueChange={(val) => setSector(val as SectorId)}>
            <SelectTrigger className="w-[280px] h-12 text-base bg-white/[0.02] border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTORS.map(s => (
                <SelectItem key={s.id} value={s.id} className="text-base py-3">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder={
            segment === 'gwb'
              ? 'Zoek op naam of werkzame stof...'
              : 'Zoek op naam, element of fabrikant...'
          }
          className="pl-12 h-14 text-base bg-white/[0.02] border-white/10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Filters — always show text labels, chunky buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {segment === 'gwb' ? (
          gwbFilterConfig.map(({ id, label, icon: Icon, active, hover }) => (
            <Button
              key={id}
              variant="outline"
              onClick={() => setGwbFilter(prev => prev === id ? null : id)}
              className={cn(
                'h-12 px-5 text-base border-dashed transition-all duration-200 flex-1 sm:flex-none min-w-[140px]',
                gwbFilter === id ? active : cn('border-white/10', hover)
              )}
            >
              <Icon className="mr-2 h-5 w-5" />
              {label}
            </Button>
          ))
        ) : (
          fertCategoryConfig
            .filter(({ id }) => {
              if (segment === 'blad') return id === 'Leaf';
              return id === 'Soil' || id === 'Fertigation';
            })
            .map(({ id, label, icon: Icon, active, hover }) => (
              <Button
                key={id}
                variant="outline"
                onClick={() => setFertFilter(prev => prev === id ? null : id)}
                className={cn(
                  'h-12 px-5 text-base border-dashed transition-all duration-200 flex-1 sm:flex-none min-w-[140px]',
                  fertFilter === id ? active : cn('border-white/10', hover)
                )}
              >
                <Icon className="mr-2 h-5 w-5" />
                {label}
              </Button>
            ))
        )}
      </div>

      {/* Result count */}
      <CardDescription className="text-base">
        {segment === 'gwb'
          ? `Gefilterd op ${SECTORS.find(s => s.id === sector)?.label.toLowerCase() || 'alle sectoren'}. ${filteredGwb.length} middelen gevonden.`
          : `${filteredFert.length} meststoffen gevonden.`
        }
      </CardDescription>

      {/* Product Grid */}
      <ScrollArea className="h-full">
        {segment === 'gwb' ? (
          filteredGwb.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-6">
              {filteredGwb.map(product => (
                <ProductCard
                  key={product.toelatingsnummer}
                  color={getProductPalette(product.productTypes)}
                  title={product.naam}
                  subtitle={product.werkzameStoffen.join(', ')}
                  labels={[
                    { label: 'Houder', value: product.toelatingshouder || '—', verified: true, icon: <Building2 className="h-3.5 w-3.5" /> },
                    { label: 'Nummer', value: product.toelatingsnummer, icon: <Hash className="h-3.5 w-3.5" /> },
                  ]}
                  categoryBadge={<CtgbCategoryBadge category={product.categorie} productTypes={product.productTypes} />}
                  status={{
                    label: product.status === 'Valid' ? 'Toegelaten' : product.status,
                    variant: product.status === 'Valid' ? 'default' : 'destructive',
                    className: product.status === 'Valid' ? 'bg-green-600/30 text-green-400 border-green-500/50' : undefined,
                  }}
                  footerExtra={<DosageSelector voorschriften={product.gebruiksvoorschriften} />}
                  onAction={() => router.push(`/gewasbescherming/database/${product.toelatingsnummer}`)}
                  actionLabel="Bekijk details"
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          filteredFert.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-6">
              {filteredFert.map(fertilizer => (
                <FertilizerCard
                  key={fertilizer.id}
                  fertilizer={fertilizer}
                  onShowDetails={handleShowFertDetails}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )
        )}
      </ScrollArea>

      <FertilizerDetailDialog
        fertilizer={selectedFertilizer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-56 text-base text-muted-foreground border rounded-2xl border-dashed border-white/10">
      Geen producten gevonden voor uw zoekopdracht.
    </div>
  );
}
