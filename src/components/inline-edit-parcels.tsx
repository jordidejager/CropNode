"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import type { Parcel } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineEditParcelsProps {
  allParcels: Parcel[]
  selectedParcelIds: string[]
  onSelectionChange: (selectedIds: string[]) => void
}

export function InlineEditParcels({
  allParcels,
  selectedParcelIds,
  onSelectionChange,
}: InlineEditParcelsProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredParcels = useMemo(() =>
    allParcels.filter(
      (parcel) =>
        parcel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        parcel.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
        parcel.variety.toLowerCase().includes(searchTerm.toLowerCase())
    ), [allParcels, searchTerm]
  );
  
  const selectedParcels = useMemo(() => 
    selectedParcelIds.map(id => allParcels.find(p => p.id === id)).filter(Boolean) as Parcel[],
    [selectedParcelIds, allParcels]
  );

  const handleCheckboxChange = (parcelId: string, checked: boolean) => {
    const newSelection = checked
      ? [...selectedParcelIds, parcelId]
      : selectedParcelIds.filter((id) => id !== parcelId)
    onSelectionChange(newSelection)
  }

  const displayText = useMemo(() => {
    if (selectedParcels.length === 0) return "Geen percelen"
    if (selectedParcels.length <= 2) return selectedParcels.map(p => p.name).join(", ")
    return `${selectedParcels.length} percelen geselecteerd`
  }, [selectedParcels]);


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-start text-left font-normal -ml-3 p-2 h-auto",
            selectedParcelIds.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="truncate whitespace-normal">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek perceel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-2 space-y-1">
            {filteredParcels.length > 0 ? (
              filteredParcels.map((parcel) => (
                <div
                  key={parcel.id}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer"
                  onClick={() =>
                    handleCheckboxChange(
                      parcel.id,
                      !selectedParcelIds.includes(parcel.id)
                    )
                  }
                >
                  <Checkbox
                    id={`inline-parcel-${parcel.id}`}
                    checked={selectedParcelIds.includes(parcel.id)}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(parcel.id, !!checked)
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Label
                    htmlFor={`inline-parcel-${parcel.id}`}
                    className="font-normal cursor-pointer flex-1 text-sm"
                  >
                    <span className="font-medium">{parcel.name}</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      ({parcel.crop} - {parcel.variety})
                    </span>
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground p-4 text-sm">
                Geen percelen gevonden.
              </p>
            )}
          </div>
        </ScrollArea>
        {selectedParcelIds.length > 0 && (
          <div className="p-2 border-t">
            <p className="text-xs text-muted-foreground">
              {selectedParcelIds.length} perceel
              {selectedParcelIds.length !== 1 ? "en" : ""} geselecteerd
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
