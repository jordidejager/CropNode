'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin } from 'lucide-react';
import type { WeatherStationBasic } from '@/hooks/use-weather';

interface StationSelectorProps {
  stations: WeatherStationBasic[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

/**
 * Dropdown for selecting a weather station.
 * Hidden when the user has only one station.
 */
export function StationSelector({
  stations,
  selectedId,
  onChange,
}: StationSelectorProps) {
  if (stations.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-white/40" />
      <Select value={selectedId ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="w-[220px] bg-white/5 border-white/10 text-white">
          <SelectValue placeholder="Selecteer station" />
        </SelectTrigger>
        <SelectContent>
          {stations.map((station) => (
            <SelectItem key={station.id} value={station.id}>
              {station.name ?? `Station ${station.latitude.toFixed(2)}, ${station.longitude.toFixed(2)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
