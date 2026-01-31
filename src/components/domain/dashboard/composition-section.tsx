"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WeightedValue } from "@/lib/types"

interface CompositionItem {
    name: string
    percentage: number
    area: number
    color?: string
}

interface CompositionSectionProps {
    titleLeft?: string
    titleRight?: string
    itemsLeft: CompositionItem[]
    itemsRight: CompositionItem[]
    totalArea: number
}

export function CompositionSection({
    titleLeft = "Perceel Compositie",
    titleRight = "Ras / Mutant Compositie",
    itemsLeft,
    itemsRight,
    totalArea
}: CompositionSectionProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Spatial Composition */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">{titleLeft}</span>
                    <span className="text-[10px] font-black text-white/40">{totalArea.toFixed(2)} ha totaal</span>
                </div>
                <div className="h-10 w-full bg-white/5 rounded-2xl overflow-hidden flex border border-white/10 shadow-lg p-1">
                    {itemsLeft.map((item, i) => (
                        <div
                            key={i}
                            style={{ width: `${item.percentage}%` }}
                            className={cn(
                                "h-full first:rounded-l-xl last:rounded-r-xl flex items-center justify-center text-[10px] font-black text-white/90 truncate px-2 border-r border-black/20 last:border-0 transition-all hover:brightness-110",
                                item.color || (i % 3 === 0 ? "bg-emerald-500" : i % 3 === 1 ? "bg-emerald-600" : "bg-teal-600")
                            )}
                            title={`${item.name}: ${item.area.toFixed(2)} ha (${item.percentage.toFixed(1)}%)`}
                        >
                            {item.percentage >= 8 && item.name}
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-[10px] font-bold">
                    {itemsLeft.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <div className={cn("w-2 h-2 rounded-full", item.color || (i % 3 === 0 ? "bg-emerald-500" : i % 3 === 1 ? "bg-emerald-600" : "bg-teal-600"))} />
                            <span className="text-white/60">{item.name}</span>
                            <span className="text-white/30">{item.percentage.toFixed(1)}%</span>
                        </div>
                    ))}
                    {itemsLeft.length > 5 && <span className="text-white/20">+{itemsLeft.length - 5} meer</span>}
                </div>
            </div>

            {/* Right Column: Biological Composition */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">{titleRight}</span>
                    <span className="text-[10px] font-black text-white/40">Biologische verdeling</span>
                </div>
                <div className="h-10 w-full bg-white/5 rounded-2xl overflow-hidden flex border border-white/10 shadow-lg p-1">
                    {itemsRight.map((item, i) => (
                        <div
                            key={i}
                            style={{ width: `${item.percentage}%` }}
                            className={cn(
                                "h-full first:rounded-l-xl last:rounded-r-xl flex items-center justify-center text-[10px] font-black text-white/90 truncate px-2 border-r border-black/20 last:border-0 transition-all hover:brightness-110",
                                i % 3 === 0 ? "bg-rose-500" : i % 3 === 1 ? "bg-rose-600" : "bg-orange-600"
                            )}
                            title={`${item.name}: ${item.area.toFixed(2)} ha (${item.percentage.toFixed(1)}%)`}
                        >
                            {item.percentage >= 8 && item.name}
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-[10px] font-bold">
                    {itemsRight.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <div className={cn("w-2 h-2 rounded-full", i % 3 === 0 ? "bg-rose-500" : i % 3 === 1 ? "bg-rose-600" : "bg-orange-600")} />
                            <span className="text-white/60">{item.name}</span>
                            <span className="text-white/30">{item.percentage.toFixed(1)}%</span>
                        </div>
                    ))}
                    {itemsRight.length > 5 && <span className="text-white/20">+{itemsRight.length - 5} meer</span>}
                </div>
            </div>
        </div>
    )
}
