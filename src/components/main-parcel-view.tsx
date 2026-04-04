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
    CheckCircle2
} from "lucide-react"
import { GewasrotatieTimeline } from "@/components/domain/gewas-rotatie-timeline"
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

    // Calculate Aggregated KPIs and Composition Data
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

        return {
            stats: {
                totalArea,
                totalTrees,
                avgAge: totalArea > 0 ? Math.round(weightedAgeSum / totalArea) : 0,
                density: totalArea > 0 ? Math.round(totalTrees / totalArea) : 0,
                latestSoilSample: latestSoilSample as SoilSample | null
            },
            composition,
            mutantComposition
        }
    }, [subParcels])

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
                            <div className="flex items-center gap-3">
                                <h1 className="text-4xl font-black text-white">{parcel.name}</h1>
                                <Badge className="bg-primary/20 text-primary border-primary/30 font-bold px-3">
                                    Hoofdperceel
                                </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-white/50 font-medium">
                                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {parcel.location ? `${parcel.location.lat.toFixed(4)}, ${parcel.location.lng.toFixed(4)}` : 'Geen locatie'}</span>
                                <span className="flex items-center gap-1"><Scale className="h-4 w-4" /> {stats.totalArea.toFixed(2)} ha totaal</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" className="bg-white/5 border-white/10 text-white font-bold rounded-full">
                                Instellingen
                            </Button>
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 rounded-full shadow-lg shadow-primary/20">
                                Nieuwe Waarneming
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

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

            {/* 5. Perceelprofiel & Grondmonsters */}
            <div className="space-y-4">
                <h3 className="text-xl font-black text-white">Perceelprofiel & Bodemanalyses</h3>
                {subParcels.length <= 1 ? (
                    /* Geen of 1 subperceel → toon profiel direct op hoofdperceel-niveau */
                    <Tabs defaultValue="profile" className="w-full">
                        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
                            <TabsTrigger value="profile" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                Profiel
                            </TabsTrigger>
                            <TabsTrigger value="analyses" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                Grondmonsters
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="profile" className="mt-4">
                            <ParcelProfileForm parcelId={parcel.id} />
                        </TabsContent>
                        <TabsContent value="analyses" className="mt-4">
                            <SoilAnalysisPanel parcelId={parcel.id} />
                        </TabsContent>
                    </Tabs>
                ) : (
                    /* Meerdere subpercelen → tab per blok */
                    <Tabs defaultValue={subParcels[0].id} className="w-full">
                        <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl flex-wrap h-auto gap-1">
                            {subParcels.map((sub) => (
                                <TabsTrigger key={sub.id} value={sub.id} className="rounded-lg font-bold px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                    {sub.name || sub.variety || sub.crop}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {subParcels.map((sub) => (
                            <TabsContent key={sub.id} value={sub.id} className="mt-4">
                                <Tabs defaultValue="profile" className="w-full">
                                    <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
                                        <TabsTrigger value="profile" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                            Profiel
                                        </TabsTrigger>
                                        <TabsTrigger value="analyses" className="rounded-lg font-bold px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                            Grondmonsters
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="profile" className="mt-4">
                                        <ParcelProfileForm subParcelId={sub.id} />
                                    </TabsContent>
                                    <TabsContent value="analyses" className="mt-4">
                                        <SoilAnalysisPanel subParcelId={sub.id} />
                                    </TabsContent>
                                </Tabs>
                            </TabsContent>
                        ))}
                    </Tabs>
                )}
            </div>

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
        </div>
    )
}
