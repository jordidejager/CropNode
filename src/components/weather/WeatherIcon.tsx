'use client';

import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudFog,
  CloudLightning,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherIconProps extends Omit<LucideProps, 'ref'> {
  cloudCover: number | null;
  precipitationMm: number | null;
  temperatureC?: number | null;
  className?: string;
}

/**
 * Derive weather icon from available data (no weather_code in DB).
 * Falls back to Sun when data is missing.
 */
export function WeatherIcon({
  cloudCover,
  precipitationMm,
  temperatureC,
  className,
  ...props
}: WeatherIconProps) {
  const IconComponent = getWeatherIconComponent(cloudCover, precipitationMm, temperatureC);
  return <IconComponent className={cn('shrink-0', className)} {...props} />;
}

export function getWeatherIconComponent(
  cloudCover: number | null,
  precipitationMm: number | null,
  temperatureC?: number | null
) {
  // Snow: precipitation + freezing temps
  if (
    precipitationMm !== null &&
    precipitationMm > 0 &&
    temperatureC !== undefined &&
    temperatureC !== null &&
    temperatureC <= 1
  ) {
    return CloudSnow;
  }

  // Heavy rain
  if (precipitationMm !== null && precipitationMm > 2) return CloudRain;

  // Light rain / drizzle
  if (precipitationMm !== null && precipitationMm > 0) return CloudDrizzle;

  // Fog: very high cloud cover + low visibility conditions
  if (cloudCover !== null && cloudCover > 95) return CloudFog;

  // Overcast
  if (cloudCover !== null && cloudCover > 80) return Cloud;

  // Partly cloudy
  if (cloudCover !== null && cloudCover > 30) return CloudSun;

  // Clear
  return Sun;
}

/**
 * Get a weather description string from the data.
 */
export function getWeatherDescription(
  cloudCover: number | null,
  precipitationMm: number | null,
  temperatureC?: number | null
): string {
  if (
    precipitationMm !== null &&
    precipitationMm > 0 &&
    temperatureC !== undefined &&
    temperatureC !== null &&
    temperatureC <= 1
  )
    return 'Sneeuw';
  if (precipitationMm !== null && precipitationMm > 2) return 'Regen';
  if (precipitationMm !== null && precipitationMm > 0) return 'Motregen';
  if (cloudCover !== null && cloudCover > 95) return 'Mist';
  if (cloudCover !== null && cloudCover > 80) return 'Bewolkt';
  if (cloudCover !== null && cloudCover > 30) return 'Half bewolkt';
  return 'Zonnig';
}
