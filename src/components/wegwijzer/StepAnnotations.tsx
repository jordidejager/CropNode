'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface Annotation {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'pointer' | 'highlight-area' | 'numbered';
  width?: number;
  height?: number;
}

interface StepAnnotationsProps {
  annotations: Annotation[];
  visible: boolean;
  reducedMotion?: boolean;
}

export function StepAnnotations({ annotations, visible, reducedMotion }: StepAnnotationsProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  useEffect(() => {
    setActiveTooltip(null);
  }, [annotations]);

  if (!annotations.length) return null;

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <div className="absolute inset-0 pointer-events-none">
          {annotations.map((annotation, index) => {
            const delay = reducedMotion ? 0 : index * 0.1;

            if (annotation.type === 'highlight-area') {
              return (
                <motion.div
                  key={annotation.id}
                  initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
                  transition={{ delay, duration: 0.2 }}
                  className="absolute pointer-events-auto"
                  style={{
                    left: `${annotation.x}%`,
                    top: `${annotation.y}%`,
                    width: `${annotation.width || 20}%`,
                    height: `${annotation.height || 10}%`,
                  }}
                >
                  <div className="w-full h-full rounded-lg border-2 border-emerald-400/50 bg-emerald-500/10" />
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      {annotation.label}
                    </span>
                  </div>
                </motion.div>
              );
            }

            if (annotation.type === 'numbered') {
              return (
                <motion.div
                  key={annotation.id}
                  initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                  transition={{ delay, duration: 0.2 }}
                  className="absolute pointer-events-auto flex items-center gap-1.5"
                  style={{
                    left: `${annotation.x}%`,
                    top: `${annotation.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  aria-label={annotation.label}
                >
                  <span className="size-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/20">
                    {index + 1}
                  </span>
                  <span className="text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                    {annotation.label}
                  </span>
                </motion.div>
              );
            }

            // pointer type
            return (
              <motion.div
                key={annotation.id}
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                transition={{ delay, duration: 0.2 }}
                className="absolute pointer-events-auto"
                style={{
                  left: `${annotation.x}%`,
                  top: `${annotation.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <button
                  onClick={() => setActiveTooltip(activeTooltip === annotation.id ? null : annotation.id)}
                  onMouseEnter={() => setActiveTooltip(annotation.id)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="relative group"
                  aria-label={annotation.label}
                >
                  <span className={cn(
                    "size-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/20",
                    !reducedMotion && "animate-pulse"
                  )}>
                    {index + 1}
                  </span>
                  <AnimatePresence>
                    {activeTooltip === annotation.id && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-10 whitespace-nowrap"
                      >
                        <span className="text-xs font-semibold text-emerald-300 bg-emerald-950/90 border border-emerald-500/30 px-2.5 py-1 rounded-lg shadow-xl">
                          {annotation.label}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
