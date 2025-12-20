'use client';

import { useState } from 'react';
import type { ParcelHistoryEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

type Filters = {
  variety: string;
  parcel: string;
  date: Date | undefined;
};

const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return format(d, 'dd MMMM yyyy', { locale: nl });
}

export function HistoryDashboard({
  entries,
  initialVarieties,
  initialParcels
}: {
  entries: ParcelHistoryEntry[];
  initialVarieties: string[];
  initialParcels: string[];
}) {
  const [filters, setFilters] = useState<Filters>({ variety: 'all', parcel: 'all', date: undefined });

  const handleFilterChange = (filterName: keyof Filters, value: string | Date | undefined) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };
  
  const resetFilters = () => {
    setFilters({ variety: 'all', parcel: 'all', date: undefined });
  };
  
  const isFiltered = filters.variety !== 'all' || filters.parcel !== 'all' || filters.date !== undefined;

  const filteredEntries = entries.filter(entry => {
    const varietyMatch = filters.variety === 'all' || (Array.isArray(entry.variety) && entry.variety.includes(filters.variety));
    const parcelMatch = filters.parcel === 'all' || entry.parcelName === filters.parcel;
    
    const entryDate = entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date);
    const dateMatch = !filters.date || entryDate.toDateString() === filters.date.toDateString();
    
    return varietyMatch && parcelMatch && dateMatch;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <CardTitle>Dashboard & Historie</CardTitle>
                <CardDescription>Filter en bekijk de historie per perceel.</CardDescription>
            </div>
            {isFiltered && (
              <Button variant="ghost" onClick={resetFilters}>
                <X className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
            )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <Select value={filters.variety} onValueChange={(value) => handleFilterChange('variety', value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter op ras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle rassen</SelectItem>
              {initialVarieties.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.parcel} onValueChange={(value) => handleFilterChange('parcel', value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter op perceel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle percelen</SelectItem>
              {initialParcels.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto min-w-[240px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.date ? format(filters.date, 'PPP', { locale: nl }) : <span>Kies een datum</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.date}
                onSelect={(date) => handleFilterChange('date', date as Date)}
                initialFocus
                locale={nl}
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {filteredEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEntries.map(entry => (
              <Card key={entry.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">{entry.parcelName} <span className="font-normal text-muted-foreground">({Array.isArray(entry.variety) ? entry.variety.join(', ') : entry.variety})</span></CardTitle>
                  <CardDescription>{formatDate(entry.date)}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="font-semibold text-primary">{entry.product}</p>
                  <p className="text-sm text-foreground">{entry.dosage} {entry.unit}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-16">
            <p className="font-semibold">Geen resultaten</p>
            <p>Er zijn geen historie-regels voor de geselecteerde filters.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
