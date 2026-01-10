"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { nl } from 'date-fns/locale'
import { Timestamp } from "firebase/firestore"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface InlineEditDateProps {
  date: Date | Timestamp | undefined;
  onDateChange: (date: Date) => void;
}

export function InlineEditDate({ date, onDateChange }: InlineEditDateProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dateObj = date instanceof Timestamp ? date.toDate() : (date || new Date());
  
  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    // Preserve time from original date
    const newDate = new Date(selectedDate);
    newDate.setHours(dateObj.getHours());
    newDate.setMinutes(dateObj.getMinutes());

    onDateChange(newDate);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"ghost"}
          className={cn(
            "w-full justify-start text-left font-normal -ml-3",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(dateObj, 'dd-MM-yyyy HH:mm', { locale: nl }) : <span>Kies een datum</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={handleSelect}
          initialFocus
          locale={nl}
        />
      </PopoverContent>
    </Popover>
  )
}
