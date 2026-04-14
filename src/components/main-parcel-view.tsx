"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Parcel,
    SubParcel,
    SoilSample,
    ProductionHistory,
    SpuitschriftEntry,
    WeightedValue
} from "@/lib/types"
import {
    Activity,
    TrendingUp,
    Calendar,
    Layers,
    FileText,
    ArrowLeft,
    ChevronRight,
    MapPin,
    Sprout,
    Scale,
    Timer,
    AlertTriangle,
    CheckCircle2,
    Pencil,
    Save,
    X,
    Loader2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateSubParcel } from "@/lib/supabase-store"
import { supabase } from "@/lib/supabase-client"
import { RAS_SUGGESTIES } from "@/lib/parcel-profile-constants"
import { useInvalidateQueries } from "@/hooks/use-data"
import { useToast } from "@/hooks/use-toast"
import { GewasrotatieTimeline } from "@/components/domain/gewas-rotatie-timeline"
import { ParcelTimeline } from "@/components/domain/parcel-timeline"
import { useParcelSeasonKPIs } from "@/hooks/use-parcel-season-kpis"
import { ParcelProfileForm } from "@/components/domain/parcel-profile-form"
import { SoilAnalysisPanel } from "@/components/domain/soil-analysis-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'
import { format, differenceInYears } from "date-fns"
import { nl } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { CompositionSection } from "@/components/domain/dashboard/composition-section"

interface MainParcelViewProps {
    parcel: Parcel
    onBack: () => void
    onSubParcelClick: (subParcel: SubParcel) => void
    lastSpray?: SpuitschriftEntry
}

export function MainParcelView({
    parcel,
    onBack,
    onSubParcelClick,
    lastSpray
}: MainParcelViewProps) {
    const subParcels = parcel.subParcels || []
    const { data: seasonKPIs } = useParcelSeasonKPIs(parcel.id)
    const [isEditing, setIsEditing] = React.useState(false)
    const [editSaving, setEditSaving] = React.useState(false)
    const [editCrop, setEditCrop] = React.useState(parcel.crop || '')
    const [editVariety, setEditVariety] = React.useState(parcel.variety || '')
    const [editArea, setEditArea] = React.useState(String(parcel.area || ''))
    const { invalidateParcels } = useInvalidateQueries()
    const { toast } = useToast()

    const handleSaveEdit = React.useCallback(async () => {
        setEditSaving(true)
        try {
            const oldVariety = parcel.variety
            const oldCrop = parcel.crop

            // 1. Update sub_parcels (bron van waarheid)
            await updateSubParcel({
                id: parcel.id,
                crop: editCrop,
                variety: editVariety,
                area: Number(editArea) || 0,
            })

            // 2. Cascade: update ALLE tabellen die variety/crop als string kopie opslaan
            if (oldVariety !== editVariety || oldCrop !== editCrop) {
                // Spuitregistratie history
                await supabase
                    .from('parcel_history')
                    .update({ variety: editVariety, crop: editCrop })
                    .eq('parcel_id', parcel.id)

                // Opslag registraties
                await supabase
                    .from('cell_sub_parcels')
                    .update({ variety: editVariety })
                    .eq('sub_parcel_id', parcel.id)

                // Productie/oogst samenvattingen
                await supabase
                    .from('production_summaries')
                    .update({ variety: editVariety })
                    .eq('sub_parcel_id', parcel.id)
            }

            await invalidateParcels()
            toast({ title: 'Opgeslagen', description: 'Perceel gegevens zijn overal bijgewerkt.' })
            setIsEditing(false)
            parcel.crop = editCrop
            parcel.variety = editVariety
            parcel.area = Number(editArea) || 0
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Fout', description: err.message })
        } finally {
            setEditSaving(false)
        }
    }, [parcel, editCrop, editVariety, editArea, invalidateParcels, toast])

    // Calculate Aggregated KPIs and Composition Data
    // Parse location: kan een {lat,lng} object zijn (Parcel type) of een POINT(lng lat) string (SprayableParcel)
    const displayLocation = React.useMemo(() => {
        const loc = parcel.location as unknown;
        if (!loc) return null;
        if (typeof loc === 'string') {
            const match = loc.match(/POINT\(([^ ]+) ([^)]+)\)/);
            if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
            return null;
        }
        if (typeof loc === 'object' && 'lat' in (loc as object) && 'lng' in (loc as object)) {
            return loc as { lat: number; lng: number };
        }
        return null;
    }, [parcel.location])

    const { stats, composition, mutantComposition } = React.useMemo(() => {
        const currentYear = new Date().getFullYear()
        let totalArea = 0
        let totalTrees = 0
        let weightedAgeSum = 0
        let latestSoilSample: SoilSample | null = null

        // For mutant aggregation
        const mutantMap = new Map<string, number>()

        subParcels.forEach(sub => {
            totalArea += sub.area

            // Calc trees
            const distances = sub.plantingDistances || []
            let subTreesPerHa = 0
            if (distances.length > 0) {
                distances.forEach(d => {
                    if (d.value.row > 0 && d.value.tree > 0) {
                        subTreesPerHa += (10000 / (d.value.row * d.value.tree)) * (d.percentage / 100)
                    }
                })
            } else if (sub.plantingDistanceRow && sub.plantingDistanceTree) {
                subTreesPerHa = 10000 / (sub.plantingDistanceRow * sub.plantingDistanceTree)
            }
            totalTrees += Math.round(subTreesPerHa * sub.area)

            // Mutant aggregate
            const subMutants = sub.mutants && sub.mutants.length > 0
                ? sub.mutants
                : (sub.varietyMutant ? [{ value: sub.varietyMutant, percentage: 100 } as WeightedValue<string>] : [])

            subMutants.forEach(m => {
                const absArea = sub.area * (m.percentage / 100)
                mutantMap.set(m.value, (mutantMap.get(m.value) || 0) + absArea)
            })

            // Weighted Age
            const subYears = sub.plantingYears && sub.plantingYears.length > 0
                ? sub.plantingYears
                : (sub.plantingYear ? [{ value: sub.plantingYear, percentage: 100 } as WeightedValue<number>] : [])

            let avgSubAge = 0
            subYears.forEach(y => {
                avgSubAge += (currentYear - y.value) * (y.percentage / 100)
            })
            weightedAgeSum += avgSubAge * sub.area

            // Find latest soil sample
            if (sub.soilSamples && sub.soilSamples.length > 0) {
                const latest = sub.soilSamples.reduce((a, b) =>
                    new Date(a.sampleDate) > new Date(b.sampleDate) ? a : b
                )
                if (!latestSoilSample || new Date(latest.sampleDate) > new Date(latestSoilSample.sampleDate)) {
                    latestSoilSample = latest
                }
            }
        })

        const composition = subParcels.map(sub => ({
            name: sub.name || sub.variety,
            variety: sub.variety,
            area: sub.area,
            percentage: totalArea > 0 ? (sub.area / totalArea) * 100 : 0,
            color: sub.crop === 'Appel' ? '#ef4444' : '#22c55e'
        })).sort((a, b) => b.area - a.area)

        const mutantComposition = Array.from(mutantMap.entries())
            .map(([name, area]) => ({
                name: name || "Onbekend",
                area: area,
                percentage: totalArea > 0 ? (area / totalArea) * 100 : 0
            }))
            .sort((a, b) => b.area - a.area)

        // Fallback: als er geen subpercelen zijn, gebruik parcel.area direct
        const effectiveArea = totalArea > 0 ? totalArea : (parcel.area || 0)

        return {
            stats: {
                totalArea: effectiveArea,
                totalTrees,
                avgAge: effectiveArea > 0 && weightedAgeSum > 0 ? Math.round(weightedAgeSum / effectiveArea) : 0,
                density: effectiveArea > 0 && totalTrees > 0 ? Math.round(totalTrees / effectiveArea) : 0,
                latestSoilSample: latestSoilSample as SoilSample | null
            },
            composition,
            mutantComposition
        }
    }, [subParcels, parcel.area])

    // Prepare Production History (Stacked)
    const productionData = React.useMemo(() => {
        const yearMap: Record<number, any> = {}

        subParcels.forEach(sub => {
            if (sub.productionHistory) {
                sub.productionHistory.forEach(ph => {
                    if (!yearMap[ph.year]) {
                        yearMap[ph.year] = { year: ph.year.toString() }
                    }
                    const key = sub.name || sub.variety
                    yearMap[ph.year][key] = (yearMap[ph.year][key] || 0) + ph.tonnage
                })
            }
        })

        return Object.values(yearMap).sort((a, b) => parseInt(a.year) - parseInt(b.year))
    }, [subParcels])

    const varieties = Array.from(new Set(subParcels.map(sub => sub.name || sub.variety)))

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            {/* Executive Header */}
            <div className="relative h-64 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />

                <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex justify-between items-end">
                        <div className="space-y-2">
                            <Button variant="ghost" size="sm" onClick={onBack} className="text-white/60 hover:text-white -ml-2 gap-2">
                                <ArrowLeft className="h-4 w-4" /> Terug naar overzicht
                            </Button>
                            <div className="space-y-1">
                                {/* Toon hoofdperceel naam als die verschilt van de volledige naam */}
                                {(parcel as unknown as { parcelName?: string }).parcelName &&
                                 (parcel as unknown as { parcelName?: string }).parcelName !== parcel.name && (
                                    <p className="text-sm font-bold text-white/40 uppercase tracking-wider">
                                        {(parcel as unknown as { parcelName?: string }).parcelName}
                                    </p>
                                )}
                                <div className="flex items-center gap-3">
                                    <h1 className="text-4xl font-black text-white">{parcel.name}</h1>
                                    <Badge className="bg-primary/20 text-primary border-primary/30 font-bold px-3">
                                        {subParcels.length > 0 ? 'Hoofdperceel' : 'Perceel'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-white/50 font-medium">
                                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {displayLocation ? `${displayLocation.lat.toFixed(4)}, ${displayLocation.lng.toFixed(4)}` : 'Geen locatie'}</span>
                                <span className="flex items-center gap-1"><Scale className="h-4 w-4" /> {stats.totalArea.toFixed(2)} ha totaal</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => { setIsEditing(!isEditing); setEditCrop(parcel.crop || ''); setEditVariety(parcel.variety || ''); setEditArea(String(parcel.area || '')); }} className="bg-white/5 border-white/10 text-white font-bold rounded-full gap-2">
                                <Pencil className="h-3.5 w-3.5" /> Bewerken
                            </Button>
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 rounded-full shadow-lg shadow-primary/20">
                                Nieuwe Waarneming
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Inline Edit panel */}
            {isEditing && (
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" /> Perceel bewerken</h3>
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-white/40 hover:text-white">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1 block">Gewas</label>
                            <Select value={editCrop} onValueChange={setEditCrop}>
                                <SelectTrigger className="bg-white/[0.03] border-white/[0.08] h-10"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['Appel', 'Peer', 'Kers', 'Pruim', 'Overig'].map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1 block">Ras</label>
                            <Select value={editVariety} onValueChange={setEditVariety}>
                                <SelectTrigger className="bg-white/[0.03] border-white/[0.08] h-10"><SelectValue placeholder="Selecteer ras" /></SelectTrigger>
                                <SelectContent>
                                    {(RAS_SUGGESTIES[editCrop] || []).map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                    {/* Toon huidige waarde als die niet in de suggesties staat */}
                                    {editVariety && !(RAS_SUGGESTIES[editCrop] || []).includes(editVariety) && (
                                        <SelectItem value={editVariety}>{editVariety} (huidig)</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1 block">Oppervlakte (ha)</label>
                            <Input type="number" step="0.01" value={editArea} onChange={e => setEditArea(e.target.value)} className="bg-white/[0.03] border-white/[0.08] h-10" />
                        </div>
                        <div className="flex items-end">
                            <Button onClick={handleSaveEdit} disabled={editSaving} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-xl gap-2">
                                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Opslaan
                            </Button>
                        </div>
                    </div>
                    <p className="text-[10px] text-white/25">Wijzigingen worden direct doorgevoerd in slimme invoer, spuitschrift en CTGB validatie.</p>
                </div>
            )}

            {/* Season KPI Strip */}
            {seasonKPIs && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        { label: 'Bespuitingen', value: String(seasonKPIs.sprayCount), sub: seasonKPIs.sprayCost > 0 ? `€${Math.round(seasonKPIs.sprayCost)}` : 'dit seizoen', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { label: 'Uren', value: seasonKPIs.totalHours > 0 ? `${seasonKPIs.totalHours.toFixed(0)}u` : '0', sub: seasonKPIs.hoursCost > 0 ? `€${Math.round(seasonKPIs.hoursCost)}` : 'dit seizoen', color: 'text-purple-400', bg: 'bg-purple-500/10' },
                        { label: 'Oogst', value: seasonKPIs.harvestKg > 0 ? `${(seasonKPIs.harvestKg / 1000).toFixed(1)}t` : '—', sub: seasonKPIs.harvestCrates > 0 ? `${seasonKPIs.harvestCrates} kisten` : 'dit seizoen', color: 'text-rose-400', bg: 'bg-rose-500/10' },
                        { label: 'Notities', value: String(seasonKPIs.noteCount), sub: seasonKPIs.warningCount > 0 ? `${seasonKPIs.warningCount} waarschuwing${seasonKPIs.warningCount > 1 ? 'en' : ''}` : 'dit seizoen', color: seasonKPIs.warningCount > 0 ? 'text-amber-400' : 'text-emerald-400', bg: seasonKPIs.warningCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10' },
                        { label: 'Seizoen', value: String(new Date().getFullYear()), sub: `${seasonKPIs.sprayCount + seasonKPIs.noteCount} activiteiten`, color: 'text-white/50', bg: 'bg-white/[0.03]' },
                    ].map((kpi) => (
                        <div key={kpi.label} className={`rounded-xl ${kpi.bg} border border-white/[0.04] px-4 py-3`}>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{kpi.label}</p>
                            <p className={`text-xl font-black ${kpi.color} mt-0.5 tabular-nums`}>{kpi.value}</p>
                            <p className="text-[10px] text-white/20 mt-0.5">{kpi.sub}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* 0. Perceelprofiel & Grondmonsters — direct na header */}
            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
                    <TabsTrigger value="profile" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        Perceelprofiel
                    </TabsTrigger>
                    <TabsTrigger value="analyses" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        Grondmonsters
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        Tijdlijn
                    </TabsTrigger>
                    <TabsTrigger value="overview" className="rounded-lg font-bold px-6 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                        Overzicht
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="mt-4">
                    <ParcelProfileForm subParcelId={parcel.id} defaultGewas={parcel.crop} defaultRas={parcel.variety || undefined} />
                </TabsContent>
                <TabsContent value="analyses" className="mt-4">
                    <SoilAnalysisPanel subParcelId={parcel.id} />
                </TabsContent>
                <TabsContent value="timeline" className="mt-4">
                    <ParcelTimeline parcelId={parcel.id} />
                </TabsContent>
                <TabsContent value="overview" className="mt-4 space-y-6">

            {/* 1. Composition Visualization */}
            <CompositionSection
                titleLeft="Perceel Inrichting (Blokken)"
                titleRight="Ras / Mutant Compositie (Biologie)"
                itemsLeft={composition}
                itemsRight={mutantComposition}
                totalArea={stats.totalArea}
            />

            {/* 2. Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: "Totaal Oppervlak", value: `${stats.totalArea.toFixed(2)} ha`, sub: "Geregistreerd", icon: Scale, color: "text-blue-400" },
                    { label: "Totaal Bomen", value: stats.totalTrees.toLocaleString(), sub: "Schatting", icon: Sprout, color: "text-emerald-400" },
                    { label: "Gem. Leeftijd", value: `${stats.avgAge} Jaar`, sub: "Gewogen gem.", icon: Timer, color: "text-amber-400" },
                    { label: "Plantdichtheid", value: `${stats.density}`, sub: "Bomen / ha", icon: TrendingUp, color: "text-purple-400" },
                ].map((kpi, i) => (
                    <Card key={i} className="bg-card/30 backdrop-blur-md border-white/5">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{kpi.label}</p>
                                    <h3 className="text-2xl font-black text-white mt-1">{kpi.value}</h3>
                                    <p className="text-xs text-white/30 font-medium">{kpi.sub}</p>
                                </div>
                                <div className={cn("p-2 rounded-xl bg-white/5", kpi.color)}>
                                    <kpi.icon className="h-5 w-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 3. Production Stacked Chart */}
                <Card className="lg:col-span-2 bg-card/30 backdrop-blur-md border-white/5">
                    <CardHeader>
                        <CardTitle className="text-lg font-black text-white flex items-center justify-between">
                            <span>Productie Dashboard (Trend)</span>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-white/10 text-white/40">Tonnage per ras</Badge>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productionData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="year" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#121212', border: '1px solid #ffffff10', borderRadius: '12px' }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                                {varieties.map((v, i) => (
                                    <Bar
                                        key={v}
                                        dataKey={v}
                                        stackId="a"
                                        fill={[`#ef4444`, `#3b82f6`, `#22c55e`, `#f59e0b`, `#8b5cf6`][i % 5]}
                                        radius={i === varieties.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* 4. Recent Activity (The Pulse) */}
                <Card className="lg:col-span-1 bg-card/30 backdrop-blur-md border-white/5">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-white/60">
                            De 'Pulse'
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Latest Soil Sample */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-white/40 uppercase tracking-tight flex items-center gap-2">
                                <Activity className="h-3 w-3 text-emerald-400" /> Laatste Bodemmonster
                            </h4>
                            {stats.latestSoilSample ? (
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-black text-white">
                                                {format(new Date(stats.latestSoilSample.sampleDate), 'dd MMM yyyy', { locale: nl })}
                                            </p>
                                            <p className="text-[10px] text-white/40 font-bold">
                                                Status: Gezond (pH {stats.latestSoilSample.ph})
                                            </p>
                                        </div>
                                        <div className="h-10 w-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex items-center gap-3">
                                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                                    <p className="text-xs font-bold text-amber-500/80">Geen recente monsters gevonden.</p>
                                </div>
                            )}
                        </div>

                        {/* Latest Spray Activity */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-white/40 uppercase tracking-tight flex items-center gap-2">
                                <Activity className="h-3 w-3 text-blue-400" /> Laatste Bespuiting
                            </h4>
                            {lastSpray ? (
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-white">{format(new Date(lastSpray.date), 'dd MMM yyyy', { locale: nl })}</p>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {lastSpray.products.map((p, i) => (
                                                <Badge key={i} variant="outline" className="text-[9px] border-white/10 text-white/50">{p.product}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs font-bold text-white/30 italic">Geen recente activiteiten gelogd.</p>
                                </div>
                            )}
                        </div>

                        <Button variant="ghost" className="w-full text-xs font-black text-primary hover:text-primary hover:bg-primary/5 uppercase tracking-widest gap-2">
                            Bekijk volledige tijdlijn <ChevronRight className="h-3 w-3" />
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* 4.5 Gewasrotatie Timeline */}
            <GewasrotatieTimeline parcelId={parcel.id} parcelName={parcel.name} />

            {/* 6. Sub-parcels Grid */}
            <div className="space-y-4">
                <h3 className="text-xl font-black text-white">Sub-percelen (Blokken)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {subParcels.map((sub) => {
                        const needsAttention = sub.soilSamples && sub.soilSamples.length > 0 ?
                            differenceInYears(new Date(), new Date(sub.soilSamples[0].sampleDate)) >= 3 : true;

                        return (
                            <Card
                                key={sub.id}
                                className="bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10 transition-all cursor-pointer group relative overflow-hidden"
                                onClick={() => onSubParcelClick(sub)}
                            >
                                <div className="absolute top-0 right-0 p-4">
                                    <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-primary transition-colors" />
                                </div>
                                <CardContent className="p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center",
                                            sub.crop === 'Appel' ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"
                                        )}>
                                            <Sprout className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-white group-hover:text-primary transition-colors">{sub.name || sub.variety}</h4>
                                            <p className="text-[10px] text-white/40 uppercase font-black">{sub.variety}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mt-6">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-white/40 uppercase font-bold">Oppervlak</p>
                                            <p className="text-sm font-black text-white">{sub.area.toFixed(2)} ha</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-white/40 uppercase font-bold">Status</p>
                                            {needsAttention ? (
                                                <div className="flex items-center gap-1 text-amber-500">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    <span className="text-[10px] font-black uppercase">Check Bodem</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 text-emerald-500">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    <span className="text-[10px] font-black uppercase">OK</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            </div>

                </TabsContent>
            </Tabs>
        </div>
    )
}
