"use client"

import * as React from "react"
import { Plus, Trash2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WeightedValue } from "@/lib/types"
import { cn } from "@/lib/utils"

interface WeightedInputGroupProps<T> {
    label: string
    values: WeightedValue<T>[]
    onChange: (values: WeightedValue<T>[]) => void
    renderInput: (value: T, index: number, onInputChange: (newValue: T) => void) => React.ReactNode
    defaultValue: T
    unit?: string
}

export function WeightedInputGroup<T>({
    label,
    values = [],
    onChange,
    renderInput,
    defaultValue,
    unit
}: WeightedInputGroupProps<T>) {

    // Ensure we always have at least one entry if empty
    React.useEffect(() => {
        if (values.length === 0) {
            onChange([{ value: defaultValue, percentage: 100 }])
        }
    }, [values, defaultValue, onChange])

    const totalPercentage = values.reduce((sum, item) => sum + (item.percentage || 0), 0)
    const isInvalid = totalPercentage !== 100

    const addRow = () => {
        const remaining = Math.max(0, 100 - totalPercentage)
        onChange([...values, { value: defaultValue, percentage: remaining }])
    }

    const removeRow = (index: number) => {
        if (values.length <= 1) return
        const newValues = values.filter((_, i) => i !== index)
        // Auto-distribute the removed percentage to the first row to keep it close to 100
        if (newValues.length > 0) {
            newValues[0].percentage += values[index].percentage
        }
        onChange(newValues)
    }

    const updateValue = (index: number, newValue: T) => {
        const newValues = [...values]
        newValues[index] = { ...newValues[index], value: newValue }
        onChange(newValues)
    }

    const updatePercentage = (index: number, newPercentage: string) => {
        const val = newPercentage === '' ? NaN : parseInt(newPercentage)
        const newValues = [...values]
        newValues[index] = { ...newValues[index], percentage: val }
        onChange(newValues)
    }

    return (
        <div className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</Label>
                <div className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
                    isInvalid ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                )}>
                    {isInvalid && <AlertCircle className="h-3 w-3" />}
                    {totalPercentage}% {unit && `van ${unit}`}
                </div>
            </div>

            <div className="space-y-2">
                {values.map((item, index) => (
                    <div
                        key={index}
                        className="flex gap-2 items-center animate-in fade-in slide-in-from-top-1 duration-200"
                    >
                        <div className="flex-1">
                            {renderInput(item.value, index, (val) => updateValue(index, val))}
                        </div>
                        <div className="w-20 relative">
                            <Input
                                type="number"
                                value={Number.isNaN(item.percentage) ? "" : item.percentage}
                                onChange={(e) => updatePercentage(index, e.target.value)}
                                className={cn(
                                    "h-9 bg-black/40 border-white/10 text-right pr-6 font-mono text-sm",
                                    isInvalid && "border-rose-500/30"
                                )}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30">%</span>
                        </div>
                        {values.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRow(index)}
                                className="h-9 w-9 text-white/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={addRow}
                className="w-full h-8 border-dashed border-white/10 bg-transparent hover:bg-white/5 text-white/40 hover:text-white text-[10px] uppercase font-bold tracking-widest"
            >
                <Plus className="h-3 w-3 mr-2" /> Toevoegen
            </Button>
        </div>
    )
}
