"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Sprout, Loader2 } from "lucide-react"
import { useGewasHistorie, useRefreshGewasHistorie } from "@/hooks/use-data"
import { cn } from "@/lib/utils"

interface GewasrotatieTimelineProps {
  parcelId: string
  parcelName: string
}

const cropGroupColors: Record<string, { bg: string; text: string; dot: string }> = {
  Fruit: { bg: "bg-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-500" },
  Grasland: { bg: "bg-lime-500/20", text: "text-lime-400", dot: "bg-lime-500" },
  Akkerbouw: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" },
  Overig: { bg: "bg-slate-500/20", text: "text-slate-400", dot: "bg-slate-500" },
}

const defaultColor = { bg: "bg-gray-800", text: "text-gray-400", dot: "bg-gray-600" }

export function GewasrotatieTimeline({ parcelId, parcelName }: GewasrotatieTimelineProps) {
  const { data: historie, isLoading } = useGewasHistorie(parcelId)
  const refreshMutation = useRefreshGewasHistorie(parcelId)

  const hasData = historie && historie.length > 0

  // Idle state: no data fetched yet
  if (!isLoading && !hasData) {
    return (
      <Card className="bg-white/5 border-white/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Sprout className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-black text-white text-lg">Gewasrotatie</h3>
                <p className="text-xs text-white/40">Historische teeltdata van RVO</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <p className="text-sm text-white/40 text-center">
              Geen gewashistorie beschikbaar voor dit perceel.
            </p>
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20"
              size="sm"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Gewashistorie ophalen
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white/5 border-white/5">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Sprout className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-black text-white text-lg">Gewasrotatie</h3>
              <p className="text-xs text-white/40">
                {isLoading ? "Data ophalen bij PDOK..." : `${historie?.length || 0} jaar(en) beschikbaar`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isLoading}
            className="text-white/40 hover:text-white hover:bg-white/10"
          >
            <RefreshCw className={cn("h-4 w-4", (refreshMutation.isPending || isLoading) && "animate-spin")} />
          </Button>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-20 animate-pulse">
                <div className="h-4 bg-white/10 rounded mb-2" />
                <div className="h-16 bg-white/5 rounded-lg" />
                <div className="h-3 bg-white/10 rounded mt-2 w-14" />
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {hasData && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-white/10">
              {historie.map((entry: any) => {
                const colors = cropGroupColors[entry.crop_group] || defaultColor

                return (
                  <div
                    key={entry.jaar}
                    className="flex-shrink-0 group relative"
                    title={`${entry.jaar}: ${entry.gewas} (${entry.gewascode})`}
                  >
                    {/* Year label */}
                    <p className="text-[10px] font-bold text-white/40 text-center mb-1">
                      {entry.jaar}
                    </p>

                    {/* Color block */}
                    <div
                      className={cn(
                        "w-20 h-14 rounded-lg flex items-center justify-center transition-all",
                        "border border-white/5 group-hover:border-white/20 group-hover:scale-105",
                        colors.bg
                      )}
                    >
                      <span className={cn("text-[10px] font-bold text-center leading-tight px-1 truncate", colors.text)}>
                        {entry.gewas}
                      </span>
                    </div>

                    {/* Crop group label */}
                    <p className={cn("text-[9px] font-medium text-center mt-1 opacity-60", colors.text)}>
                      {entry.crop_group}
                    </p>

                    {/* Hover tooltip */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 whitespace-nowrap shadow-xl">
                        <p className="text-xs font-bold text-white">{entry.gewas}</p>
                        <p className="text-[10px] text-white/50">Code: {entry.gewascode}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/5">
              {Object.entries(cropGroupColors).map(([group, colors]) => {
                const hasGroup = historie.some((e: any) => e.crop_group === group)
                if (!hasGroup) return null
                return (
                  <div key={group} className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", colors.dot)} />
                    <span className="text-[10px] font-medium text-white/40">{group}</span>
                  </div>
                )
              })}
            </div>

            {/* Source attribution */}
            <p className="text-[9px] text-white/20 mt-3">
              Bron: RVO Basisregistratie Gewaspercelen &bull; Peildatum 15 mei
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
