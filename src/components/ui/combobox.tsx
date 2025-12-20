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
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type ComboboxOption = {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  creatable?: boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  className,
  creatable = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  
  const currentValue = value || ""

  const currentLabel =
    options.find((option) => option.value.toLowerCase() === currentValue.toLowerCase())
      ?.label || currentValue

  const showCreateOption =
    creatable &&
    search &&
    !options.some(
      (option) => option.label.toLowerCase() === search.toLowerCase()
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">{currentLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        
      >
        <Command
           filter={(itemValue, searchValue) => {
            if (itemValue.toLowerCase().includes(searchValue.toLowerCase())) return 1
            return 0
          }}
        >
          <CommandInput
            placeholder="Zoek of maak nieuw..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {showCreateOption ? (
                <CommandItem
                  value={search}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue)
                    setSearch("")
                    setOpen(false)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Maak "{search}" aan
                </CommandItem>
              ) : (
                "Geen resultaten gevonden."
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentValue.toLowerCase() === option.value.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {showCreateOption && (
                 <CommandItem
                  value={search}
                  onSelect={() => {
                    onValueChange(search)
                    setSearch("")
                    setOpen(false)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Maak "{search}" aan
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
