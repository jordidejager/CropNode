'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepAnnotations, type Annotation } from './StepAnnotations';

export interface WalkthroughStep {
  title: string;
  description: string;
  media: string;
  mediaType: 'image' | 'animated-webp' | 'video-loop';
  annotations?: Annotation[];
}

export interface WalkthroughStepperProps {
  id: string;
  title: string;
  description?: string;
  steps: WalkthroughStep[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  compact?: boolean;
}

export function WalkthroughStepper({
  id,
  title,
  description,
  steps,
  autoPlay = false,
  autoPlayInterval = 4000,
  compact = false,
}: WalkthroughStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const step = steps[currentStep];
  const totalSteps = steps.length;

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // AutoPlay logic
  useEffect(() => {
    if (!isPlaying || isPaused || reducedMotion) {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    setProgress(0);
    const tickMs = 50;
    let elapsed = 0;

    progressIntervalRef.current = setInterval(() => {
      elapsed += tickMs;
      setProgress(Math.min((elapsed / autoPlayInterval) * 100, 100));
    }, tickMs);

    autoPlayTimerRef.current = setTimeout(() => {
      setCurrentStep((prev) => (prev + 1) % totalSteps);
    }, autoPlayInterval);

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying, isPaused, currentStep, autoPlayInterval, totalSteps, reducedMotion]);

  const pauseAutoPlay = useCallback(() => {
    if (!isPlaying) return;
    setIsPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
  }, [isPlaying]);

  const resumeAutoPlay = useCallback(() => {
    if (!isPlaying) return;
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 2000);
  }, [isPlaying]);

  // Cleanup pause timer
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const goTo = useCallback((index: number) => {
    setCurrentStep(index);
    setProgress(0);
    pauseAutoPlay();
    resumeAutoPlay();
  }, [pauseAutoPlay, resumeAutoPlay]);

  const goNext = useCallback(() => {
    goTo(currentStep < totalSteps - 1 ? currentStep + 1 : 0);
  }, [currentStep, totalSteps, goTo]);

  const goPrev = useCallback(() => {
    goTo(currentStep > 0 ? currentStep - 1 : totalSteps - 1);
  }, [currentStep, totalSteps, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  // Touch/swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  const renderMedia = () => {
    const alt = `${step.title} — ${step.description}`;

    if (step.mediaType === 'video-loop') {
      return (
        <video
          key={step.media}
          src={step.media}
          autoPlay
          loop
          muted
          playsInline
          className={cn(
            "w-full object-contain rounded-lg",
            compact ? "max-h-[300px]" : "max-h-[500px]"
          )}
          aria-label={alt}
        />
      );
    }

    if (step.mediaType === 'animated-webp') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={step.media}
          src={step.media}
          alt={alt}
          className={cn(
            "w-full object-contain rounded-lg",
            compact ? "max-h-[300px]" : "max-h-[500px]"
          )}
        />
      );
    }

    // Default: static image via Next.js Image
    return (
      <Image
        key={step.media}
        src={step.media}
        alt={alt}
        width={1280}
        height={720}
        className={cn(
          "w-full object-contain rounded-lg",
          compact ? "max-h-[300px]" : "max-h-[500px]"
        )}
        priority={currentStep === 0}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-roledescription="walkthrough"
      aria-label={title}
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
        compact ? "max-w-full" : "max-w-full"
      )}
      onMouseEnter={pauseAutoPlay}
      onMouseLeave={resumeAutoPlay}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* AutoPlay progress bar */}
      {isPlaying && !reducedMotion && (
        <div className="h-0.5 bg-white/5 w-full">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-50 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-white truncate">{title}</h4>
          {description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {autoPlay && (
            <button
              onClick={() => {
                setIsPlaying(!isPlaying);
                setIsPaused(false);
              }}
              className="size-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400 transition-all"
              aria-label={isPlaying ? 'Pauzeer automatisch afspelen' : 'Start automatisch afspelen'}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
          )}
          <span className="text-xs text-slate-500 font-medium tabular-nums">
            Stap {currentStep + 1} van {totalSteps}
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className={cn(
        compact
          ? "flex flex-col"
          : "flex flex-col md:flex-row"
      )}>
        {/* Media area */}
        <div className={cn(
          "relative bg-black/20",
          compact ? "w-full" : "w-full md:w-[60%]"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              {renderMedia()}
              {step.annotations && step.annotations.length > 0 && (
                <StepAnnotations
                  annotations={step.annotations}
                  visible
                  reducedMotion={reducedMotion}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation arrows overlaid on media */}
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
            aria-label="Vorige stap"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
            aria-label="Volgende stap"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Text + navigation area */}
        <div className={cn(
          "flex flex-col justify-between p-4",
          compact ? "w-full" : "w-full md:w-[40%]"
        )}>
          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="size-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {currentStep + 1}
                  </span>
                  <h5 className="text-sm font-bold text-white">{step.title}</h5>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{step.description}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Step indicators (dots) */}
          <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-white/5">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => goTo(index)}
                className="group p-1"
                aria-label={`Ga naar stap ${index + 1}`}
                aria-current={index === currentStep ? 'step' : undefined}
              >
                <motion.div
                  animate={
                    index === currentStep
                      ? { scale: reducedMotion ? 1 : 1.2 }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "size-2.5 rounded-full transition-colors",
                    index === currentStep
                      ? "bg-emerald-500"
                      : "bg-muted group-hover:bg-slate-500"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
