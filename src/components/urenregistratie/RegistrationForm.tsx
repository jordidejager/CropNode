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
import { Calculator, Play, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskType } from '@/lib/types'
import { calculateWorkDays, getDefaultStartDateTime, dateTimeLocalToDate } from './utils'

interface SubParcelOption {
    id: string
    name: string
}

interface RegistrationFormProps {
    taskTypes: TaskType[]
    parcels: SubParcelOption[]
    onRegister: (data: {
        startDate: Date
        endDate: Date
        days: number
        subParcelId: string | null
        taskTypeId: string
        peopleCount: number
        hoursPerPerson: number
        notes: string | null
    }) => Promise<void>
    onStartSession: (data: {
        taskTypeId: string
        subParcelId: string | null
        startTime: Date
        peopleCount: number
        notes: string | null
    }) => Promise<void>
    isSubmitting: boolean
}

export function RegistrationForm({ taskTypes, parcels, onRegister, onStartSession, isSubmitting }: RegistrationFormProps) {
    const [mode, setMode] = React.useState<"register" | "start">("register")
    const [selectedTaskType, setSelectedTaskType] = React.useState<string>("")
    const [selectedSubParcel, setSelectedSubParcel] = React.useState<string>("")
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
        const calculatedDays = calculateWorkDays(start, end)
        setDays(calculatedDays)
    }, [startDate, endDate])

    const totalHours = peopleCount * hoursPerPerson * days

    const selectedTaskTypeData = taskTypes.find(t => t.id === selectedTaskType)
    const estimatedCost = selectedTaskTypeData
        ? totalHours * selectedTaskTypeData.defaultHourlyRate
        : 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedTaskType) return

        try {
            if (mode === "start") {
                await onStartSession({
                    taskTypeId: selectedTaskType,
                    subParcelId: selectedSubParcel || null,
                    startTime: dateTimeLocalToDate(startDateTime),
                    peopleCount,
                    notes: notes || null,
                })
            } else {
                if (days <= 0) return
                await onRegister({
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
            setHoursPerPerson(9)
            setStartDate(new Date().toISOString().split('T')[0])
            setEndDate(new Date().toISOString().split('T')[0])
            setDays(1)
            setNotes("")
            setStartDateTime(getDefaultStartDateTime())
        } catch (error) {
            console.error("Error adding task:", error)
        }
    }

    return (
        <Card className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-md border-white/10 shadow-xl">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-white">
                        <Calculator className="h-5 w-5 text-primary" />
                        Nieuwe Registratie
                    </CardTitle>
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
                            {taskTypes.length === 0 ? (
                                <div className="flex items-center gap-2 h-12 px-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
                                    Geen taaktypes gevonden. Voeg er een toe via Beheer.
                                </div>
                            ) : (
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
                            )}
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

                    {mode === "start" ? (
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
                    ) : (
                        <>
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

                            <div className="bg-white/5 rounded-2xl p-4 md:p-6 border border-white/10">
                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-white">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            value={peopleCount}
                                            onChange={(e) => setPeopleCount(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-white/10 border-white/20"
                                        />
                                        <span className="text-white/40 font-bold text-sm">pers.</span>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/20">&times;</span>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0.5}
                                            step={0.5}
                                            value={hoursPerPerson}
                                            onChange={(e) => setHoursPerPerson(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-white/10 border-white/20"
                                        />
                                        <span className="text-white/40 font-bold text-sm">uur</span>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/20">&times;</span>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0.5}
                                            step={0.5}
                                            value={days}
                                            onChange={(e) => setDays(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                            className="w-16 md:w-20 h-12 md:h-14 text-xl md:text-2xl font-black text-center bg-amber-500/20 border-amber-500/30 text-amber-400"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-amber-400/80 font-bold text-sm">dag</span>
                                            <span className="text-[10px] text-white/30">(za=0.5)</span>
                                        </div>
                                    </div>

                                    <span className="text-2xl md:text-3xl font-black text-white/20">=</span>

                                    <div className="flex items-center gap-2 bg-primary/20 px-4 md:px-6 py-2 md:py-3 rounded-xl border border-primary/30">
                                        <span className="text-2xl md:text-3xl font-black text-primary">{totalHours.toFixed(1)}</span>
                                        <span className="text-primary/60 font-bold text-sm">uur</span>
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

                    <div className="space-y-2">
                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider">Notities (optioneel)</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Bijv. 'Hoog blok afgerond'"
                            className="bg-white/5 border-white/10 text-white min-h-[48px] resize-none"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={!selectedTaskType || (mode === "register" && days <= 0) || isSubmitting}
                        className={cn(
                            "w-full h-14 text-lg font-black disabled:opacity-50",
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
    )
}
