'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClipboardList, Plus, Check, X, Euro, Pencil } from 'lucide-react'
import type { TaskType } from '@/lib/types'

/**
 * Inline versie van TaskTypeManager — zonder modal-wrapper.
 * Bedoeld voor gebruik op de /urenregistratie/beheer subpagina.
 */

interface TaskTypesPanelProps {
    taskTypes: TaskType[]
    onAdd: (name: string, hourlyRate: number) => Promise<void>
    onUpdate: (id: string, updates: { name?: string; defaultHourlyRate?: number }) => Promise<void>
    isAdding: boolean
    isUpdating: boolean
}

const LABEL_CLASS = 'text-white/80 text-sm font-semibold'
const DEFAULT_RATE = 25

export function TaskTypesPanel({ taskTypes, onAdd, onUpdate, isAdding, isUpdating }: TaskTypesPanelProps) {
    const [newName, setNewName] = React.useState('')
    const [newRate, setNewRate] = React.useState<number>(DEFAULT_RATE)
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editRate, setEditRate] = React.useState<number>(0)
    const [editName, setEditName] = React.useState<string>('')

    const handleAdd = async () => {
        if (!newName.trim()) return
        await onAdd(newName.trim(), newRate)
        setNewName('')
        setNewRate(DEFAULT_RATE)
    }

    const handleUpdate = async (id: string) => {
        await onUpdate(id, { name: editName.trim(), defaultHourlyRate: editRate })
        setEditingId(null)
    }

    const startEditing = (type: TaskType) => {
        setEditingId(type.id)
        setEditName(type.name)
        setEditRate(type.defaultHourlyRate)
    }

    return (
        <Card className="bg-white/[0.03] border-white/10">
            <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-emerald-400" />
                    Taaktypes & tarieven
                </CardTitle>
                <p className="text-sm text-white/60 mt-1">
                    Per taaktype kun je een uurtarief instellen. Dit tarief wordt automatisch
                    gebruikt voor de kostenberekening van registraties en actieve timers.
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                {taskTypes.length === 0 && (
                    <p className="text-sm text-white/70 bg-white/[0.04] border border-white/10 rounded-lg p-3">
                        Nog geen taaktypes. Maak hieronder je eerste aan — bijvoorbeeld
                        Snoeien, Dunnen of Plukken.
                    </p>
                )}

                {taskTypes.length > 0 && (
                    <div className="space-y-2">
                        <div className={LABEL_CLASS}>Bestaande taaktypes</div>
                        {taskTypes.map(type => (
                            <div key={type.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/10">
                                {editingId === type.id ? (
                                    <>
                                        <Input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            aria-label="Taaktype naam"
                                            className="bg-white/10 border-white/20 text-white h-11 flex-1 text-base"
                                        />
                                        <div className="flex items-center gap-1">
                                            <Euro className="h-4 w-4 text-white/60" />
                                            <Input
                                                type="number"
                                                value={editRate}
                                                onChange={(e) => setEditRate(parseFloat(e.target.value) || 0)}
                                                aria-label="Uurtarief"
                                                className="bg-white/10 border-white/20 text-white h-11 w-24 text-base"
                                                step={0.5}
                                                min={0}
                                            />
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleUpdate(type.id)}
                                            disabled={isUpdating || !editName.trim()}
                                            aria-label="Opslaan"
                                            className="h-11 w-11 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15"
                                        >
                                            <Check className="h-5 w-5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => setEditingId(null)}
                                            aria-label="Bewerken annuleren"
                                            className="h-11 w-11 text-white/70 hover:text-white hover:bg-white/10"
                                        >
                                            <X className="h-5 w-5" />
                                        </Button>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between w-full gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-base font-semibold text-white truncate">
                                                {type.name}
                                            </div>
                                            <div className="text-sm mt-0.5">
                                                {type.defaultHourlyRate > 0 ? (
                                                    <span className="text-emerald-300">
                                                        {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(type.defaultHourlyRate)} per uur
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-300">Geen tarief ingesteld</span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => startEditing(type)}
                                            aria-label={`${type.name} aanpassen`}
                                            className="h-10 px-3 text-white/80 hover:text-white hover:bg-white/10 border border-white/10 text-sm font-semibold"
                                        >
                                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                            Aanpassen
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="border-t border-white/10 pt-5 space-y-3">
                    <Label className={LABEL_CLASS}>Nieuw taaktype</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Naam (bijv. Maaien)"
                            className="bg-white/5 border-white/10 text-white h-12 flex-1 text-base"
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-2 h-12">
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
                            <Button
                                onClick={handleAdd}
                                disabled={!newName.trim() || isAdding}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 px-5 text-base"
                            >
                                {isAdding ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Plus className="h-5 w-5 mr-1.5" />
                                        Toevoegen
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
