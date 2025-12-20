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
  const [inputValue, setInputValue] = React.useState("")

  const getDisplayValue = () => {
    return options.find((opt) => opt.value === value)?.label || value || placeholder
  }

  const handleSelect = (currentValue: string) => {
    onValueChange(currentValue === value ? "" : currentValue)
    setInputValue("")
    setOpen(false)
  }

  const filteredOptions = options.filter(option => 
    option.label.toLowerCase().includes(inputValue.toLowerCase())
  );
  
  const showCreateOption = creatable && inputValue && !options.some(option => option.label.toLowerCase() === inputValue.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">{getDisplayValue()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Zoek of maak nieuw..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
             <CommandEmpty>
                {creatable ? `Geen resultaten. Druk op Enter om "${inputValue}" aan te maken.` : "Geen resultaten gevonden."}
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
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
              {showCreateOption && (
                 <CommandItem
                    key={inputValue}
                    value={inputValue}
                    onSelect={handleSelect}
                    className="italic"
                 >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    Maak "{inputValue}" aan
                 </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
