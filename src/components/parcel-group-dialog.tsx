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
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Apple, Leaf, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SprayableParcel } from "@/lib/supabase-store"

interface ParcelGroupDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    allParcels: SprayableParcel[]
    initialName?: string
    initialSelectedIds?: Set<string>
    onSave: (name: string, subParcelIds: string[]) => void
}

export function ParcelGroupDialog({
    isOpen,
    onOpenChange,
    allParcels,
    initialName = "",
    initialSelectedIds,
    onSave,
}: ParcelGroupDialogProps) {
    const [name, setName] = React.useState(initialName)
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(initialSelectedIds || new Set())
    const [search, setSearch] = React.useState("")

    React.useEffect(() => {
        if (isOpen) {
            setName(initialName)
            setSelectedIds(initialSelectedIds || new Set())
            setSearch("")
        }
    }, [isOpen, initialName, initialSelectedIds])

    const filteredParcels = React.useMemo(() => {
        if (!search.trim()) return allParcels
        const q = search.toLowerCase()
        return allParcels.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.crop?.toLowerCase().includes(q) ||
            p.variety?.toLowerCase().includes(q)
        )
    }, [allParcels, search])

    const toggleParcel = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const toggleAll = () => {
        const allFilteredIds = filteredParcels.map(p => p.id)
        const allSelected = allFilteredIds.every(id => selectedIds.has(id))
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (allSelected) {
                allFilteredIds.forEach(id => next.delete(id))
            } else {
                allFilteredIds.forEach(id => next.add(id))
            }
            return next
        })
    }

    const handleSave = () => {
        if (!name.trim() || selectedIds.size === 0) return
        onSave(name.trim(), Array.from(selectedIds))
        onOpenChange(false)
    }

    const isValid = name.trim().length > 0 && selectedIds.size > 0

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-card/95 backdrop-blur-xl border-white/10 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-black text-white">
                        {initialName ? "Groep bewerken" : "Nieuwe Groep"}
                    </DialogTitle>
                    <DialogDescription className="text-white/50">
                        Combineer percelen in een groep zodat de Slimme Invoer ze herkent.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Groepsnaam</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder='bijv. "Jonge percelen" of "Bij huis"'
                            className="h-10 bg-black/20 border-white/10"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">
                                Percelen ({selectedIds.size} geselecteerd)
                            </Label>
                            <button
                                onClick={toggleAll}
                                className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-widest"
                            >
                                {filteredParcels.every(p => selectedIds.has(p.id)) ? "Geen" : "Alles"}
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Zoek perceel..."
                                className="h-8 pl-9 text-sm bg-black/20 border-white/10"
                            />
                        </div>

                        <div className="max-h-[280px] overflow-y-auto custom-scrollbar space-y-1 rounded-xl bg-black/20 p-2 border border-white/5">
                            {filteredParcels.map((parcel) => (
                                <label
                                    key={parcel.id}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                                        selectedIds.has(parcel.id)
                                            ? "bg-primary/10 border border-primary/20"
                                            : "hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    <Checkbox
                                        checked={selectedIds.has(parcel.id)}
                                        onCheckedChange={() => toggleParcel(parcel.id)}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-semibold text-white truncate block">
                                            {parcel.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] font-black uppercase border-none px-1.5 py-0",
                                            parcel.crop === 'Appel' ? "bg-rose-500/10 text-rose-400" :
                                                parcel.crop === 'Peer' ? "bg-emerald-500/10 text-emerald-400" :
                                                    "bg-amber-500/10 text-amber-400"
                                        )}>
                                            {parcel.crop === 'Appel' ? <Apple className="h-2.5 w-2.5 mr-0.5" /> : <Leaf className="h-2.5 w-2.5 mr-0.5" />}
                                            {parcel.crop}
                                        </Badge>
                                        <span className="text-[10px] text-white/30">{(parcel.area || 0).toFixed(2)} ha</span>
                                    </div>
                                </label>
                            ))}
                            {filteredParcels.length === 0 && (
                                <p className="text-center text-sm text-white/30 py-4">Geen percelen gevonden</p>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
                    <Button
                        disabled={!isValid}
                        onClick={handleSave}
                        className={cn(
                            "bg-primary hover:bg-primary/90 text-primary-foreground font-black px-6 rounded-full",
                            !isValid && "opacity-50 grayscale cursor-not-allowed"
                        )}
                    >
                        Groep Opslaan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
