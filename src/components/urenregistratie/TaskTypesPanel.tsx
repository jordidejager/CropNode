'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClipboardList, Plus, Check, X, Euro, Pencil } from 'lucide-react'
import type { TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SpotlightCard } from './primitives/SpotlightCard'
import { SectionHeader } from './primitives/SectionHeader'
import { TASK_COLORS, colorForTaskType, tokensFor, type TaskColor } from '@/lib/urenregistratie/task-colors'

/**
 * Taaktypes-beheer met kleur-picker. Elke rij is een SpotlightCard met de kleur
 * van het taaktype; de gebruiker kan een eigen kleur kiezen via de swatch-rij
 * in edit-modus.
 */

interface TaskTypesPanelProps {
    taskTypes: TaskType[]
    onAdd: (name: string, hourlyRate: number, color?: TaskColor) => Promise<void>
    onUpdate: (id: string, updates: { name?: string; defaultHourlyRate?: number; color?: string | null }) => Promise<void>
    isAdding: boolean
    isUpdating: boolean
}

const LABEL_CLASS = 'text-white/80 text-sm font-semibold'
const DEFAULT_RATE = 25

function ColorSwatchRow({
    value,
    onChange,
    disabled,
}: {
    value: TaskColor
    onChange: (color: TaskColor) => void
    disabled?: boolean
}) {
    return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kies kleur">
            {TASK_COLORS.map(c => {
                const tokens = tokensFor(c)
                const active = value === c
                return (
                    <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        disabled={disabled}
                        role="radio"
                        aria-checked={active}
                        aria-label={`Kleur ${c}`}
                        className={cn(
                            'h-8 w-8 rounded-full transition-all relative',
                            tokens.orb,
                            active
                                ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-zinc-950 scale-110'
                                : 'opacity-70 hover:opacity-100 hover:scale-105',
                            disabled && 'opacity-30 cursor-not-allowed',
                        )}
                    />
                )
            })}
        </div>
    )
}

export function TaskTypesPanel({ taskTypes, onAdd, onUpdate, isAdding, isUpdating }: TaskTypesPanelProps) {
    const [newName, setNewName] = React.useState('')
    const [newRate, setNewRate] = React.useState<number>(DEFAULT_RATE)
    const [newColor, setNewColor] = React.useState<TaskColor>('emerald')
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editRate, setEditRate] = React.useState<number>(0)
    const [editName, setEditName] = React.useState<string>('')
    const [editColor, setEditColor] = React.useState<TaskColor>('emerald')

    const handleAdd = async () => {
        if (!newName.trim()) return
        await onAdd(newName.trim(), newRate, newColor)
        setNewName('')
        setNewRate(DEFAULT_RATE)
        setNewColor('emerald')
    }

    const handleUpdate = async (id: string) => {
        await onUpdate(id, {
            name: editName.trim(),
            defaultHourlyRate: editRate,
            color: editColor,
        })
        setEditingId(null)
    }

    const startEditing = (type: TaskType) => {
        setEditingId(type.id)
        setEditName(type.name)
        setEditRate(type.defaultHourlyRate)
        setEditColor(colorForTaskType(type.id, type.color))
    }

    return (
        <SpotlightCard variant="section" color="emerald" className="space-y-5">
            <SectionHeader
                pill="Taaktypes"
                title="Taaktypes & tarieven"
                description="Per taaktype een uurtarief en kleur instellen — deze wordt gebruikt voor kostenberekening en herkenning in timers, lijsten en grafieken."
            />

            {taskTypes.length === 0 && (
                <p className="text-sm text-white/70 bg-white/[0.04] border border-white/10 rounded-xl p-4">
                    Nog geen taaktypes. Maak hieronder je eerste aan — bijvoorbeeld
                    Snoeien, Dunnen of Plukken.
                </p>
            )}

            {taskTypes.length > 0 && (
                <div className="space-y-2.5">
                    {taskTypes.map(type => {
                        const taskColor = colorForTaskType(type.id, type.color)
                        const tokens = tokensFor(taskColor)
                        const isEditing = editingId === type.id

                        return (
                            <SpotlightCard
                                key={type.id}
                                variant="task"
                                color={taskColor}
                                noPadding
                                className="!p-4"
                            >
                                {isEditing ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <Input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                aria-label="Taaktype naam"
                                                className="bg-white/10 border-white/20 text-white h-14 flex-1 text-lg font-semibold"
                                            />
                                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 h-14">
                                                <Euro className="h-4 w-4 text-white/60" />
                                                <Input
                                                    type="number"
                                                    value={editRate}
                                                    onChange={(e) => setEditRate(parseFloat(e.target.value) || 0)}
                                                    aria-label="Uurtarief"
                                                    className="bg-transparent border-0 text-white h-full w-24 text-lg px-1 focus-visible:ring-0"
                                                    step={0.5}
                                                    min={0}
                                                />
                                                <span className="text-sm text-white/60">/u</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-semibold text-white/60">Kleur</span>
                                            <ColorSwatchRow value={editColor} onChange={setEditColor} disabled={isUpdating} />
                                        </div>
                                        <div className="flex items-center gap-2 pt-1">
                                            <Button
                                                onClick={() => handleUpdate(type.id)}
                                                disabled={isUpdating || !editName.trim()}
                                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 px-5 min-h-[48px]"
                                            >
                                                <Check className="h-5 w-5 mr-1.5" />
                                                Opslaan
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => setEditingId(null)}
                                                className="h-12 px-4 text-white/70 hover:text-white hover:bg-white/10 min-h-[48px]"
                                            >
                                                <X className="h-5 w-5 mr-1.5" />
                                                Annuleren
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <span
                                                className={cn(
                                                    'h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0',
                                                    tokens.bgSubtle,
                                                    'border',
                                                    tokens.border,
                                                )}
                                            >
                                                <ClipboardList className={cn('h-5 w-5', tokens.text)} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-base font-semibold text-white truncate">
                                                    {type.name}
                                                </div>
                                                <div className="text-sm mt-0.5">
                                                    {type.defaultHourlyRate > 0 ? (
                                                        <span className={tokens.text}>
                                                            {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(type.defaultHourlyRate)} per uur
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-300">Geen tarief ingesteld</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            onClick={() => startEditing(type)}
                                            aria-label={`${type.name} aanpassen`}
                                            className="h-12 px-4 text-white/80 hover:text-white hover:bg-white/10 border border-white/10 text-sm font-semibold min-h-[48px]"
                                        >
                                            <Pencil className="h-4 w-4 mr-1.5" />
                                            Aanpassen
                                        </Button>
                                    </div>
                                )}
                            </SpotlightCard>
                        )
                    })}
                </div>
            )}

            {/* Nieuw taaktype formulier */}
            <div className="border-t border-white/10 pt-5 space-y-3">
                <div className={LABEL_CLASS}>Nieuw taaktype</div>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Naam (bijv. Maaien)"
                            className="bg-white/5 border-white/10 text-white h-14 flex-1 text-base"
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 h-14 sm:w-auto">
                            <Euro className="h-4 w-4 text-white/60" />
                            <Input
                                type="number"
                                value={newRate}
                                onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
                                aria-label="Uurtarief voor nieuw taaktype"
                                className="bg-transparent border-0 text-white h-full w-20 text-base px-1 focus-visible:ring-0"
                                step={0.5}
                                min={0}
                            />
                            <span className="text-sm text-white/60">/u</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-white/60">Kleur</span>
                        <ColorSwatchRow value={newColor} onChange={setNewColor} disabled={isAdding} />
                    </div>
                    <Button
                        onClick={handleAdd}
                        disabled={!newName.trim() || isAdding}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-14 px-5 text-base self-start min-h-[56px]"
                    >
                        {isAdding ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Plus className="h-5 w-5 mr-1.5" />
                                Taaktype toevoegen
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </SpotlightCard>
    )
}
