'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, Check, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkSchedule, useUpdateWorkSchedule } from '@/hooks/use-data'
import type { WorkScheduleDay, BreakPeriod } from '@/lib/types'
import { calcNettoHoursWithBreaks, totalBreakMinutes } from '@/lib/types'

const DAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

export function WorkScheduleSettings() {
    const { data: schedule = [], isLoading } = useWorkSchedule()
    const updateMutation = useUpdateWorkSchedule()
    const [localSchedule, setLocalSchedule] = React.useState<WorkScheduleDay[]>([])
    const [saved, setSaved] = React.useState(false)
    const saveTimeout = React.useRef<NodeJS.Timeout>()

    React.useEffect(() => {
        if (schedule.length > 0 && localSchedule.length === 0) {
            setLocalSchedule(schedule)
        }
    }, [schedule, localSchedule.length])

    const triggerSave = (updated: WorkScheduleDay[]) => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current)
        saveTimeout.current = setTimeout(() => {
            updateMutation.mutate(updated.map(d => ({
                dayOfWeek: d.dayOfWeek,
                isWorkday: d.isWorkday,
                startTime: d.startTime,
                endTime: d.endTime,
                breaks: d.breaks,
            })))
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        }, 1200)
    }

    const handleChange = (dayOfWeek: number, field: string, value: any) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newDay = { ...d, [field]: value }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newDay.breaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleAddBreak = (dayOfWeek: number) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = [...d.breaks, { start: '12:00', end: '12:30' }]
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleUpdateBreak = (dayOfWeek: number, breakIndex: number, field: 'start' | 'end', value: string) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = d.breaks.map((b, i) => i === breakIndex ? { ...b, [field]: value } : b)
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    const handleRemoveBreak = (dayOfWeek: number, breakIndex: number) => {
        setLocalSchedule(prev => {
            const updated = prev.map(d => {
                if (d.dayOfWeek !== dayOfWeek) return d
                const newBreaks = d.breaks.filter((_, i) => i !== breakIndex)
                const newDay = { ...d, breaks: newBreaks }
                newDay.nettoHours = calcNettoHoursWithBreaks(newDay.startTime, newDay.endTime, newBreaks, newDay.isWorkday)
                return newDay
            })
            triggerSave(updated)
            return updated
        })
    }

    // Reorder: Ma-Zo
    const orderedDays = React.useMemo(() => {
        if (localSchedule.length === 0) return []
        return [1, 2, 3, 4, 5, 6, 0].map(dow => localSchedule.find(d => d.dayOfWeek === dow)!).filter(Boolean)
    }, [localSchedule])

    if (isLoading || orderedDays.length === 0) {
        return (
            <Card className="bg-white/5 backdrop-blur-md border-white/10">
                <CardContent className="p-6">
                    <div className="h-[200px] animate-pulse bg-white/[0.03] rounded-xl" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-white/5 backdrop-blur-md border-white/10">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2 text-base">
                        <Clock className="h-5 w-5 text-emerald-400" />
                        Werkschema
                    </CardTitle>
                    {saved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <Check className="h-3 w-3" /> Opgeslagen
                        </span>
                    )}
                </div>
                <p className="text-xs text-white/40 mt-1">
                    Wordt gebruikt bij het stoppen van actieve taken om werkuren te berekenen.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {orderedDays.map(day => (
                        <div
                            key={day.dayOfWeek}
                            className={cn(
                                "rounded-lg border transition-colors p-3",
                                day.isWorkday ? "bg-white/[0.02] border-white/5" : "bg-white/[0.01] border-transparent opacity-50"
                            )}
                        >
                            {/* Main row */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-white/70 w-8">{DAY_LABELS[day.dayOfWeek]}</span>

                                <button
                                    onClick={() => handleChange(day.dayOfWeek, 'isWorkday', !day.isWorkday)}
                                    className={cn(
                                        "w-9 h-5 rounded-full transition-colors relative shrink-0",
                                        day.isWorkday ? "bg-emerald-500" : "bg-white/10"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                                        day.isWorkday ? "translate-x-4" : "translate-x-0.5"
                                    )} />
                                </button>

                                {day.isWorkday ? (
                                    <>
                                        <Input
                                            type="time"
                                            value={day.startTime || '07:30'}
                                            onChange={(e) => handleChange(day.dayOfWeek, 'startTime', e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-8 text-xs w-[100px]"
                                        />
                                        <span className="text-white/20 text-xs">—</span>
                                        <Input
                                            type="time"
                                            value={day.endTime || '17:00'}
                                            onChange={(e) => handleChange(day.dayOfWeek, 'endTime', e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-8 text-xs w-[100px]"
                                        />
                                        <span className="text-sm font-semibold text-emerald-400 ml-auto">
                                            {day.nettoHours.toFixed(1)}u
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs text-white/20 ml-2">Vrij</span>
                                )}
                            </div>

                            {/* Breaks */}
                            {day.isWorkday && (
                                <div className="mt-2 ml-[76px] space-y-1">
                                    {day.breaks.map((brk, bi) => (
                                        <div key={bi} className="flex items-center gap-2">
                                            <span className="text-[10px] text-white/30 w-12">Pauze:</span>
                                            <Input
                                                type="time"
                                                value={brk.start}
                                                onChange={(e) => handleUpdateBreak(day.dayOfWeek, bi, 'start', e.target.value)}
                                                className="bg-white/5 border-white/10 text-white h-7 text-xs w-[90px]"
                                            />
                                            <span className="text-white/20 text-xs">—</span>
                                            <Input
                                                type="time"
                                                value={brk.end}
                                                onChange={(e) => handleUpdateBreak(day.dayOfWeek, bi, 'end', e.target.value)}
                                                className="bg-white/5 border-white/10 text-white h-7 text-xs w-[90px]"
                                            />
                                            <span className="text-[10px] text-white/25">
                                                {(() => {
                                                    const [bs, bsm] = brk.start.split(':').map(Number)
                                                    const [be, bem] = brk.end.split(':').map(Number)
                                                    return `${(be * 60 + bem) - (bs * 60 + bsm)} min`
                                                })()}
                                            </span>
                                            <button
                                                onClick={() => handleRemoveBreak(day.dayOfWeek, bi)}
                                                className="text-red-400/50 hover:text-red-400 transition-colors p-0.5"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => handleAddBreak(day.dayOfWeek)}
                                        className="flex items-center gap-1 text-[10px] text-white/25 hover:text-emerald-400 transition-colors mt-1"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Pauze toevoegen
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
