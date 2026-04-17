'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Play, Users, X } from 'lucide-react'
import type { TaskType, ParcelGroupOption, ParcelSelection } from '@/lib/types'
import { ParcelSelector } from './ParcelSelector'
import { TimeShortcuts } from './TimeShortcuts'
import { dateTimeLocalToDate, getDefaultStartDateTime } from './utils'

/**
 * Sheet die opent wanneer de gebruiker op een QuickStart-chip tikt.
 * Voorheen startte de chip meteen een sessie (1 persoon, geen perceel, starttijd=nu) —
 * geen kans om aan te passen en ongeluksvrij moeilijk terug te draaien.
 *
 * Nu: gebruiker bevestigt of past aantal personen / perceel / starttijd aan
 * vóór de timer daadwerkelijk start.
 */

const LABEL_CLASS = 'text-white/80 text-sm font-semibold'

interface QuickStartSheetProps {
    taskType: TaskType
    parcelGroups: ParcelGroupOption[]
    onCancel: () => void
    onStart: (data: {
        taskTypeId: string
        subParcelId: string | null
        parcelId: string | null
        startTime: Date
        peopleCount: number
        notes: string | null
    }) => Promise<void> | void
    isPending: boolean
}

export function QuickStartSheet({
    taskType,
    parcelGroups,
    onCancel,
    onStart,
    isPending,
}: QuickStartSheetProps) {
    const [peopleCount, setPeopleCount] = React.useState<number>(1)
    const [startDateTime, setStartDateTime] = React.useState<string>(() => getDefaultStartDateTime())
    const [parcelSelection, setParcelSelection] = React.useState<ParcelSelection>({ kind: 'none' })

    const { subParcelId, parcelId } = React.useMemo(() => {
        if (parcelSelection.kind === 'sub') {
            return { subParcelId: parcelSelection.subParcelId, parcelId: null }
        }
        if (parcelSelection.kind === 'whole') {
            return { subParcelId: null, parcelId: parcelSelection.parcelId }
        }
        return { subParcelId: null, parcelId: null }
    }, [parcelSelection])

    const handleStart = async () => {
        await onStart({
            taskTypeId: taskType.id,
            subParcelId,
            parcelId,
            startTime: dateTimeLocalToDate(startDateTime),
            peopleCount,
            notes: null,
        })
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-slate-900 border-orange-500/30 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
                <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-white text-xl flex items-center gap-2">
                        <Play className="h-5 w-5 text-orange-400" />
                        Timer starten voor <span className="text-orange-300">{taskType.name}</span>
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        aria-label="Sluiten"
                        className="text-white/70 hover:text-white hover:bg-white/10"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto">
                    <p className="text-sm text-white/70">
                        Controleer en pas zo nodig aan. Daarna tik je op <span className="font-semibold text-orange-300">Timer starten</span>.
                    </p>

                    {/* Aantal personen */}
                    <div className="space-y-2">
                        <Label className={LABEL_CLASS}>Aantal personen</Label>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setPeopleCount(n => Math.max(1, n - 1))}
                                aria-label="Minder personen"
                                className="h-12 w-12 text-lg font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10"
                            >
                                −
                            </Button>
                            <Input
                                type="number"
                                min={1}
                                value={peopleCount}
                                onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                aria-label="Aantal personen"
                                className="bg-white/5 border-white/10 text-white h-12 text-center text-2xl font-bold w-24"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setPeopleCount(n => n + 1)}
                                aria-label="Meer personen"
                                className="h-12 w-12 text-lg font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10"
                            >
                                +
                            </Button>
                            <Users className="h-5 w-5 text-white/50 ml-2" />
                            <span className="text-sm text-white/70">
                                {peopleCount === 1 ? 'persoon' : 'personen'}
                            </span>
                        </div>
                    </div>

                    {/* Perceel */}
                    <div className="space-y-2">
                        <Label className={LABEL_CLASS}>
                            Perceel <span className="font-normal text-white/50">(optioneel)</span>
                        </Label>
                        <ParcelSelector
                            parcelGroups={parcelGroups}
                            value={parcelSelection}
                            onChange={setParcelSelection}
                        />
                    </div>

                    {/* Starttijd */}
                    <div className="space-y-2">
                        <Label className={LABEL_CLASS}>Starttijd</Label>
                        <Input
                            type="datetime-local"
                            value={startDateTime}
                            onChange={(e) => setStartDateTime(e.target.value)}
                            className="bg-white/5 border-white/10 text-white h-12 text-base"
                        />
                        <p className="text-sm text-white/60 pt-1">Of kies snel:</p>
                        <TimeShortcuts currentValue={startDateTime} onSelect={setStartDateTime} />
                    </div>

                    {/* Acties */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                            className="flex-1 text-white/80 hover:text-white hover:bg-white/10 h-12 text-base font-semibold"
                        >
                            Annuleren
                        </Button>
                        <Button
                            onClick={handleStart}
                            disabled={isPending}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base"
                        >
                            {isPending ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    Starten...
                                </div>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Timer starten
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
