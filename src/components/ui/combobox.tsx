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

  const currentLabel =
    options.find((option) => option.value.toLowerCase() === value?.toLowerCase())
      ?.label || value

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(inputValue.toLowerCase())
  )

  const showCreateOption =
    creatable &&
    inputValue &&
    !filteredOptions.some(
      (option) => option.label.toLowerCase() === inputValue.toLowerCase()
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
        <Command shouldFilter={false}>
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
                    setInputValue("")
                  }}
                >
                  Maak "{inputValue}" aan
                </CommandItem>
              ) : (
                "Geen resultaten gevonden."
              )}
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={(currentValue) => {
                    const selectedValue = options.find(opt => opt.label.toLowerCase() === currentValue.toLowerCase())?.value || currentValue;
                    onValueChange(selectedValue)
                    setOpen(false)
                    setInputValue("")
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.toLowerCase() === option.value.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {showCreateOption && !filteredOptions.length && (
                 <CommandItem
                  value={inputValue}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue)
                    setOpen(false)
                    setInputValue("")
                  }}
                >
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