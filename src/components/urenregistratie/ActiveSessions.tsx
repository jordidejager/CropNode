'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Timer, Users, MapPin, Calendar, Edit2, X, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveTaskSession, WorkScheduleDay } from '@/lib/types'
import { DEFAULT_WORK_SCHEDULE, calcNettoHoursWithBreaks } from '@/lib/types'
import { formatElapsedTime, formatDateTime, dateToDateTimeLocal, dateTimeLocalToDate } from './utils'

/**
 * Bereken netto werkuren sinds starttijd op basis van werkschema.
 * Telt per dag de werkuren op, rekening houdend met pauzes.
 */
function calcNettoWorkedHours(startTime: Date, schedule: WorkScheduleDay[]): number {
    const now = new Date()
    const current = new Date(startTime)
    current.setHours(0, 0, 0, 0)
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    let total = 0
    while (current <= today) {
        const dow = current.getDay()
        const sched = schedule.find(s => s.dayOfWeek === dow)
            || DEFAULT_WORK_SCHEDULE.find(s => s.dayOfWeek === dow)!
        const isToday = current.toDateString() === today.toDateString()
        const isStartDay = current.toDateString() === startTime.toDateString()

        if (sched.isWorkday && sched.startTime && sched.endTime) {
            const effectiveStart = isStartDay
                ? `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`
                : sched.startTime

            if (isToday) {
                const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                // Alleen tellen als we binnen werktijd zijn
                const endCap = nowTime < sched.endTime ? nowTime : sched.endTime
                if (endCap > effectiveStart) {
                    total += calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks || [], true, endCap)
                }
            } else {
                total += calcNettoHoursWithBreaks(effectiveStart, sched.endTime, sched.breaks || [], true)
            }
        }
        current.setDate(current.getDate() + 1)
    }

    return Math.round(total * 2) / 2 // round to 0.5
}

function formatWorkedHours(hours: number): string {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}u`
    return `${h}u ${m}m`
}

interface ActiveSessionsProps {
    sessions: ActiveTaskSession[]
    workSchedule: WorkScheduleDay[]
    onStop: (session: ActiveTaskSession) => void
    onDelete: (id: string) => void
    onUpdate: (id: string, updates: { startTime?: Date; peopleCount?: number; notes?: string | null }) => void
}

export function ActiveSessions({ sessions, workSchedule, onStop, onDelete, onUpdate }: ActiveSessionsProps) {
    const [editingSession, setEditingSession] = React.useState<string | null>(null)
    const [editStartDateTime, setEditStartDateTime] = React.useState<string>("")
    const [editPeopleCount, setEditPeopleCount] = React.useState<number>(1)
    const [editNotes, setEditNotes] = React.useState<string>("")

    // Timer tick
    const [, setTick] = React.useState(0)
    React.useEffect(() => {
        if (sessions.length === 0) return
        const interval = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(interval)
    }, [sessions.length])

    if (sessions.length === 0) return null

    const handleSave = (sessionId: string) => {
        onUpdate(sessionId, {
            startTime: dateTimeLocalToDate(editStartDateTime),
            peopleCount: editPeopleCount,
            notes: editNotes || null,
        })
        setEditingSession(null)
    }

    const startEditing = (session: ActiveTaskSession) => {
        setEditingSession(session.id)
        setEditStartDateTime(dateToDateTimeLocal(session.startTime))
        setEditPeopleCount(session.peopleCount)
        setEditNotes(session.notes || '')
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
                <Timer className="h-4 w-4 text-orange-400 animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Actieve Taken ({sessions.length})</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((session) => (
                    <Card key={session.id} className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20 shadow-xl">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-white">{session.taskTypeName}</span>
                                        {session.subParcelName && (
                                            <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-white/60">
                                                <MapPin className="h-2.5 w-2.5 mr-1" />
                                                {session.subParcelName}
                                            </Badge>
                                        )}
                                    </div>
                                    {editingSession === session.id ? (
                                        <div className="mt-2 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3 text-white/30 shrink-0" />
                                                <Input
                                                    type="datetime-local"
                                                    value={editStartDateTime}
                                                    onChange={(e) => setEditStartDateTime(e.target.value)}
                                                    className="bg-white/10 border-white/20 text-white h-8 text-xs flex-1"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users className="h-3 w-3 text-white/30 shrink-0" />
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={editPeopleCount}
                                                    onChange={(e) => setEditPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                    className="bg-white/10 border-white/20 text-white h-8 text-xs w-16"
                                                />
                                                <span className="text-[11px] text-white/30">personen</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Edit2 className="h-3 w-3 text-white/30 shrink-0" />
                                                <Input
                                                    value={editNotes}
                                                    onChange={(e) => setEditNotes(e.target.value)}
                                                    placeholder="Notitie..."
                                                    className="bg-white/10 border-white/20 text-white h-8 text-xs flex-1"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1 pt-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSave(session.id)}
                                                    className="h-7 px-3 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
                                                >
                                                    Opslaan
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setEditingSession(null)}
                                                    className="h-7 px-2 text-white/40 hover:text-white text-xs"
                                                >
                                                    Annuleren
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-3 text-[11px] text-white/40 mt-2">
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {session.peopleCount} personen
                                                </span>
                                                {session.notes && (
                                                    <span className="text-white/30 truncate max-w-[150px]" title={session.notes}>
                                                        &ldquo;{session.notes}&rdquo;
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => startEditing(session)}
                                                className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors mt-2"
                                            >
                                                <Calendar className="h-3 w-3" />
                                                Gestart: {formatDateTime(session.startTime)}
                                                <Edit2 className="h-2.5 w-2.5 opacity-50" />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-orange-400">{formatWorkedHours(calcNettoWorkedHours(session.startTime, workSchedule))}</div>
                                        <div className="text-[10px] text-white/30 uppercase font-bold">werkuren</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="sm"
                                            onClick={() => onStop(session)}
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-4"
                                        >
                                            <Square className="h-3 w-3 mr-1.5" />
                                            Stop
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                                if (confirm("Weet je zeker dat je deze actieve taak wilt annuleren?")) {
                                                    onDelete(session.id)
                                                }
                                            }}
                                            className="h-10 w-10 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
