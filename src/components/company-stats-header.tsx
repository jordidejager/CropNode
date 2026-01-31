"use client"

import { motion } from "framer-motion"
import { LayoutDashboard, TreeDeciduous, Map as MapIcon, ChevronRight } from "lucide-react"
import type { SprayableParcel } from "@/lib/supabase-store"
import { useRouter } from "next/navigation"

interface CompanyStatsHeaderProps {
    parcels: SprayableParcel[]
}

export function CompanyStatsHeader({ parcels }: CompanyStatsHeaderProps) {
    const router = useRouter()

    // Calculate stats from flat SprayableParcel array
    const totalArea = parcels.reduce((sum, p) => sum + (p.area || 0), 0)

    // Collect unique varieties
    const varieties = new Set<string>()
    parcels.forEach(p => {
        if (p.variety) varieties.add(p.variety)
    })
    const varietyCount = varieties.size

    const stats = [
        {
            label: "Totaal Oppervlakte",
            value: `${totalArea.toFixed(2)} ha`,
            icon: MapIcon,
            color: "text-emerald-400"
        },
        {
            label: "Perceelblokken",
            value: parcels.length.toString(),
            icon: TreeDeciduous,
            color: "text-primary"
        },
        {
            label: "Bedrijfsomvang",
            value: `${parcels.length} Blokken • ${varietyCount} Rassen`,
            icon: LayoutDashboard,
            color: "text-blue-400"
        }
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative group cursor-pointer"
            onClick={() => router.push('/bedrijf-dashboard')}
        >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-emerald-500/20 rounded-3xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />

            <div className="relative bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                    <LayoutDashboard size={200} />
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-primary">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] uppercase font-black tracking-[0.2em]">Live Bedrijfsoverzicht</span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tight">
                            Uw Bedrijf <span className="text-primary">Dashboard</span>
                        </h1>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 flex-grow max-w-3xl">
                        {stats.map((stat, i) => (
                            <div key={i} className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-white/30 tracking-wider flex items-center gap-2">
                                    <stat.icon className="h-3 w-3" />
                                    {stat.label}
                                </span>
                                <span className={`text-2xl font-black ${stat.color}`}>
                                    {stat.value}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 group/btn">
                        <div className="flex flex-col items-end mr-2">
                            <span className="text-[10px] font-black uppercase text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                Naar Dashboard
                            </span>
                        </div>
                        <div className="h-12 w-12 rounded-full border border-white/10 flex items-center justify-center group-hover:border-primary/50 transition-colors">
                            <ChevronRight className="h-6 w-6 text-white/20 group-hover:text-primary transition-colors" />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
