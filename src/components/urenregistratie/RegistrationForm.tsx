'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Calculator, Play, Plus, Euro, Info, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType, ParcelGroupOption, ParcelSelection, WorkScheduleDay, TaskLogEnriched } from '@/lib/types'
import { ParcelSelector } from './ParcelSelector'
import { DateShortcuts } from './DateShortcuts'
import { TimeShortcuts } from './TimeShortcuts'
import { calculateWorkDays, describeSchedule, getDefaultStartDateTime, dateTimeLocalToDate } from './utils'

interface RegistrationFormProps {
    taskTypes: TaskType[]
    parcelGroups: ParcelGroupOption[]
    workSchedule?: WorkScheduleDay[]
    lastLog?: TaskLogEnriched | null
    onRegister: (data: {
        startDate: Date
        endDate: Date
        days: number
        subParcelId: string | null
        parcelId: string | null
        taskTypeId: string
        peopleCount: number
        hoursPerPerson: number
        notes: string | null
    }) => Promise<void>
    onStartSession: (data: {
        taskTypeId: string
        subParcelId: string | null
        parcelId: string | null
        startTime: Date
        peopleCount: number
        notes: string | null
    }) => Promise<void>
    isSubmitting: boolean
}

const EMPTY_SELECTION: ParcelSelection = { kind: 'none' }

/**
 * Label style helper — opzettelijk NIET uppercase/tracking-widest zoals oude stijl.
 * 14px semibold lezen veel makkelijker voor oudere gebruikers.
 */
const LABEL_CLASS = 'text-white/80 text-sm font-semibold'

export function RegistrationForm({ taskTypes, parcelGroups, workSchedule, lastLog, onRegister, onStartSession, isSubmitting }: RegistrationFormProps) {
    // 'register' = uren achteraf invoeren; 'start' = live timer starten
    const [mode, setMode] = React.useState<"register" | "start">("register")
    const [selectedTaskType, setSelectedTaskType] = React.useState<string>("")
    const [parcelSelection, setParcelSelection] = React.useState<ParcelSelection>(EMPTY_SELECTION)
    const [peopleCount, setPeopleCount] = React.useState<number>(1)
    const [hoursPerPerson, setHoursPerPerson] = React.useState<number>(9)
    const [startDate, setStartDate] = React.useState<string>(new Date().toISOString().split('T')[0])
    const [endDate, setEndDate] = React.useState<string>(new Date().toISOString().split('T')[0])
    const [days, setDays] = React.useState<number>(1)
    const [notes, setNotes] = React.useState<string>("")
    const [startDateTime, setStartDateTime] = React.useState<string>(getDefaultStartDateTime())

    React.useEffect(() => {
        const start = new Date(startDate)
        const end = new Date(endDate)
        const calculatedDays = calculateWorkDays(start, end, workSchedule)
        setDays(calculatedDays)
    }, [startDate, endDate, workSchedule])

    const scheduleDescription = React.useMemo(
        () => describeSchedule(workSchedule),
        [workSchedule],
    )

    const totalHours = peopleCount * hoursPerPerson * days

    const selectedTaskTypeData = taskTypes.find(t => t.id === selectedTaskType)
    const estimatedCost = selectedTaskTypeData
        ? totalHours * selectedTaskTypeData.defaultHourlyRate
        : 0

    /**
     * Neem taak + perceel + personen + uren over uit laatste registratie.
     * Datums worden bewust NIET overgenomen — die kiest de gebruiker per keer.
     */
    const handleCopyFromLast = () => {
        if (!lastLog) return
        setSelectedTaskType(lastLog.taskTypeId)
        setPeopleCount(lastLog.peopleCount)
        setHoursPerPerson(lastLog.hoursPerPerson)
        setNotes('')  // notitie bewust leeg — oude kan misleidend zijn

        // Reconstrueer parcel-selectie uit laatste log
        if (lastLog.subParcelId) {
            // Vind subperceel in de groepen
            for (const group of parcelGroups) {
                const sub = group.subParcels.find(s => s.id === lastLog.subParcelId)
                if (sub) {
                    setParcelSelection({
                        kind: 'sub',
                        subParcelId: sub.id,
                        parcelId: group.parcelId,
                        label: sub.name,
                    })
                    return
                }
            }
            setParcelSelection(EMPTY_SELECTION)
        } else if (lastLog.parcelId) {
            const group = parcelGroups.find(g => g.parcelId === lastLog.parcelId)
            if (group) {
                setParcelSelection({
                    kind: 'whole',
                    parcelId: group.parcelId,
                    label: group.parcelName,
                })
            } else {
                setParcelSelection(EMPTY_SELECTION)
            }
        } else {
            setParcelSelection(EMPTY_SELECTION)
        }
    }

    // Translate the selector's discriminated union into the two nullable id's
    // the API / store expects. Exactly one (or neither) is non-null.
    const { subParcelId, parcelId } = React.useMemo(() => {
        if (parcelSelection.kind === 'sub') {
            return { subParcelId: parcelSelection.subParcelId, parcelId: null }
        }
        if (parcelSelection.kind === 'whole') {
            return { subParcelId: null, parcelId: parcelSelection.parcelId }
        }
        return { subParcelId: null, parcelId: null }
    }, [parcelSelection])

    // Inline validation: laat de gebruiker weten wat er nog mist,
    // i.p.v. stilletjes de knop uit te schakelen.
    const validationMessage = (() => {
        if (!selectedTaskType) return 'Kies eerst een taak'
        if (mode === 'register' && days <= 0) return 'Kies een einddatum na de begindatum'
        return null
    })()

    /**
     * @param continueMode — true: behoud taak/uren/personen zodat gebruiker
     *   serie-registraties kan doen; datums schuiven één dag op.
     *   false: volledige reset (standaardgedrag).
     */
    const submitRegistration = async (continueMode: boolean) => {
        if (validationMessage) return

        try {
            if (mode === "start") {
                await onStartSession({
                    taskTypeId: selectedTaskType,
                    subParcelId,
                    parcelId,
                    startTime: dateTimeLocalToDate(startDateTime),
                    peopleCount,
                    notes: notes || null,
                })
            } else {
                await onRegister({
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    days,
                    subParcelId,
                    parcelId,
                    taskTypeId: selectedTaskType,
                    peopleCount,
                    hoursPerPerson,
                    notes: notes || null,
                })
            }

            if (continueMode && mode === "register") {
                // Behoud taak, personen, uren. Wis perceel + notitie. Schuif datum +1 dag.
                const shiftOneDay = (iso: string) => {
                    const d = new Date(iso)
                    d.setDate(d.getDate() + 1)
                    return d.toISOString().split('T')[0]
                }
                const nextStart = shiftOneDay(startDate)
                const nextEnd = shiftOneDay(endDate)
                setStartDate(nextStart)
                setEndDate(nextEnd)
                setParcelSelection(EMPTY_SELECTION)
                setNotes("")
                // taak, personen, uren blijven staan
            } else {
                // Volledige reset
                setSelectedTaskType("")
                setParcelSelection(EMPTY_SELECTION)
                setPeopleCount(1)
                setHoursPerPerson(9)
                setStartDate(new Date().toISOString().split('T')[0])
                setEndDate(new Date().toISOString().split('T')[0])
                setDays(1)
                setNotes("")
                setStartDateTime(getDefaultStartDateTime())
            }
        } catch (error) {
            console.error("Error adding task:", error)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        void submitRegistration(false)
    }

    return (
        <Card className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-md border-white/10 shadow-xl">
            <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-white text-xl">
                        <Calculator className="h-5 w-5 text-primary" />
                        Nieuwe registratie
                    </CardTitle>
                    <div
                        role="tablist"
                        aria-label="Kies invoermodus"
                        className="flex bg-white/5 rounded-lg p-1 self-start sm:self-auto"
                    >
                        <button
                            role="tab"
                            aria-selected={mode === 'register'}
                            type="button"
                            onClick={() => setMode("register")}
                            className={cn(
                                "px-4 py-2.5 text-sm font-bold rounded-md transition-all min-h-[44px]",
                                mode === "register"
                                    ? "bg-primary text-white"
                                    : "text-white/60 hover:text-white"
                            )}
                        >
                            Uren invoeren
                        </button>
                        <button
                            role="tab"
                            aria-selected={mode === 'start'}
                            type="button"
                            onClick={() => {
                                setMode("start")
                                setStartDateTime(getDefaultStartDateTime())
                            }}
                            className={cn(
                                "px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center gap-1.5 min-h-[44px]",
                                mode === "start"
                                    ? "bg-orange-500 text-white"
                                    : "text-white/60 hover:text-white"
                            )}
                        >
                            <Play className="h-3.5 w-3.5" />
                            Timer starten
                        </button>
                    </div>
                </div>
                {/* Uitleg van de gekozen modus — expliciet i.p.v. jargon */}
                <p className="text-sm text-white/60 mt-1">
                    {mode === 'register'
                        ? 'Voer achteraf in hoeveel uren er gewerkt is (één of meerdere dagen).'
                        : 'Start nu een timer en rond af zodra de taak klaar is.'}
                </p>
                {/* "Kopieer vorige" — zichtbaar wanneer er een vorige registratie is.
                    Voorkomt dat de gebruiker alles opnieuw invoert voor seriewerk. */}
                {lastLog && (
                    <button
                        type="button"
                        onClick={handleCopyFromLast}
                        className="mt-2 inline-flex items-center gap-2 self-start text-sm font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-full px-3.5 py-2 min-h-[40px] transition-colors"
                        aria-label={`Instellingen overnemen uit vorige registratie: ${lastLog.taskTypeName}`}
                    >
                        <Copy className="h-3.5 w-3.5" />
                        <span>
                            Neem vorige over: <span className="font-semibold">{lastLog.taskTypeName}</span>
                            {lastLog.subParcelName && (
                                <span className="text-emerald-200/80"> ({lastLog.subParcelName})</span>
                            )}
                        </span>
                    </button>
                )}
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Row 1: Task + Parcel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className={LABEL_CLASS}>Taak</Label>
                            {taskTypes.length === 0 ? (
                                <div className="flex items-center gap-2 h-12 px-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
                                    Geen taaktypes gevonden. Voeg er een toe via Beheer.
                                </div>
                            ) : (
                                <>
                                    <Select value={selectedTaskType} onValueChange={setSelectedTaskType}>
                                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 text-base">
                                            <SelectValue placeholder="Selecteer taak..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-white/10">
                                            {taskTypes.map(type => (
                                                <SelectItem
                                                    key={type.id}
                                                    value={type.id}
                                                    className="text-white hover:bg-white/10 text-base min-h-[44px]"
                                                >
                                                    {type.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {/* Uurtarief zichtbaar — voorheen verborgen in TaskTypeManager */}
                                    {selectedTaskTypeData && (
                                        <p className="flex items-center gap-1.5 text-sm text-emerald-300/80">
                                            <Euro className="h-3.5 w-3.5" />
                                            {selectedTaskTypeData.defaultHourlyRate > 0
                                                ? `${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(selectedTaskTypeData.defaultHourlyRate)} per uur`
                                                : 'Geen tarief ingesteld'}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

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
                    </div>

                    {mode === "start" ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Starttijd</Label>
                                    <Input
                                        type="datetime-local"
                                        value={startDateTime}
                                        onChange={(e) => setStartDateTime(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white h-12 text-base"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Aantal personen</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={peopleCount}
                                        onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="bg-white/5 border-white/10 text-white h-12 text-base"
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-white/60 mb-2">
                                    Vergeten te starten? Kies een moment terug:
                                </p>
                                <TimeShortcuts
                                    currentValue={startDateTime}
                                    onSelect={setStartDateTime}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className={LABEL_CLASS}>Begindatum</Label>
                                        <Input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-12 text-base"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className={LABEL_CLASS}>Einddatum</Label>
                                        <Input
                                            type="date"
                                            value={endDate}
                                            min={startDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-12 text-base"
                                        />
                                    </div>
                                </div>
                                {/* Snelkeuze chips — veel natuurlijker voor "ik heb gisteren gewerkt" */}
                                <DateShortcuts
                                    currentStart={startDate}
                                    currentEnd={endDate}
                                    mode="range"
                                    onSelect={(s, e) => {
                                        setStartDate(s)
                                        setEndDate(e)
                                    }}
                                />
                            </div>

                            <div className="bg-white/5 rounded-2xl p-4 md:p-6 border border-white/10">
                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-white">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={peopleCount}
                                            onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-white/10 border-white/20"
                                            aria-label="Aantal personen"
                                        />
                                        <span className="text-white/70 font-semibold text-sm">pers.</span>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/30">&times;</span>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0.5}
                                            step={0.5}
                                            value={hoursPerPerson}
                                            onChange={(e) => setHoursPerPerson(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-white/10 border-white/20"
                                            aria-label="Uren per persoon"
                                        />
                                        <span className="text-white/70 font-semibold text-sm">uur</span>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/30">&times;</span>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0.5}
                                            step={0.5}
                                            value={days}
                                            onChange={(e) => setDays(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-amber-500/20 border-amber-500/40 text-amber-300"
                                            aria-label="Aantal werkdagen (zaterdag telt als 0,5)"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-amber-300 font-semibold text-sm">dag</span>
                                        </div>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/30">=</span>

                                    <div className="flex items-center gap-2 bg-primary/20 px-4 md:px-6 py-2 md:py-3 rounded-xl border border-primary/30">
                                        <span className="text-2xl md:text-3xl font-black text-primary">{totalHours.toFixed(1)}</span>
                                        <span className="text-primary/80 font-semibold text-sm">uur</span>
                                    </div>

                                    {estimatedCost > 0 && (
                                        <div className="ml-auto text-right">
                                            <div className="text-lg font-black text-emerald-400">
                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(estimatedCost)}
                                            </div>
                                            <div className="text-xs text-white/50 font-semibold">geschat</div>
                                        </div>
                                    )}
                                </div>
                                <p className="flex items-start gap-1.5 text-sm text-white/60 mt-3">
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>
                                        Dagverdeling uit je werkschema —{' '}
                                        <span className="font-medium text-white/80">{scheduleDescription}</span>
                                    </span>
                                </p>
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <Label className={LABEL_CLASS}>
                            Notitie <span className="font-normal text-white/50">(optioneel)</span>
                        </Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Bijv. 'Hoog blok afgerond'"
                            className="bg-white/5 border-white/10 text-white text-base min-h-[56px]"
                        />
                    </div>

                    {/* Inline validatie: maakt duidelijk WAAROM de knop uit staat */}
                    {validationMessage && (
                        <div className="flex items-center gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                            <Info className="h-4 w-4 shrink-0" />
                            {validationMessage}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                            type="submit"
                            disabled={!!validationMessage || isSubmitting}
                            className={cn(
                                "flex-1 h-14 text-lg font-black disabled:opacity-50",
                                mode === "start" ? "bg-orange-500 hover:bg-orange-600" : "bg-primary hover:bg-primary/90"
                            )}
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    {mode === "start" ? "Starten..." : "Opslaan..."}
                                </div>
                            ) : mode === "start" ? (
                                <div className="flex items-center gap-2">
                                    <Play className="h-5 w-5" />
                                    Timer starten
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Plus className="h-5 w-5" />
                                    Uren opslaan
                                </div>
                            )}
                        </Button>
                        {/* Serie-registratie: bewaar taak + uren + personen, schuif datum. */}
                        {mode === "register" && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!!validationMessage || isSubmitting}
                                onClick={() => void submitRegistration(true)}
                                aria-label="Opslaan en doorgaan met volgende dag, zelfde taak en uren"
                                className="sm:w-auto h-14 px-5 text-base font-semibold bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white disabled:opacity-50"
                            >
                                Opslaan & volgende dag
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
