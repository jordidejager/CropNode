'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, CloudRain, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type PrecipTimeRange = '8h' | '24h' | '48h' | '96h';

const TIME_RANGE_HOURS: Record<PrecipTimeRange, number> = {
  '8h': 8,
  '24h': 24,
  '48h': 48,
  '96h': 96,
};

// Animation speed factor: higher = faster
const ANIM_FACTOR: Record<PrecipTimeRange, number> = {
  '8h': 3600 * 2,    // 2h per second
  '24h': 3600 * 6,   // 6h per second
  '48h': 3600 * 12,  // 12h per second
  '96h': 3600 * 24,  // 24h per second
};

// Buienradar-style: Netherlands centered, same zoom as their radar
const NL_CENTER: [number, number] = [5.5, 52.2];
const NL_ZOOM = 7;

interface PrecipForecastMapProps {
  timeRange: PrecipTimeRange;
}

export function PrecipForecastMap({ timeRange }: PrecipForecastMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
    if (!apiKey) {
      setError('MapTiler API key niet geconfigureerd');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mapInstance: any = null;

    async function initMap() {
      try {
        const maptilersdk = await import('@maptiler/sdk');
        // @ts-expect-error -- CSS module import has no type declarations
        await import('@maptiler/sdk/dist/maptiler-sdk.css');
        const { PrecipitationLayer } = await import('@maptiler/weather');

        if (cancelled || !mapContainerRef.current) return;

        maptilersdk.config.apiKey = apiKey!;

        // Use a very dark, label-free style to match Buienradar
        const map = new maptilersdk.Map({
          container: mapContainerRef.current,
          // BACKDROP.DARK = dark base without distracting labels
          style: maptilersdk.MapStyle.BACKDROP.DARK,
          center: NL_CENTER,
          zoom: NL_ZOOM,
          interactive: false,       // No pan, zoom, rotate
          attributionControl: false, // No attribution overlay
          logoPosition: undefined,
        });

        mapInstance = map;
        mapRef.current = map;

        map.on('load', () => {
          if (cancelled) return;

          // Remove all label/text layers for a clean radar look
          const style = map.getStyle();
          if (style?.layers) {
            for (const layer of style.layers) {
              // Remove text labels, POI markers, road labels, etc.
              if (
                layer.type === 'symbol' ||
                layer.id.includes('label') ||
                layer.id.includes('name') ||
                layer.id.includes('place') ||
                layer.id.includes('poi') ||
                layer.id.includes('road') ||
                layer.id.includes('boundary')
              ) {
                try { map.removeLayer(layer.id); } catch { /* skip */ }
              }
            }
          }

          const precipLayer = new PrecipitationLayer({
            opacity: 0.8,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.addLayer(precipLayer as any);
          layerRef.current = precipLayer;

          precipLayer.on('sourceReady', () => {
            if (cancelled) return;

            const animStart = precipLayer.getAnimationStart();
            const animEnd = precipLayer.getAnimationEnd();

            setStartTime(animStart);
            setEndTime(animEnd);
            setCurrentTime(animStart);
            setIsLoading(false);
            setIsReady(true);

            // Auto-play
            precipLayer.animateByFactor(ANIM_FACTOR[timeRange]);
            setIsPlaying(true);
          });

          precipLayer.on('tick', (evt: { time: number }) => {
            if (!cancelled) setCurrentTime(evt.time);
          });
        });
      } catch (err) {
        console.error('[PrecipForecastMap] Init failed:', err);
        if (!cancelled) {
          setError('Weerkaart kon niet geladen worden');
          setIsLoading(false);
        }
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapInstance?.remove) mapInstance.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update animation speed when timeRange changes
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !isReady) return;
    if (isPlaying) {
      layer.animateByFactor(ANIM_FACTOR[timeRange]);
    }
  }, [timeRange, isReady, isPlaying]);

  const togglePlay = useCallback(() => {
    const layer = layerRef.current;
    if (!layer || !isReady) return;
    if (isPlaying) {
      layer.animateByFactor(0);
      setIsPlaying(false);
    } else {
      layer.animateByFactor(ANIM_FACTOR[timeRange]);
      setIsPlaying(true);
    }
  }, [isPlaying, isReady, timeRange]);

  const handleSliderChange = useCallback((value: number) => {
    const layer = layerRef.current;
    if (!layer || !isReady) return;
    layer.animateByFactor(0);
    setIsPlaying(false);
    layer.setAnimationTime(value);
    setCurrentTime(value);
  }, [isReady]);

  const formatTime = useCallback((timestamp: number) => {
    const d = new Date(timestamp * 1000);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }, []);

  const formatDateTime = useCallback((timestamp: number) => {
    const d = new Date(timestamp * 1000);
    const hours = TIME_RANGE_HOURS[timeRange];
    if (hours <= 24) {
      return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('nl-NL', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [timeRange]);

  const nowTimestamp = Date.now() / 1000;
  const hours = TIME_RANGE_HOURS[timeRange];
  const maxEndTime = nowTimestamp + hours * 3600;
  const sliderMin = startTime;
  const sliderMax = endTime > 0 ? Math.min(endTime, maxEndTime) : maxEndTime;
  const isPast = currentTime < nowTimestamp;
  const currentLabel = currentTime > 0 ? formatDateTime(currentTime) : '';

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[220px] md:h-[280px] rounded-xl bg-white/[0.02] border border-white/[0.06] text-white/20 text-xs gap-2">
        <CloudRain className="h-6 w-6 opacity-40" />
        <span>{error}</span>
        <a
          href="https://cloud.maptiler.com/account/keys/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400/60 hover:text-sky-400 flex items-center gap-1 text-[11px]"
        >
          API key instellen
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Map container — styled to look like Buienradar radar */}
      <div className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/[0.06]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-[10px] text-white/40">Radar laden...</span>
            </div>
          </div>
        )}

        <div
          ref={mapContainerRef}
          className="w-full h-[220px] md:h-[280px]"
        />

        {/* CSS overrides to hide all MapTiler/MapLibre controls */}
        <style jsx>{`
          div :global(.maplibregl-ctrl-logo),
          div :global(.maplibregl-ctrl-attrib),
          div :global(.maplibregl-ctrl-bottom-left),
          div :global(.maplibregl-ctrl-bottom-right),
          div :global(.maplibregl-ctrl-top-left),
          div :global(.maplibregl-ctrl-top-right),
          div :global(.maplibregl-ctrl),
          div :global(.maptiler-ctrl),
          div :global(.maplibregl-compact),
          div :global(.mapboxgl-ctrl-logo),
          div :global(.mapboxgl-ctrl-attrib) {
            display: none !important;
          }
        `}</style>

        {/* Time overlay — same style as RadarPlayer */}
        {!isLoading && isReady && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/10 z-10">
            <span className="text-white font-bold text-sm tabular-nums">
              {currentLabel}
            </span>
            <span className={cn(
              'text-[9px] ml-1.5',
              isPast ? 'text-white/40' : 'text-sky-400/60'
            )}>
              {isPast ? 'actueel' : 'voorspelling'}
            </span>
          </div>
        )}
      </div>

      {/* Player controls — identical to RadarPlayer */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={isLoading || !isReady}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/60 transition-colors shrink-0 disabled:opacity-30"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
        </button>

        <div className="flex-1 relative">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={60}
            value={Math.min(currentTime, sliderMax)}
            onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
            disabled={isLoading || !isReady}
            className="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-white/10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-sky-400/20
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg
              disabled:opacity-30"
          />

          {/* "Now" marker */}
          {isReady && sliderMax > sliderMin && nowTimestamp > sliderMin && nowTimestamp < sliderMax && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full pointer-events-none"
              style={{ left: `${((nowTimestamp - sliderMin) / (sliderMax - sliderMin)) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Time labels */}
      <div className="flex justify-between px-9 text-[9px] text-white/20">
        <span>{startTime > 0 ? formatTime(startTime) : ''}</span>
        <span className="text-white/40">Nu</span>
        <span>{sliderMax > 0 ? formatDateTime(sliderMax) : ''}</span>
      </div>
    </div>
  );
}
