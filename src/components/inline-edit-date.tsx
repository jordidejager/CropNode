'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface InlineEditDateProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

export function InlineEditDate({ date, onDateChange }: InlineEditDateProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate && date) {
      // Preserve the time from the original date
      selectedDate.setHours(date.getHours());
      selectedDate.setMinutes(date.getMinutes());
      selectedDate.setSeconds(date.getSeconds());
    }
    onDateChange(selectedDate);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start h-auto min-h-[36px] py-1.5 px-2 text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <span className="text-sm">
            {date ? format(date, 'dd-MM-yyyy HH:mm', { locale: nl }) : 'Selecteer datum...'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
