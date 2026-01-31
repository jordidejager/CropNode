"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Users,
    Clock,
    Euro,
    TrendingUp,
    Plus,
    Calendar,
    MapPin,
    Trash2,
    ChevronDown,
    ChevronUp,
    Calculator,
    CalendarDays,
    Play,
    Square,
    Timer,
    Edit2,
    X,
    Tractor
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { nl } from "date-fns/locale"
import {
    useTaskTypes,
    useTaskLogs,
    useTaskStats,
    useAddTaskLog,
    useDeleteTaskLog,
    useParcels,
    useActiveTaskSessions,
    useStartTaskSession,
    useStopTaskSession,
    useUpdateActiveTaskSession,
    useDeleteActiveTaskSession
} from "@/hooks/use-data"
import type { TaskLogEnriched, ActiveTaskSession } from "@/lib/types"

/**
 * Bereken werkdagen tussen twee datums
 * - Zondag = 0 dagen
 * - Zaterdag = 0.5 dag
 * - Ma-Vr = 1 dag
 */
function calculateWorkDays(startDate: Date, endDate: Date): number {
    if (startDate > endDate) return 0

    let days = 0
    const current = new Date(startDate)

    while (current <= endDate) {
        const dayOfWeek = current.getDay()
        if (dayOfWeek === 0) {
            // Zondag - niet meetellen
            days += 0
        } else if (dayOfWeek === 6) {
            // Zaterdag - halve dag
            days += 0.5
        } else {
            // Maandag t/m vrijdag
            days += 1
        }
        current.setDate(current.getDate() + 1)
    }

    return days
}

/**
 * Bereken verstreken tijd als leesbare string
 */
function formatElapsedTime(startTime: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - startTime.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60

    if (hours === 0) {
        return `${mins}m`
    }
    return `${hours}u ${mins}m`
}

/**
 * Format datetime-local string naar Date
 */
function dateTimeLocalToDate(dateTimeLocal: string): Date {
    return new Date(dateTimeLocal)
}

/**
 * Format Date naar datetime-local string
 */
function dateToDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Standaard werktijden
 */
const WORK_START_HOUR = 8   // 08:00
const WORK_END_HOUR = 18    // 18:00
const LUNCH_BREAK_HOURS = 1 // 1 uur pauze

/**
 * Geef een datum terug met standaard starttijd (08:00)
 */
function getDefaultStartDateTime(): string {
    const now = new Date()
    // Als het voor 8:00 is, gebruik 8:00 vandaag
    // Als het na 8:00 is, gebruik huidige tijd
    if (now.getHours() < WORK_START_HOUR) {
        now.setHours(WORK_START_HOUR, 0, 0, 0)
    }
    return dateToDateTimeLocal(now)
}

/**
 * Geef een datum terug met standaard eindtijd (18:00)
 */
function getDefaultEndDateTime(startTime: Date): string {
    const endTime = new Date(startTime)
    const now = new Date()

    // Als zelfde dag en het is nog geen 18:00, gebruik huidige tijd
    if (startTime.toDateString() === now.toDateString() && now.getHours() < WORK_END_HOUR) {
        return dateToDateTimeLocal(now)
    }

    // Anders standaard eindtijd 18:00 op de startdatum
    endTime.setHours(WORK_END_HOUR, 0, 0, 0)
    return dateToDateTimeLocal(endTime)
}

export default function TeamTasksPage() {
    const { data: taskTypes = [], isLoading: typesLoading } = useTaskTypes()
    const { data: taskLogs = [], isLoading: logsLoading } = useTaskLogs()
    const { data: stats, isLoading: statsLoading } = useTaskStats()
    const { data: parcels = [] } = useParcels()
    const { data: activeSessions = [], isLoading: activeLoading } = useActiveTaskSessions()

    const addTaskLogMutation = useAddTaskLog()
    const deleteTaskLogMutation = useDeleteTaskLog()
    const startTaskSessionMutation = useStartTaskSession()
    const stopTaskSessionMutation = useStopTaskSession()
    const updateActiveTaskSessionMutation = useUpdateActiveTaskSession()
    const deleteActiveTaskSessionMutation = useDeleteActiveTaskSession()

    // Form state
    const [mode, setMode] = React.useState<"register" | "start">("register")
    const [selectedTaskType, setSelectedTaskType] = React.useState<string>("")
    const [selectedSubParcel, setSelectedSubParcel] = React.useState<string>("")
    const [peopleCount, setPeopleCount] = React.useState<number>(1)
    const [hoursPerPerson, setHoursPerPerson] = React.useState<number>(9)
    const [startDate, setStartDate] = React.useState<string>(new Date().toISOString().split('T')[0])
    const [endDate, setEndDate] = React.useState<string>(new Date().toISOString().split('T')[0])
    const [days, setDays] = React.useState<number>(1)
    const [notes, setNotes] = React.useState<string>("")

    // Start mode state
    const [startDateTime, setStartDateTime] = React.useState<string>(getDefaultStartDateTime())

    // Stop dialog state
    const [stoppingSession, setStoppingSession] = React.useState<ActiveTaskSession | null>(null)
    const [stopEndDateTime, setStopEndDateTime] = React.useState<string>(dateToDateTimeLocal(new Date()))
    const [stopHoursPerPerson, setStopHoursPerPerson] = React.useState<number>(8)

    // Edit start time state
    const [editingSession, setEditingSession] = React.useState<string | null>(null)
    const [editStartDateTime, setEditStartDateTime] = React.useState<string>("")

    // UI state
    const [showAllLogs, setShowAllLogs] = React.useState(false)

    // Timer update
    const [, setTick] = React.useState(0)
    React.useEffect(() => {
        if (activeSessions.length === 0) return
        const interval = setInterval(() => setTick(t => t + 1), 60000) // Update every minute
        return () => clearInterval(interval)
    }, [activeSessions.length])

    // Auto-calculate days when dates change
    React.useEffect(() => {
        const start = new Date(startDate)
        const end = new Date(endDate)
        const calculatedDays = calculateWorkDays(start, end)
        setDays(calculatedDays)
    }, [startDate, endDate])

    // Computed total hours
    const totalHours = peopleCount * hoursPerPerson * days

    // Get selected task type's hourly rate
    const selectedTaskTypeData = taskTypes.find(t => t.id === selectedTaskType)
    const estimatedCost = selectedTaskTypeData
        ? totalHours * selectedTaskTypeData.defaultHourlyRate
        : 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedTaskType) return

        try {
            if (mode === "start") {
                // Start een nieuwe actieve sessie
                await startTaskSessionMutation.mutateAsync({
                    taskTypeId: selectedTaskType,
                    subParcelId: selectedSubParcel || null,
                    startTime: dateTimeLocalToDate(startDateTime),
                    peopleCount,
                    notes: notes || null,
                })
            } else {
                // Direct registreren
                if (days <= 0) return
                await addTaskLogMutation.mutateAsync({
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    days,
                    subParcelId: selectedSubParcel || null,
                    taskTypeId: selectedTaskType,
                    peopleCount,
                    hoursPerPerson,
                    notes: notes || null,
                })
            }

            // Reset form
            setSelectedTaskType("")
            setSelectedSubParcel("")
            setPeopleCount(1)
            setHoursPerPerson(9) // Standaard werkdag
            setStartDate(new Date().toISOString().split('T')[0])
            setEndDate(new Date().toISOString().split('T')[0])
            setDays(1)
            setNotes("")
            setStartDateTime(getDefaultStartDateTime())
        } catch (error) {
            console.error("Error adding task:", error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Weet je zeker dat je deze registratie wilt verwijderen?")) return
        try {
            await deleteTaskLogMutation.mutateAsync(id)
        } catch (error) {
            console.error("Error deleting task log:", error)
        }
    }

    const handleStopSession = async () => {
        if (!stoppingSession) return
        try {
            await stopTaskSessionMutation.mutateAsync({
                sessionId: stoppingSession.id,
                endTime: dateTimeLocalToDate(stopEndDateTime),
                hoursPerPerson: stopHoursPerPerson,
            })
            setStoppingSession(null)
        } catch (error) {
            console.error("Error stopping session:", error)
        }
    }

    const handleDeleteActiveSession = async (id: string) => {
        if (!confirm("Weet je zeker dat je deze actieve taak wilt annuleren?")) return
        try {
            await deleteActiveTaskSessionMutation.mutateAsync(id)
        } catch (error) {
            console.error("Error deleting active session:", error)
        }
    }

    const handleUpdateStartTime = async (sessionId: string) => {
        try {
            await updateActiveTaskSessionMutation.mutateAsync({
                id: sessionId,
                updates: { startTime: dateTimeLocalToDate(editStartDateTime) }
            })
            setEditingSession(null)
        } catch (error) {
            console.error("Error updating start time:", error)
        }
    }

    /**
     * Bereken standaard werkuren voor een dag (8:00-18:00 met 1u pauze)
     * - Werkdag (ma-vr): 9 uur
     * - Zaterdag: 4.5 uur
     * - Zondag: 0 uur
     */
    const getStandardHoursForDay = (date: Date): number => {
        const dayOfWeek = date.getDay()
        if (dayOfWeek === 0) return 0      // Zondag
        if (dayOfWeek === 6) return 4.5    // Zaterdag
        return 9                            // Werkdag (10u - 1u pauze)
    }

    /**
     * Bereken werkuren op basis van start en eindtijd (minus pauze)
     */
    const calculateWorkedHours = (start: Date, end: Date): number => {
        const diffMs = end.getTime() - start.getTime()
        let hours = diffMs / (1000 * 60 * 60)

        // Trek pauze af als meer dan 5 uur gewerkt
        if (hours > 5) {
            hours -= LUNCH_BREAK_HOURS
        }

        return Math.max(0, hours)
    }

    const openStopDialog = (session: ActiveTaskSession) => {
        setStoppingSession(session)
        const now = new Date()

        // Standaard eindtijd: huidige tijd of 18:00
        setStopEndDateTime(getDefaultEndDateTime(session.startTime))

        // Bereken gesuggereerde uren
        const startDay = session.startTime.toDateString()
        const endDay = now.toDateString()

        let suggestedHours: number
        if (startDay === endDay) {
            // Zelfde dag: bereken op basis van start tot nu (of 18:00)
            const effectiveEnd = now.getHours() >= WORK_END_HOUR
                ? new Date(now.setHours(WORK_END_HOUR, 0, 0, 0))
                : now
            suggestedHours = calculateWorkedHours(session.startTime, effectiveEnd)

            // Max de standaard uren voor deze dag
            const maxHours = getStandardHoursForDay(now)
            suggestedHours = Math.min(suggestedHours, maxHours)
        } else {
            // Meerdere dagen: gebruik standaard werkdag uren
            suggestedHours = getStandardHoursForDay(session.startTime)
        }

        // Afronden op 0.5 uur, minimaal 0.5
        suggestedHours = Math.round(suggestedHours * 2) / 2
        setStopHoursPerPerson(Math.max(0.5, suggestedHours))
    }

    const displayedLogs = showAllLogs ? taskLogs : taskLogs.slice(0, 10)

    const isLoading = typesLoading || logsLoading || statsLoading || activeLoading

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
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <Users className="h-8 w-8 text-primary" />
                        Team & Tasks
                    </h1>
                    <p className="text-white/40 font-medium mt-1">Urenregistratie en taakbeheer</p>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 font-bold w-fit flex items-center gap-1.5">
                    <Tractor className="h-3.5 w-3.5" />
                    Urenregistratie
                </Badge>
            </div>

            {/* Quick Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Today's Hours */}
                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <Clock className="h-5 w-5 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-black text-blue-400/60 uppercase">Vandaag</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">{stats?.todayHours?.toFixed(1) || 0}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Uren geregistreerd</div>
                        </div>
                    </CardContent>
                </Card>

                {/* Week's Cost */}
                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <Euro className="h-5 w-5 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-black text-emerald-400/60 uppercase">Deze week</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-3xl font-black text-white">
                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats?.weekCost || 0)}
                            </div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Geschatte kosten</div>
                        </div>
                    </CardContent>
                </Card>

                {/* Top Activity */}
                <Card className="bg-white/5 backdrop-blur-md border-white/10 shadow-xl group hover:border-primary/30 transition-all">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-amber-500/10 rounded-xl group-hover:scale-110 transition-transform">
                                <TrendingUp className="h-5 w-5 text-amber-400" />
                            </div>
                            <span className="text-[10px] font-black text-amber-400/60 uppercase">Top activiteit</span>
                        </div>
                        <div className="mt-4">
                            <div className="text-2xl font-black text-white truncate">{stats?.topActivity || "-"}</div>
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-1">Meeste uren deze maand</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Active Tasks Section */}
            {activeSessions.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Timer className="h-4 w-4 text-orange-400 animate-pulse" />
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Actieve Taken ({activeSessions.length})</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeSessions.map((session) => (
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
                                            <div className="flex items-center gap-3 text-[11px] text-white/40 mt-2">
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {session.peopleCount} personen
                                                </span>
                                                {session.notes && (
                                                    <span className="text-white/30 truncate max-w-[150px]" title={session.notes}>
                                                        "{session.notes}"
                                                    </span>
                                                )}
                                            </div>
                                            {/* Start time - editable */}
                                            <div className="mt-3">
                                                {editingSession === session.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="datetime-local"
                                                            value={editStartDateTime}
                                                            onChange={(e) => setEditStartDateTime(e.target.value)}
                                                            className="bg-white/10 border-white/20 text-white h-8 text-xs flex-1"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleUpdateStartTime(session.id)}
                                                            className="h-8 px-2 text-emerald-400 hover:text-emerald-300"
                                                        >
                                                            Opslaan
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setEditingSession(null)}
                                                            className="h-8 px-2 text-white/40 hover:text-white"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setEditingSession(session.id)
                                                            setEditStartDateTime(dateToDateTimeLocal(session.startTime))
                                                        }}
                                                        className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors"
                                                    >
                                                        <Calendar className="h-3 w-3" />
                                                        Gestart: {format(session.startTime, "d MMM HH:mm", { locale: nl })}
                                                        <Edit2 className="h-2.5 w-2.5 opacity-50" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-orange-400">{formatElapsedTime(session.startTime)}</div>
                                                <div className="text-[10px] text-white/30 uppercase font-bold">verstreken</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() => openStopDialog(session)}
                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-8 px-3"
                                                >
                                                    <Square className="h-3 w-3 mr-1.5" />
                                                    Stop
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleDeleteActiveSession(session.id)}
                                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
            )}

            {/* Stop Session Dialog */}
            {stoppingSession && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <Card className="bg-slate-900 border-white/10 w-full max-w-md shadow-2xl">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Square className="h-5 w-5 text-emerald-400" />
                                Taak Afronden
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <div className="font-bold text-white">{stoppingSession.taskTypeName}</div>
                                <div className="text-sm text-white/40 mt-1">
                                    Gestart: {format(stoppingSession.startTime, "d MMM HH:mm", { locale: nl })}
                                </div>
                                <div className="text-sm text-white/40">
                                    {stoppingSession.peopleCount} personen
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Eindtijd</Label>
                                <Input
                                    type="datetime-local"
                                    value={stopEndDateTime}
                                    onChange={(e) => setStopEndDateTime(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white h-12"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Uren per persoon</Label>
                                <Input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={stopHoursPerPerson}
                                    onChange={(e) => setStopHoursPerPerson(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                    className="bg-white/5 border-white/10 text-white h-12"
                                />
                                <div className="flex justify-between text-[11px] text-white/30">
                                    <span>Totaal: {(stoppingSession.peopleCount * stopHoursPerPerson).toFixed(1)} uur</span>
                                    <span>8:00-18:00 (1u pauze) = 9u</span>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="ghost"
                                    onClick={() => setStoppingSession(null)}
                                    className="flex-1 text-white/60 hover:text-white"
                                >
                                    Annuleren
                                </Button>
                                <Button
                                    onClick={handleStopSession}
                                    disabled={stopTaskSessionMutation.isPending}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                                >
                                    {stopTaskSessionMutation.isPending ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            Opslaan...
                                        </div>
                                    ) : (
                                        "Afronden & Opslaan"
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Smart Entry - Calculator Interface */}
            <Card className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-md border-white/10 shadow-xl">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Calculator className="h-5 w-5 text-primary" />
                            Nieuwe Registratie
                        </CardTitle>
                        {/* Mode Toggle */}
                        <div className="flex bg-white/5 rounded-lg p-1">
                            <button
                                type="button"
                                onClick={() => setMode("register")}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                                    mode === "register"
                                        ? "bg-primary text-white"
                                        : "text-white/40 hover:text-white/60"
                                )}
                            >
                                Direct registreren
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("start")
                                    setStartDateTime(getDefaultStartDateTime())
                                }}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                                    mode === "start"
                                        ? "bg-orange-500 text-white"
                                        : "text-white/40 hover:text-white/60"
                                )}
                            >
                                <Play className="h-3 w-3" />
                                Taak starten
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Row 1: Task + Parcel */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Taak</Label>
                                <Select value={selectedTaskType} onValueChange={setSelectedTaskType}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-12">
                                        <SelectValue placeholder="Selecteer taak..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10">
                                        {taskTypes.map(type => (
                                            <SelectItem key={type.id} value={type.id} className="text-white hover:bg-white/10">
                                                {type.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Perceel (optioneel)</Label>
                                <Select value={selectedSubParcel || "__none__"} onValueChange={(v) => setSelectedSubParcel(v === "__none__" ? "" : v)}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-12">
                                        <SelectValue placeholder="Selecteer perceel..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10">
                                        <SelectItem value="__none__" className="text-white/50 hover:bg-white/10">
                                            Geen perceel
                                        </SelectItem>
                                        {parcels.map(parcel => (
                                            <SelectItem key={parcel.id} value={parcel.id} className="text-white hover:bg-white/10">
                                                {parcel.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Mode-specific fields */}
                        {mode === "start" ? (
                            <>
                                {/* Start Mode: DateTime + People Count */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Starttijd</Label>
                                        <Input
                                            type="datetime-local"
                                            value={startDateTime}
                                            onChange={(e) => setStartDateTime(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-12"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Aantal personen</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={peopleCount}
                                            onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="bg-white/5 border-white/10 text-white h-12"
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Register Mode: Date Range */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Begindatum</Label>
                                        <Input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-12"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Einddatum</Label>
                                        <Input
                                            type="date"
                                            value={endDate}
                                            min={startDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-12"
                                        />
                                    </div>
                                </div>

                                {/* Register Mode: Calculator */}
                                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                                    <div className="flex flex-wrap items-center gap-4 text-white">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={1}
                                                value={peopleCount}
                                                onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-20 h-14 text-2xl font-black text-center bg-white/10 border-white/20"
                                            />
                                            <span className="text-white/40 font-bold">personen</span>
                                        </div>

                                        <span className="text-3xl font-black text-white/20">×</span>

                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={0.5}
                                                step={0.5}
                                                value={hoursPerPerson}
                                                onChange={(e) => setHoursPerPerson(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                                className="w-20 h-14 text-2xl font-black text-center bg-white/10 border-white/20"
                                            />
                                            <span className="text-white/40 font-bold">uur p.p.</span>
                                        </div>

                                        <span className="text-3xl font-black text-white/20">×</span>

                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={0.5}
                                                step={0.5}
                                                value={days}
                                                onChange={(e) => setDays(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                                className="w-20 h-14 text-2xl font-black text-center bg-amber-500/20 border-amber-500/30 text-amber-400"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-amber-400/80 font-bold">dagen</span>
                                                <span className="text-[10px] text-white/30">(za=0.5, zo=0)</span>
                                            </div>
                                        </div>

                                        <span className="text-3xl font-black text-white/20">=</span>

                                        <div className="flex items-center gap-2 bg-primary/20 px-6 py-3 rounded-xl border border-primary/30">
                                            <span className="text-3xl font-black text-primary">{totalHours.toFixed(1)}</span>
                                            <span className="text-primary/60 font-bold">uur totaal</span>
                                        </div>

                                        {estimatedCost > 0 && (
                                            <div className="ml-auto text-right">
                                                <div className="text-lg font-black text-emerald-400">
                                                    {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(estimatedCost)}
                                                </div>
                                                <div className="text-[10px] text-white/30 uppercase font-bold">geschat</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Row 4: Notes */}
                        <div className="space-y-2">
                            <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Notities (optioneel)</Label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Bijv. 'Hoog blok afgerond'"
                                className="bg-white/5 border-white/10 text-white min-h-[48px] resize-none"
                            />
                        </div>

                        {/* Submit */}
                        <Button
                            type="submit"
                            disabled={!selectedTaskType || (mode === "register" && days <= 0) || addTaskLogMutation.isPending || startTaskSessionMutation.isPending}
                            className={cn(
                                "w-full h-14 text-lg font-black disabled:opacity-50",
                                mode === "start" ? "bg-orange-500 hover:bg-orange-600" : "bg-primary hover:bg-primary/90"
                            )}
                        >
                            {(addTaskLogMutation.isPending || startTaskSessionMutation.isPending) ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    {mode === "start" ? "Starten..." : "Opslaan..."}
                                </div>
                            ) : mode === "start" ? (
                                <div className="flex items-center gap-2">
                                    <Play className="h-5 w-5" />
                                    Taak Starten
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Plus className="h-5 w-5" />
                                    Registratie Opslaan
                                </div>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Recent Logs */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Recente Registraties</h2>
                    </div>
                    {taskLogs.length > 10 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAllLogs(!showAllLogs)}
                            className="text-xs text-white/40 hover:text-white"
                        >
                            {showAllLogs ? (
                                <>Minder tonen <ChevronUp className="h-3 w-3 ml-1" /></>
                            ) : (
                                <>Alle {taskLogs.length} tonen <ChevronDown className="h-3 w-3 ml-1" /></>
                            )}
                        </Button>
                    )}
                </div>

                {taskLogs.length === 0 ? (
                    <Card className="bg-white/5 border-white/10">
                        <CardContent className="p-8 text-center">
                            <Clock className="h-12 w-12 text-white/10 mx-auto mb-4" />
                            <p className="text-white/40 font-medium">Nog geen registraties</p>
                            <p className="text-white/20 text-sm mt-1">Voeg je eerste urenregistratie toe hierboven</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {displayedLogs.map((log: TaskLogEnriched) => (
                            <Card key={log.id} className="bg-white/5 border-white/5 hover:bg-white/[0.08] transition-all group">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                                                <Clock className="h-5 w-5 text-white/20" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white">{log.taskTypeName}</span>
                                                    {log.subParcelName && (
                                                        <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-white/60">
                                                            <MapPin className="h-2.5 w-2.5 mr-1" />
                                                            {log.subParcelName}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-white/40 mt-1">
                                                    <span className="flex items-center gap-1">
                                                        <CalendarDays className="h-3 w-3" />
                                                        {format(log.startDate, "d MMM", { locale: nl })}
                                                        {log.startDate.getTime() !== log.endDate.getTime() && (
                                                            <> - {format(log.endDate, "d MMM", { locale: nl })}</>
                                                        )}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {log.peopleCount}p × {log.hoursPerPerson}u × {log.days}d
                                                    </span>
                                                    {log.notes && (
                                                        <span className="text-white/30 truncate max-w-[200px]" title={log.notes}>
                                                            "{log.notes}"
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-xl font-black text-white">{log.totalHours}u</div>
                                                <div className="text-[10px] text-emerald-400/60 font-bold">
                                                    {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(log.estimatedCost)}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(log.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
