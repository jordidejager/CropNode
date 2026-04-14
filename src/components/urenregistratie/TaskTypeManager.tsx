'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Plus, Check, X, Euro } from 'lucide-react'
import type { TaskType } from '@/lib/types'

interface TaskTypeManagerProps {
    taskTypes: TaskType[]
    onAdd: (name: string, hourlyRate: number) => Promise<void>
    onUpdate: (id: string, updates: { name?: string; defaultHourlyRate?: number }) => Promise<void>
    onClose: () => void
    isAdding: boolean
    isUpdating: boolean
}

export function TaskTypeManager({ taskTypes, onAdd, onUpdate, onClose, isAdding, isUpdating }: TaskTypeManagerProps) {
    const [newName, setNewName] = React.useState('')
    const [newRate, setNewRate] = React.useState<number>(0)
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editRate, setEditRate] = React.useState<number>(0)
    const [editName, setEditName] = React.useState<string>('')

    const handleAdd = async () => {
        if (!newName.trim()) return
        await onAdd(newName.trim(), newRate)
        setNewName('')
        setNewRate(25)
    }

    const handleUpdate = async (id: string) => {
        await onUpdate(id, { name: editName, defaultHourlyRate: editRate })
        setEditingId(null)
    }

    const startEditing = (type: TaskType) => {
        setEditingId(type.id)
        setEditName(type.name)
        setEditRate(type.defaultHourlyRate)
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="bg-slate-900 border-white/10 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                        <Settings className="h-5 w-5 text-emerald-400" />
                        Taaktypes Beheren
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-white/40 hover:text-white">
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto">
                    {/* Existing types */}
                    <div className="space-y-2">
                        {taskTypes.map(type => (
                            <div key={type.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5">
                                {editingId === type.id ? (
                                    <>
                                        <Input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="bg-white/10 border-white/20 text-white h-9 flex-1 text-sm"
                                        />
                                        <div className="flex items-center gap-1">
                                            <Euro className="h-3 w-3 text-white/30" />
                                            <Input
                                                type="number"
                                                value={editRate}
                                                onChange={(e) => setEditRate(parseFloat(e.target.value) || 0)}
                                                className="bg-white/10 border-white/20 text-white h-9 w-20 text-sm"
                                                step={0.5}
                                                min={0}
                                            />
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleUpdate(type.id)}
                                            disabled={isUpdating}
                                            className="h-9 w-9 text-emerald-400 hover:text-emerald-300"
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => setEditingId(null)}
                                            className="h-9 w-9 text-white/40 hover:text-white"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => startEditing(type)}
                                        className="flex items-center justify-between w-full text-left hover:bg-white/[0.03] rounded transition-colors"
                                    >
                                        <span className="text-sm font-medium text-white">{type.name}</span>
                                        {type.defaultHourlyRate > 0 ? (
                                            <span className="text-sm text-emerald-400/60">
                                                &euro;{type.defaultHourlyRate.toFixed(2)}/u
                                            </span>
                                        ) : (
                                            <span className="text-sm text-amber-400/60">
                                                Stel tarief in &rarr;
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add new */}
                    <div className="border-t border-white/5 pt-4">
                        <Label className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2 block">Nieuw taaktype</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Naam (bijv. Maaien)"
                                className="bg-white/5 border-white/10 text-white h-10 flex-1 text-sm"
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            />
                            <div className="flex items-center gap-1">
                                <Euro className="h-3 w-3 text-white/30" />
                                <Input
                                    type="number"
                                    value={newRate}
                                    onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
                                    className="bg-white/5 border-white/10 text-white h-10 w-20 text-sm"
                                    step={0.5}
                                    min={0}
                                />
                            </div>
                            <Button
                                onClick={handleAdd}
                                disabled={!newName.trim() || isAdding}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-10 px-4"
                            >
                                {isAdding ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
