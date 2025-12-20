"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">{selectedOption?.label || value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(searchValue, itemValue) => {
            if (creatable) return 1;
            return itemValue.toLowerCase().includes(searchValue.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Zoek of maak nieuw..." />
          <CommandList>
            <CommandEmpty>
                {creatable ? `Geen resultaten. Selecteer om aan te maken.` : "Geen resultaten gevonden."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
               {creatable && (
                <CommandItem
                    value="creatable-item" // This is a dummy value
                    onSelect={(currentValue) => {
                        // The `currentValue` from onSelect will be the input text
                        // We need to get it from the command's internal state.
                        // This is a bit of a hack, but it's how we can get the search value.
                        const commandEl = document.querySelector('[cmdk-root=true]');
                        const inputValue = (commandEl as any)?.getAttribute('data-value') || '';
                        if (inputValue) {
                            onValueChange(inputValue);
                            setOpen(false);
                        }
                    }}
                 >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <span className="italic">Nieuw ras aanmaken...</span>
                 </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
