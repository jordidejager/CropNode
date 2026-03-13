"use client"

import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { Plus, Trash2, AlertCircle, Info } from "lucide-react"
import { SubParcel } from "@/lib/types"
import { cn } from "@/lib/utils"

const VARIETIES: Record<string, string[]> = {
    "Appel": [
        "Elstar", "Jonagold", "Jonagored", "Rode Boskoop (Goudreinet)",
        "Golden Delicious", "Cox’s Orange Pippin", "Kanzi", "Junami",
        "Maribelle", "Wellant", "Rubens", "Santana", "Magic Star",
        "Sprank", "Tessa", "Delcorf", "Alkmene", "Rode Pinova",
        "Topaz", "Collina"
    ],
    "Peer": [
        "Conference", "Doyenné du Comice", "Beurré Alexandre Lucas",
        "Gieser Wildeman (stoofpeer)", "Xenia", "Migo", "Sweet Sensation",
        "Saint Rémy (stoofpeer)", "Triomphe de Vienne", "Beurré Hardy",
        "Clapp’s Favourite", "Bonne Louise d’Avranches",
        "Celina (merknaam QTee)", "Early Desire (Gräfin Gepa)"
    ]
}

interface ParcelComposerProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    totalArea: number
    parcelName: string
    initialItems?: { name: string, crop: string, variety: string, area: number }[]
    onSave: (subParcels: Omit<SubParcel, 'id' | 'parcelId' | 'createdAt' | 'updatedAt'>[]) => void
}

export function ParcelComposer({
    isOpen,
    onOpenChange,
    totalArea,
    parcelName,
    initialItems,
    onSave,
}: ParcelComposerProps) {
    const [items, setItems] = React.useState<any[]>([])

    // Initialize items when dialog opens/initialItems changes
    React.useEffect(() => {
        if (isOpen) {
            if (initialItems && initialItems.length > 0) {
                setItems(initialItems)
            } else {
                setItems([{ name: "Blok 1", crop: "Peer", variety: "Conference", area: totalArea }])
            }
        }
    }, [isOpen, initialItems, totalArea])

    const currentTotal = items.reduce((sum, item) => sum + (parseFloat(item.area) || 0), 0)
    const remaining = totalArea - currentTotal
    const isOverLimit = currentTotal > totalArea + 0.0001 // floating point buffer

    const isFormValid = !isOverLimit &&
        items.length > 0 &&
        items.every(i => i.crop && i.variety && (parseFloat(i.area) || 0) > 0) &&
        Math.abs(currentTotal - totalArea) < 0.001;

    const addItem = () => {
        setItems([...items, { name: `Blok ${items.length + 1}`, crop: "Peer", variety: "", area: 0 }])
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items]
        newItems[index][field] = value

        // Reset variety if crop changes and variety not in new list
        if (field === 'crop') {
            const newVarieties = VARIETIES[value] || []
            if (!newVarieties.includes(newItems[index].variety)) {
                newItems[index].variety = ""
            }
        }

        setItems(newItems)
    }

    const handleSave = () => {
        if (!isFormValid) return;
        onSave(items.map(i => ({
            name: i.name,
            crop: i.crop || "Peer",
            variety: i.variety,
            area: parseFloat(i.area) || 0,
            irrigationType: 'Geen',
        })))
        onOpenChange(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl bg-card/95 backdrop-blur-xl border-white/10 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black text-white flex items-center gap-2">
                        Perceel Componist: {parcelName}
                    </DialogTitle>
                    <DialogDescription className="text-white/60">
                        Verdeel het totale oppervlak van <span className="text-primary font-bold">{totalArea.toFixed(2)} ha</span> over verschillende rassen en blokken.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                        <div className="space-y-0.5">
                            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Verdeeld oppervlak</span>
                            <div className="flex items-baseline gap-1">
                                <span className={cn("text-2xl font-black", isOverLimit ? "text-rose-500" : "text-white")}>
                                    {currentTotal.toFixed(2)}
                                </span>
                                <span className="text-white/40 text-sm">/ {totalArea.toFixed(2)} ha</span>
                            </div>
                        </div>
                        {isOverLimit && (
                            <div className="flex items-center gap-2 text-rose-400 animate-pulse">
                                <AlertCircle className="h-5 w-5" />
                                <span className="text-xs font-bold uppercase">Te veel verdeeld!</span>
                            </div>
                        )}
                        {!isOverLimit && remaining > 0.001 && (
                            <div className="text-right space-y-0.5">
                                <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Nog te verdelen</span>
                                <div className="text-lg font-bold text-amber-500">
                                    {remaining.toFixed(2)} ha
                                </div>
                            </div>
                        )}
                        {!isOverLimit && Math.abs(remaining) <= 0.001 && (
                            <div className="text-right space-y-0.5">
                                <span className="text-[10px] text-emerald-500 uppercase font-black tracking-widest">Perfect verdeeld</span>
                                <div className="text-lg font-bold text-emerald-500">
                                    Klaar voor opslag
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {items.map((item, index) => {
                            const varietyOptions = (VARIETIES[item.crop] || []).map(v => ({ value: v, label: v }))

                            return (
                                <div key={index} className="flex gap-3 items-end bg-white/5 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                    <div className="w-32 space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-white/50">Naam Subperceel (optioneel)</Label>
                                        <Input
                                            value={item.name}
                                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                                            placeholder="bv. V-haag"
                                            className="h-10 bg-black/20 border-white/10"
                                        />
                                    </div>
                                    <div className="w-32 space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-white/50">Gewas</Label>
                                        <Select
                                            value={item.crop}
                                            onValueChange={(val) => updateItem(index, 'crop', val)}
                                        >
                                            <SelectTrigger className={cn(
                                                "h-10 bg-black/20 border-white/10 text-white",
                                                !item.crop && "border-amber-500/50"
                                            )}>
                                                <SelectValue placeholder="Kies gewas" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Appel">Appel</SelectItem>
                                                <SelectItem value="Peer">Peer</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-white/50">Ras</Label>
                                        <Combobox
                                            options={varietyOptions}
                                            value={item.variety}
                                            onValueChange={(val) => updateItem(index, 'variety', val)}
                                            placeholder="Selecteer ras..."
                                            creatable={true}
                                            className={cn(
                                                "h-10 bg-black/20 border-white/10",
                                                !item.variety && "border-amber-500/50"
                                            )}
                                        />
                                    </div>
                                    <div className="w-24 space-y-2">
                                        <Label className="text-[10px] uppercase font-bold text-white/50">Opp. (ha)</Label>
                                        <Input
                                            type="number"
                                            value={item.area}
                                            onChange={(e) => updateItem(index, 'area', e.target.value)}
                                            step="0.01"
                                            className={cn(
                                                "h-10 bg-black/20 border-white/10 font-mono text-center",
                                                (parseFloat(item.area) || 0) <= 0 && "border-amber-500/50"
                                            )}
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeItem(index)}
                                        className="h-10 w-10 text-white/20 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )
                        })}
                    </div>

                    <Button
                        variant="outline"
                        className="w-full border-dashed border-white/10 bg-white/5 hover:bg-white/10 h-10 gap-2"
                        onClick={addItem}
                    >
                        <Plus className="h-4 w-4" />
                        Nieuw Ras Toevoegen
                    </Button>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
                    <Button
                        disabled={!isFormValid}
                        onClick={handleSave}
                        className={cn(
                            "bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 rounded-full shadow-lg shadow-primary/20 transition-all",
                            !isFormValid && "opacity-50 grayscale cursor-not-allowed"
                        )}
                    >
                        Samenstelling Opslaan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
