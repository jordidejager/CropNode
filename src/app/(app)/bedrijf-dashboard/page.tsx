"use client"

import * as React from "react"
import { useParcels } from "@/hooks/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    LayoutDashboard,
    Trees,
    Map as MapIcon,
    TrendingUp,
    Calendar,
    ChevronRight,
    ArrowLeft,
    Layers,
    Activity
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { CompositionSection } from "@/components/domain/dashboard/composition-section"

export default function BedrijfDashboardPage() {
    const { data: parcels = [], isLoading } = useParcels()
    const router = useRouter()

    const { stats, parcelItems, mutantItems } = React.useMemo(() => {
        // Handle nullable area with || 0
        const totalArea = parcels.reduce((sum, p) => sum + (p.area || 0), 0)

        // For variety/mutant aggregation - SprayableParcel already has variety info
        const varietyMap = new Map<string, number>()

        parcels.forEach(p => {
            const parcelArea = p.area || 0
            // Use variety from SprayableParcel
            const varietyName = p.variety || "Onbekend"
            varietyMap.set(varietyName, (varietyMap.get(varietyName) || 0) + parcelArea)
        })

        // Calculate basic stats
        const totalParcels = parcels.length
        const avgAreaPerParcel = totalParcels > 0 ? totalArea / totalParcels : 0

        const parcelItems = [...parcels]
            .sort((a, b) => (b.area || 0) - (a.area || 0))
            .map(p => ({
                name: p.name,
                area: p.area || 0,
                percentage: totalArea > 0 ? ((p.area || 0) / totalArea) * 100 : 0
            }))

        const mutantItems = Array.from(varietyMap.entries())
            .map(([name, area]) => ({
                name: name || "Onbekend",
                area: area,
                percentage: totalArea > 0 ? (area / totalArea) * 100 : 0
            }))
            .sort((a, b) => b.area - a.area)

        return {
            stats: {
                totalArea,
                totalParcels,
                avgAreaPerParcel,
                uniqueVarieties: varietyMap.size
            },
            parcelItems,
            mutantItems
        }
    }, [parcels])

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Gegevens laden...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white/10">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            Bedrijfsoverzicht
                        </h1>
                        <p className="text-white/40 font-medium">Totaaloverzicht van alle percelen en aanplantingen</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 font-bold">
                        Status: Operationeel
                    </Badge>
                </div>
            </div>

            {/* Bedrijfs Compositie */}
            <CompositionSection
                titleLeft="Areaal Verdeling (Hoofdpercelen)"
                titleRight="Ras / Mutant Verdeling (Bedrijf)"
                itemsLeft={parcelItems}
                itemsRight={mutantItems}
                totalArea={stats.totalArea}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <MapIcon className="h-5 w-5 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-black text-emerald-400/60 uppercase">Areaal</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">{stats.totalArea.toFixed(2)}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Hectare Totaal</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <Layers className="h-5 w-5 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-black text-blue-400/60 uppercase">Percelen</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">{stats.totalParcels}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Aantal Blokken</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-amber-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <Activity className="h-5 w-5 text-amber-400" />
                            </div>
                            <span className="text-[10px] font-black text-amber-400/60 uppercase">Gem. Grootte</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">{stats.avgAreaPerParcel.toFixed(2)}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">ha per Blok</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-rose-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <Trees className="h-5 w-5 text-rose-400" />
                            </div>
                            <span className="text-[10px] font-black text-rose-400/60 uppercase">Variëteiten</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">{stats.uniqueVarieties}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Unieke Rassen</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Parcels List */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Layers className="h-4 w-4 text-primary" />
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Perceelblokken Overzicht</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parcels.map((parcel) => (
                        <Card key={parcel.id} className="bg-white/5 border-white/5 hover:bg-white/[0.08] transition-all cursor-pointer group" onClick={() => router.push(`/parcels`)}>
                            <CardContent className="p-6">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                            <MapIcon className="h-6 w-6 text-white/20 group-hover:text-primary transition-colors" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-white group-hover:text-primary transition-colors">{parcel.name}</h3>
                                            <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-white/30 uppercase tracking-wider">
                                                <span>{(parcel.area || 0).toFixed(2)} ha</span>
                                                {parcel.variety && (
                                                    <>
                                                        <span className="w-1 h-1 bg-white/10 rounded-full" />
                                                        <span>{parcel.variety}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-white/10 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                                {/* Simple progress bar showing relative area */}
                                <div className="mt-6 flex gap-2 overflow-hidden h-1.5 bg-white/5 rounded-full">
                                    <div
                                        style={{ width: `${stats.totalArea > 0 ? ((parcel.area || 0) / stats.totalArea) * 100 : 0}%` }}
                                        className={cn(
                                            "h-full rounded-full",
                                            parcel.crop === 'Appel' ? 'bg-rose-500/40' : 'bg-emerald-500/40'
                                        )}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
