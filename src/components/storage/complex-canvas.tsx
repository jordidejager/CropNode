'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Constants for the grid
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 40; // Base grid size in pixels (1 crate position)

interface ComplexCanvasProps {
  children: React.ReactNode;
  editMode: boolean;
  className?: string;
  onCanvasClick?: (e: React.MouseEvent) => void;
}

export function ComplexCanvas({
  children,
  editMode,
  className,
  onCanvasClick,
}: ComplexCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [startPan, setStartPan] = React.useState({ x: 0, y: 0 });
  const [startMouse, setStartMouse] = React.useState({ x: 0, y: 0 });

  // Handle zoom with scroll wheel
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
    } else {
      // Pan with scroll
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, []);

  // Handle pan with middle mouse or when holding space
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    // Middle mouse button or right click to pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan(pan);
      setStartMouse({ x: e.clientX, y: e.clientY });
    }
  }, [pan]);

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: startPan.x + (e.clientX - startMouse.x),
        y: startPan.y + (e.clientY - startMouse.y),
      });
    }
  }, [isPanning, startPan, startMouse]);

  const handleMouseUp = React.useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls
  const zoomIn = () => setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  const zoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Calculate scaled grid size
  const scaledGridSize = GRID_SIZE * zoom;

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      {/* Canvas container */}
      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-full min-h-[500px] overflow-hidden',
          'bg-slate-950',
          isPanning && 'cursor-grabbing',
          !isPanning && 'cursor-default',
          editMode && 'ring-2 ring-emerald-500/30 ring-inset'
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => {
          if (!isPanning && onCanvasClick) {
            onCanvasClick(e);
          }
        }}
      >
        {/* Grid background pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 1px)
            `,
            backgroundSize: `${scaledGridSize}px ${scaledGridSize}px`,
            backgroundPosition: `${pan.x % scaledGridSize}px ${pan.y % scaledGridSize}px`,
          }}
        />

        {/* Major grid lines (every 5 units) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(16, 185, 129, 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: `${scaledGridSize * 5}px ${scaledGridSize * 5}px`,
            backgroundPosition: `${pan.x % (scaledGridSize * 5)}px ${pan.y % (scaledGridSize * 5)}px`,
          }}
        />

        {/* Canvas content */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>

        {/* Edit mode indicator */}
        {editMode && (
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
            <Move className="h-3 w-3" />
            Bewerkmodus - Sleep cellen om te positioneren
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-slate-900/80 backdrop-blur-sm rounded-lg p-1 border border-white/10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            title="Inzoomen (Ctrl + Scroll)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="text-[10px] text-center text-muted-foreground py-0.5">
            {Math.round(zoom * 100)}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomOut}
            title="Uitzoomen (Ctrl + Scroll)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="h-px bg-white/10 my-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={resetView}
            title="Reset weergave"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Pan instructions (shown briefly or on hover) */}
        <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/60">
          Scroll om te pannen • Ctrl+Scroll om te zoomen • Alt+Klik om te slepen
        </div>
      </div>
    </div>
  );
}

// Export grid size for use in other components
export { GRID_SIZE };
