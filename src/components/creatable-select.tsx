"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { CommandList } from "cmdk"

interface CreatableSelectProps {
    options: string[]
    value: string
    onChange: (value: string) => void
    placeholder?: string
    emptyMessage?: string
    className?: string
}

export function CreatableSelect({
    options = [],
    value,
    onChange,
    placeholder = "Selecteer...",
    emptyMessage = "Geen opties gevonden.",
    className
}: CreatableSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [inputValue, setInputValue] = React.useState("")

    const filteredOptions = React.useMemo(() => {
        return Array.from(new Set([...options, value])).filter(Boolean)
    }, [options, value])

    const handleSelect = (currentValue: string) => {
        onChange(currentValue)
        setOpen(false)
    }

    const handleCreate = () => {
        if (inputValue && !filteredOptions.includes(inputValue)) {
            onChange(inputValue)
            setOpen(false)
            setInputValue("")
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-9 bg-black/40 border-white/10 text-sm font-bold text-white hover:bg-white/5", className)}
                >
                    {value || placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[3000] bg-zinc-900 border-white/10" align="start">
                <Command className="bg-transparent" loop>
                    <CommandInput
                        placeholder="Zoeken of toevoegen..."
                        value={inputValue}
                        onValueChange={setInputValue}
                        className="text-white"
                    />
                    <CommandList className="max-h-60 overflow-y-auto">
                        {inputValue && !filteredOptions.some(opt => opt.toLowerCase() === inputValue.toLowerCase()) && (
                            <CommandGroup>
                                <CommandItem
                                    value={inputValue}
                                    onSelect={handleCreate}
                                    className="text-primary font-black flex items-center gap-2 cursor-pointer"
                                >
                                    <Plus className="h-4 w-4" />
                                    Toevoegen: "{inputValue}"
                                </CommandItem>
                            </CommandGroup>
                        )}
                        <CommandEmpty className="py-6 text-center text-xs text-white/40">{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            {filteredOptions.map((opt) => (
                                <CommandItem
                                    key={opt}
                                    value={opt}
                                    onSelect={() => handleSelect(opt)}
                                    className="flex items-center justify-between text-white cursor-pointer hover:bg-white/5"
                                >
                                    <div className="flex items-center">
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === opt ? "opacity-100 text-primary" : "opacity-0"
                                            )}
                                        />
                                        {opt}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
