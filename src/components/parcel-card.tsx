"use client"

import { motion } from "framer-motion"
import type { SprayableParcel } from "@/lib/supabase-store"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Apple, Leaf, Map as MapIcon, Layers } from "lucide-react"
import { cn } from "@/lib/utils"

interface ParcelCardProps {
    parcel: SprayableParcel
    onClick: () => void
    index: number
}

export function ParcelCard({ parcel, onClick, index }: ParcelCardProps) {
    // SprayableParcel has crop and variety directly
    const crop = parcel.crop || 'Onbekend'

    // Determine the primary crop for visual accents
    const isAppel = crop === 'Appel'
    const isPeer = crop === 'Peer'

    const accentColor = isAppel
        ? "border-rose-500/50 hover:border-rose-500"
        : isPeer
            ? "border-emerald-500/50 hover:border-emerald-500"
            : "border-amber-500/50 hover:border-amber-500"

    const glowColor = isAppel
        ? "group-hover:shadow-[0_0_30px_-10px_rgba(244,63,94,0.3)]"
        : isPeer
            ? "group-hover:shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]"
            : "group-hover:shadow-[0_0_30px_-10px_rgba(245,158,11,0.3)]"

    const getCropBadge = (cropName: string) => {
        const isAppelBadge = cropName === 'Appel'
        const isPeerBadge = cropName === 'Peer'

        return (
            <Badge
                key={cropName}
                variant="outline"
                className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-none",
                    isAppelBadge ? "bg-rose-500/10 text-rose-400" :
                        isPeerBadge ? "bg-emerald-500/10 text-emerald-400" :
                            "bg-amber-500/10 text-amber-400"
                )}
            >
                <span className="flex items-center gap-1">
                    {isAppelBadge ? <Apple className="h-3 w-3" /> : <Leaf className="h-3 w-3" />}
                    {cropName}
                </span>
            </Badge>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={onClick}
            className={cn(
                "group relative bg-white/5 backdrop-blur-sm border-l-4 rounded-xl p-6 cursor-pointer transition-all duration-300",
                accentColor,
                glowColor,
                "hover:bg-white/[0.08] hover:-translate-y-1"
            )}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                    <h3 className="text-xl font-black text-white group-hover:text-primary transition-colors">
                        {parcel.name}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {getCropBadge(crop)}
                        {parcel.variety && (
                            <Badge variant="outline" className="text-[10px] font-bold text-white/50 border-white/10">
                                {parcel.variety}
                            </Badge>
                        )}
                    </div>
                    {parcel.synonyms?.length > 0 && (
                        <p className="text-[10px] text-white/20 italic">
                            aka {parcel.synonyms.join(', ')}
                        </p>
                    )}
                </div>
                <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-primary transition-colors" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg">
                        <MapIcon className="h-4 w-4 text-white/40" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-black text-white">{(parcel.area || 0).toFixed(2)}</span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Hectares</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg">
                        <Layers className="h-4 w-4 text-white/40" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-black text-white">{parcel.variety || 'N/A'}</span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Ras</span>
                    </div>
                </div>
            </div>

            {/* Quick stats footer in card */}
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/20">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <Leaf className="h-3 w-3" />
                        {parcel.variety || 'Onbekend ras'}
                    </span>
                </div>
                <span className="group-hover:text-primary transition-colors">Details bekijken</span>
            </div>
        </motion.div>
    )
}
