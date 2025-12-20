"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

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
import { Badge } from "./badge"

export type ComboboxOption = {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | string[]
  onValueChange: (value: string | string[]) => void
  multiple?: boolean
  placeholder?: string
  className?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  multiple = false,
  placeholder = "Select an option",
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (selectedValue: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
      const newValue = currentValues.includes(selectedValue)
        ? currentValues.filter((v) => v !== selectedValue)
        : [...currentValues, selectedValue]
      onValueChange(newValue)
    } else {
      onValueChange(selectedValue === value ? "" : selectedValue)
      setOpen(false)
    }
  }

  const getDisplayValue = () => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : (value ? String(value).split(',').map(v => v.trim()) : []);
      if (currentValues.length === 0) return placeholder;
      return (
        <div className="flex flex-wrap gap-1">
          {currentValues.map((val) => (
             <Badge key={val} variant="secondary">
              {options.find((opt) => opt.value === val)?.label || val}
            </Badge>
          ))}
        </div>
      );
    }
    return options.find((opt) => opt.value === value)?.label || placeholder
  }
  
  const handleInputChange = (inputValue: string) => {
    if (multiple) {
      onValueChange(inputValue.split(',').map(v => v.trim()).filter(Boolean));
    } else {
      onValueChange(inputValue);
    }
  };

  const getInputValue = () => {
    if (multiple) {
      return Array.isArray(value) ? value.join(', ') : (value || '');
    }
    return typeof value === 'string' ? value : '';
  };


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-auto min-h-10", className, (Array.isArray(value) && value.length > 0) ? "px-2 py-1.5" : "")}
        >
          <span className="truncate">{getDisplayValue()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Zoek of maak nieuw..."
            value={getInputValue()}
            onValueChange={handleInputChange}
          />
          <CommandList>
            <CommandEmpty>Geen resultaten. Typ om aan te maken.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      multiple 
                        ? (Array.isArray(value) && value.includes(option.value) ? "opacity-100" : "opacity-0")
                        : (value === option.value ? "opacity-100" : "opacity-0")
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
