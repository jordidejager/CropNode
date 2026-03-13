'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, CloudRain, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const RADAR_PROXY_URL = '/api/weather/radar-image';

// Buienradar animation API caps at ~24 total frames.
// We request history=6 + forecast=24 → API returns max ~24 frames.
// Each frame ≈ 10 min → covers ~1h history + ~3h forecast (radar nowcast limit).
const HISTORY_FRAMES = 6;
const FORECAST_FRAMES = 24;

type FrameData = {
  imageData: ImageData;
  delay: number;
};

export function RadarPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [gifTimestamp, setGifTimestamp] = useState(Date.now());
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the GIF URL (stable — only changes every 5 min)
  const gifUrl = (() => {
    const v = Math.floor(gifTimestamp / 300000);
    return `${RADAR_PROXY_URL}?type=animation&history=${HISTORY_FRAMES}&forecast=${FORECAST_FRAMES}&v=${v}`;
  })();

  // Refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setGifTimestamp(Date.now());
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch and decode GIF into frames
  useEffect(() => {
    let cancelled = false;

    async function loadGif() {
      setIsLoading(true);
      setError(false);
      setFrames([]);
      setCurrentFrame(0);
      setIsPlaying(false);

      try {
        const response = await fetch(gifUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();

        const { parseGIF, decompressFrames } = await import('gifuct-js');
        const gif = parseGIF(buffer);
        const decompressed = decompressFrames(gif, true);

        if (cancelled || decompressed.length === 0) return;

        const extractedFrames: FrameData[] = decompressed.map((frame) => {
          const imageData = new ImageData(
            new Uint8ClampedArray(frame.patch),
            frame.dims.width,
            frame.dims.height
          );
          return { imageData, delay: frame.delay || 500 };
        });

        if (!cancelled) {
          setFrames(extractedFrames);
          setIsLoading(false);
          setCurrentFrame(Math.min(HISTORY_FRAMES, extractedFrames.length - 1));
          setIsPlaying(true);
        }
      } catch (err) {
        console.error('[RadarPlayer] Failed to load GIF:', err);
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      }
    }

    loadGif();
    return () => { cancelled = true; };
  }, [gifUrl]);

  // Draw current frame on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const frame = frames[currentFrame];
    if (!frame) return;

    canvas.width = frame.imageData.width;
    canvas.height = frame.imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(frame.imageData, 0, 0);
  }, [currentFrame, frames]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animRef.current) {
        clearTimeout(animRef.current);
        animRef.current = null;
      }
      return;
    }

    const frame = frames[currentFrame];
    const delay = frame?.delay ?? 500;

    animRef.current = setTimeout(() => {
      setCurrentFrame((prev) => (prev + 1 >= frames.length ? 0 : prev + 1));
    }, delay);

    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, [isPlaying, currentFrame, frames]);

  const totalFrames = frames.length;
  const nowFrameIndex = Math.min(HISTORY_FRAMES, totalFrames - 1);

  const getFrameTimeLabel = useCallback((frameIndex: number) => {
    const minutesFromNow = (frameIndex - nowFrameIndex) * 10;
    const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }, [nowFrameIndex]);

  const startLabel = totalFrames > 0 ? getFrameTimeLabel(0) : '';
  const endLabel = totalFrames > 0 ? getFrameTimeLabel(totalFrames - 1) : '';
  const currentLabel = totalFrames > 0 ? getFrameTimeLabel(currentFrame) : '';
  const isPast = currentFrame < nowFrameIndex;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[220px] md:h-[280px] rounded-xl bg-white/[0.02] border border-white/[0.06] text-white/20 text-xs gap-2">
        <CloudRain className="h-6 w-6 opacity-40" />
        <span>Radar niet beschikbaar</span>
        <a
          href="https://www.buienradar.nl"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400/60 hover:text-sky-400 flex items-center gap-1 text-[11px]"
        >
          Bekijk op buienradar.nl
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Radar canvas */}
      <div className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/[0.06]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-[10px] text-white/40">Radar laden...</span>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="w-full h-[220px] md:h-[280px] object-cover"
          style={{ imageRendering: 'auto' }}
        />

        {/* Time overlay top-left */}
        {!isLoading && totalFrames > 0 && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/10">
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

      {/* Player controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={isLoading || totalFrames === 0}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/60 transition-colors shrink-0 disabled:opacity-30"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
        </button>

        <div className="flex-1 relative">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrame}
            onChange={(e) => {
              setCurrentFrame(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            disabled={isLoading || totalFrames === 0}
            className="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-white/10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-sky-400/20
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg
              disabled:opacity-30"
          />
          {totalFrames > 1 && nowFrameIndex > 0 && nowFrameIndex < totalFrames - 1 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/50 rounded-full pointer-events-none"
              style={{ left: `${(nowFrameIndex / (totalFrames - 1)) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Time labels under slider */}
      <div className="flex justify-between px-9 text-[9px] text-white/20">
        <span>{startLabel}</span>
        <span className="text-white/40">Nu</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
