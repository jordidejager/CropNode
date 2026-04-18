'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calculator, Play, Plus, Euro, Info, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType, ParcelGroupOption, ParcelSelection, WorkScheduleDay, TaskLogEnriched } from '@/lib/types'
import { ParcelSelector } from './ParcelSelector'
import { DateShortcuts } from './DateShortcuts'
import { TimeShortcuts } from './TimeShortcuts'
import { calculateWorkDays, describeSchedule, getDefaultStartDateTime, dateTimeLocalToDate } from './utils'
import { SpotlightCard } from './primitives/SpotlightCard'
import { SectionHeader } from './primitives/SectionHeader'
import { BigStepper } from './primitives/BigStepper'
import { SmartDateField } from './primitives/SmartDateField'
import { colorForTaskType, tokensFor } from '@/lib/urenregistratie/task-colors'

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
        <SpotlightCard variant="section" color="emerald" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <SectionHeader
                    pill={mode === 'register' ? 'Achteraf' : 'Nu starten'}
                    color={mode === 'register' ? 'emerald' : 'orange'}
                    title="Nieuwe registratie"
                    description={
                        mode === 'register'
                            ? 'Voer achteraf in hoeveel uren er gewerkt is (één of meerdere dagen).'
                            : 'Start nu een timer en rond af zodra de taak klaar is.'
                    }
                    compact
                />

                {/* Mode-toggle: 2 grote pill-knoppen */}
                <div
                    role="tablist"
                    aria-label="Kies invoermodus"
                    className="flex items-center gap-1 rounded-2xl bg-white/[0.03] border border-white/[0.08] p-1 self-start flex-shrink-0"
                >
                    <button
                        role="tab"
                        aria-selected={mode === 'register'}
                        type="button"
                        onClick={() => setMode('register')}
                        className={cn(
                            'flex items-center gap-2 px-5 rounded-xl text-sm font-semibold transition-all min-h-[52px]',
                            mode === 'register'
                                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.08)]'
                                : 'text-white/55 border border-transparent hover:text-white hover:bg-white/[0.04]',
                        )}
                    >
                        <Calculator className="h-4 w-4" />
                        Uren invoeren
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === 'start'}
                        type="button"
                        onClick={() => {
                            setMode('start')
                            setStartDateTime(getDefaultStartDateTime())
                        }}
                        className={cn(
                            'flex items-center gap-2 px-5 rounded-xl text-sm font-semibold transition-all min-h-[52px]',
                            mode === 'start'
                                ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 shadow-[0_0_24px_rgba(249,115,22,0.08)]'
                                : 'text-white/55 border border-transparent hover:text-white hover:bg-white/[0.04]',
                        )}
                    >
                        <Play className="h-4 w-4 fill-current" />
                        Timer starten
                    </button>
                </div>
            </div>

            {/* "Kopieer vorige" — zichtbaar wanneer er een vorige registratie is */}
            {lastLog && (
                <button
                    type="button"
                    onClick={handleCopyFromLast}
                    className="inline-flex items-center gap-2 self-start text-sm font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-full px-4 py-2 min-h-[44px] transition-colors"
                    aria-label={`Instellingen overnemen uit vorige registratie: ${lastLog.taskTypeName}`}
                >
                    <Copy className="h-4 w-4" />
                    <span>
                        Neem vorige over: <span className="font-semibold">{lastLog.taskTypeName}</span>
                        {lastLog.subParcelName && (
                            <span className="text-emerald-200/80"> ({lastLog.subParcelName})</span>
                        )}
                    </span>
                </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Taakselectie — kleur-chips i.p.v. Select dropdown */}
                <div className="space-y-2.5">
                    <Label className={LABEL_CLASS}>Taak</Label>
                    {taskTypes.length === 0 ? (
                        <div className="flex items-center gap-2 h-14 px-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
                            Geen taaktypes gevonden. Voeg er een toe via Beheer.
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {taskTypes.map(type => {
                                    const color = colorForTaskType(type.id, type.color)
                                    const tokens = tokensFor(color)
                                    const active = selectedTaskType === type.id
                                    return (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setSelectedTaskType(type.id)}
                                            className={cn(
                                                'relative flex items-center justify-center gap-2 rounded-2xl border transition-all font-semibold text-sm min-h-[56px] px-4',
                                                active
                                                    ? cn('border-2', tokens.bgSubtle, tokens.text, tokens.border, 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]')
                                                    : 'border-white/[0.08] bg-white/[0.02] text-white/65 hover:bg-white/[0.05] hover:text-white',
                                            )}
                                            aria-pressed={active}
                                        >
                                            {active && <Check className="h-4 w-4" strokeWidth={3} />}
                                            <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', tokens.orb, !active && 'opacity-60')} />
                                            <span className="truncate">{type.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
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

                    {mode === 'start' ? (
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className={LABEL_CLASS}>Starttijd</Label>
                                    <Input
                                        type="datetime-local"
                                        value={startDateTime}
                                        onChange={(e) => setStartDateTime(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white h-14 text-base"
                                    />
                                    <TimeShortcuts
                                        currentValue={startDateTime}
                                        onSelect={setStartDateTime}
                                    />
                                </div>
                                <BigStepper
                                    label="Aantal personen"
                                    value={peopleCount}
                                    onChange={setPeopleCount}
                                    min={1}
                                    max={50}
                                    step={1}
                                    suffix={peopleCount === 1 ? 'persoon' : 'personen'}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-5">
                                <SmartDateField
                                    label="Begindatum"
                                    value={startDate}
                                    onChange={(v) => {
                                        setStartDate(v)
                                        // Als einddatum voor begindatum, sync einddatum
                                        if (v > endDate) setEndDate(v)
                                    }}
                                />
                                {/* Einddatum alleen tonen als gebruiker multi-day wil */}
                                <div className="flex flex-col gap-2">
                                    <Label className={LABEL_CLASS}>
                                        Einddatum <span className="font-normal text-white/50">(optioneel — voor meerdere dagen)</span>
                                    </Label>
                                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                        <Input
                                            type="date"
                                            value={endDate}
                                            min={startDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-white/5 border-white/10 text-white h-14 text-base flex-1"
                                        />
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
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <BigStepper
                                        label="Aantal personen"
                                        value={peopleCount}
                                        onChange={setPeopleCount}
                                        min={1}
                                        max={50}
                                        step={1}
                                        suffix={peopleCount === 1 ? 'persoon' : 'personen'}
                                    />
                                    <BigStepper
                                        label="Uren per persoon"
                                        value={hoursPerPerson}
                                        onChange={setHoursPerPerson}
                                        min={0.5}
                                        max={16}
                                        step={0.5}
                                        suffix="uur"
                                    />
                                </div>
                            </div>

                            {/* Totalen — live preview */}
                            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.05] to-emerald-500/[0.01] p-4 md:p-5">
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-white">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-white tabular-nums">{peopleCount}</span>
                                        <span className="text-sm text-white/60 font-medium">pers</span>
                                    </div>
                                    <span className="text-xl font-black text-white/20">×</span>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-white tabular-nums">{hoursPerPerson.toFixed(1).replace('.', ',')}</span>
                                        <span className="text-sm text-white/60 font-medium">uur</span>
                                    </div>
                                    <span className="text-xl font-black text-white/20">×</span>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-amber-300 tabular-nums">{days.toFixed(1).replace('.', ',')}</span>
                                        <span className="text-sm text-amber-200/70 font-medium">dag</span>
                                    </div>
                                    <span className="text-xl font-black text-white/20">=</span>
                                    <div className="flex items-baseline gap-1.5 bg-emerald-500/15 px-4 py-2 rounded-xl border border-emerald-500/30">
                                        <span className="text-3xl font-black text-emerald-300 tabular-nums">{totalHours.toFixed(1).replace('.', ',')}</span>
                                        <span className="text-sm text-emerald-200/80 font-semibold">uur</span>
                                    </div>
                                    {estimatedCost > 0 && (
                                        <div className="ml-auto text-right">
                                            <div className="text-2xl font-black text-emerald-400">
                                                {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(estimatedCost)}
                                            </div>
                                            <div className="text-xs text-white/50 font-semibold">geschat</div>
                                        </div>
                                    )}
                                </div>
                                <p className="flex items-start gap-1.5 text-sm text-white/55 mt-3">
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>
                                        Dagverdeling uit je werkschema —{' '}
                                        <span className="font-medium text-white/75">{scheduleDescription}</span>
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
                            className="bg-white/5 border-white/10 text-white text-base min-h-[80px]"
                        />
                    </div>

                    {/* Inline validatie: maakt duidelijk WAAROM de knop uit staat */}
                    {validationMessage && (
                        <div className="flex items-center gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
                            <Info className="h-4 w-4 shrink-0" />
                            {validationMessage}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                            type="submit"
                            disabled={!!validationMessage || isSubmitting}
                            className={cn(
                                'flex-1 min-h-[64px] text-lg font-black disabled:opacity-50 shadow-lg',
                                mode === 'start'
                                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'
                                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20',
                            )}
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    {mode === 'start' ? 'Starten...' : 'Opslaan...'}
                                </div>
                            ) : mode === 'start' ? (
                                <div className="flex items-center gap-2">
                                    <Play className="h-5 w-5 fill-white" />
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
                        {mode === 'register' && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!!validationMessage || isSubmitting}
                                onClick={() => void submitRegistration(true)}
                                aria-label="Opslaan en doorgaan met volgende dag, zelfde taak en uren"
                                className="sm:w-auto min-h-[64px] px-5 text-base font-semibold bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white disabled:opacity-50"
                            >
                                Opslaan & volgende dag
                            </Button>
                        )}
                    </div>
                </form>
        </SpotlightCard>
    )
}
