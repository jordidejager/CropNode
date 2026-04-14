'use client';

import { Sun, Cloud, CloudRain, CloudSun, CloudSnow, Thermometer, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeatherDay } from './types';

interface WeatherStripProps {
  weather: WeatherDay | undefined;
  variant?: 'compact' | 'expanded';
}

/**
 * Determine weather icon based on precipitation and temperature
 */
function getWeatherIcon(weather: WeatherDay) {
  const precip = weather.precipitationSum ?? 0;
  const tempMax = weather.tempMax ?? 10;

  if (precip > 5) return CloudRain;   // Significant rain
  if (precip > 0.5) return CloudRain; // Light rain
  if (precip > 0) return CloudSun;    // Drizzle / mostly dry
  if (tempMax < 0) return CloudSnow;  // Freezing + dry = possible frost
  if (weather.leafWetnessHours && weather.leafWetnessHours > 6) return Cloud; // Cloudy (lots of wetness but no rain)
  return Sun; // Dry and clear
}

function getWeatherIconColor(weather: WeatherDay): string {
  const precip = weather.precipitationSum ?? 0;
  if (precip > 5) return 'text-blue-400/60';
  if (precip > 0) return 'text-blue-400/40';
  const tempMax = weather.tempMax ?? 10;
  if (tempMax < 0) return 'text-cyan-400/50';
  return 'text-amber-400/40';
}

export function WeatherStrip({ weather, variant = 'compact' }: WeatherStripProps) {
  if (!weather) return null;

  const hasRain = weather.precipitationSum !== null && weather.precipitationSum > 0;
  const WeatherIcon = getWeatherIcon(weather);
  const iconColor = getWeatherIconColor(weather);

  if (variant === 'compact') {
    const isForecast = weather.isForecast ?? false;

    return (
      <div className={cn(
        'flex items-center gap-1 text-[9px] mt-auto pt-1',
        isForecast ? 'text-slate-600 italic' : 'text-slate-500',
      )}>
        <WeatherIcon className={cn('h-2.5 w-2.5 flex-shrink-0', iconColor)} />
        {weather.tempMin !== null && weather.tempMax !== null && (
          <span className="tabular-nums">
            <span className={isForecast ? 'text-slate-500' : 'text-slate-400'}>{Math.round(weather.tempMax)}°</span>
            <span className="text-slate-600">/{Math.round(weather.tempMin)}°</span>
          </span>
        )}
        {hasRain && (
          <span className={cn('tabular-nums', isForecast ? 'text-blue-400/40' : 'text-blue-400/60')}>
            {weather.precipitationSum! < 10
              ? weather.precipitationSum!.toFixed(1)
              : Math.round(weather.precipitationSum!)
            }
          </span>
        )}
      </div>
    );
  }

  // Expanded variant
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg text-xs',
      'bg-white/[0.02] border border-white/[0.04]',
    )}>
      <WeatherIcon className={cn('h-4 w-4 flex-shrink-0', iconColor)} />
      {weather.tempMin !== null && weather.tempMax !== null && (
        <div className="flex items-center gap-1 text-slate-400">
          <Thermometer className="h-3 w-3" />
          <span className="tabular-nums">{Math.round(weather.tempMin)}° / {Math.round(weather.tempMax)}°</span>
        </div>
      )}
      {weather.precipitationSum !== null && (
        <div className={cn(
          'flex items-center gap-1',
          hasRain ? 'text-blue-400' : 'text-slate-500',
        )}>
          <Droplets className="h-3 w-3" />
          <span className="tabular-nums">{weather.precipitationSum.toFixed(1)} mm</span>
        </div>
      )}
      {weather.leafWetnessHours !== null && weather.leafWetnessHours > 0 && (
        <div className="flex items-center gap-1 text-slate-500">
          <span>Bladnat: {weather.leafWetnessHours.toFixed(0)}u</span>
        </div>
      )}
    </div>
  );
}
