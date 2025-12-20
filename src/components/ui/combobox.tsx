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
  const [inputValue, setInputValue] = React.useState(value || '')

  const selectedOption = options.find((option) => option.value.toLowerCase() === value?.toLowerCase());

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

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
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
            // Dit voorkomt dat de dialoog sluit wanneer je buiten de popover klikt
            // als de popover open is.
             if (open) {
                e.preventDefault();
            }
        }}
      >
        <Command
          filter={(itemValue, searchValue) => {
             if (creatable) return 1;
             return itemValue.toLowerCase().includes(searchValue.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput 
            placeholder="Zoek of maak nieuw..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
                {creatable && inputValue ? (
                    <CommandItem
                        value={inputValue}
                        onSelect={(currentValue) => {
                            onValueChange(currentValue)
                            setOpen(false)
                        }}
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      Maak "{inputValue}" aan
                    </CommandItem>
                ): "Geen resultaten gevonden."}
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
                      value?.toLowerCase() === option.value.toLowerCase() ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
