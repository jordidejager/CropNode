'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { WeatherStationBasic } from '@/hooks/use-weather';

interface StationLocationBannerProps {
  station: WeatherStationBasic;
}

/**
 * Shows the weather station location with a resolved place name.
 * Uses Nominatim reverse geocoding (cached in sessionStorage).
 */
export function StationLocationBanner({ station }: StationLocationBannerProps) {
  const [placeName, setPlaceName] = useState<string | null>(station.name);

  useEffect(() => {
    // If the station already has a name, use it
    if (station.name) {
      setPlaceName(station.name);
      return;
    }

    // Check session cache
    const cacheKey = `geo_${station.latitude}_${station.longitude}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setPlaceName(cached);
      return;
    }

    // Reverse geocode with Nominatim
    const controller = new AbortController();

    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${station.latitude}&lon=${station.longitude}&format=json&zoom=10&accept-language=nl`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'CropNode/1.0' },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        const addr = data.address;
        // Try to get a meaningful place name
        const name =
          addr?.village ??
          addr?.town ??
          addr?.city ??
          addr?.municipality ??
          addr?.county ??
          data.display_name?.split(',')[0] ??
          null;

        if (name) {
          setPlaceName(name);
          sessionStorage.setItem(cacheKey, name);

          // Also update station name in the database (fire & forget)
          updateStationName(station.id, name);
        }
      })
      .catch(() => {
        // Geocoding failed, show coordinates
      });

    return () => controller.abort();
  }, [station.id, station.latitude, station.longitude, station.name]);

  const displayName = placeName ?? `${station.latitude.toFixed(2)}°N, ${station.longitude.toFixed(2)}°O`;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <MapPin className="h-3.5 w-3.5 text-emerald-400/60 shrink-0" />
      <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
        <span className="text-xs font-bold text-white/70 truncate">
          {displayName}
        </span>
        <span className="text-[10px] text-white/25">
          ({station.latitude.toFixed(2)}°N, {station.longitude.toFixed(2)}°O)
        </span>
      </div>
    </div>
  );
}

/**
 * Update station name in the DB so we don't need to geocode again.
 * Fire-and-forget — errors are silently ignored.
 */
async function updateStationName(stationId: string, name: string) {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase
      .from('weather_stations')
      .update({ name })
      .eq('id', stationId);
  } catch {
    // Silently ignore
  }
}
