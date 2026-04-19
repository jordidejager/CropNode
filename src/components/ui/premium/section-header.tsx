'use client';

import * as React from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';
import { bgColors, iconColors, glowColorsSolid, type PaletteColor } from './palette';

interface SectionHeaderProps {
    /** Pill badge label — shown above title in uppercase, tracking-widest */
    eyebrow: string;
    /** Main title — primary part (white) */
    title: string;
    /** Optional second line rendered with gradient */
    titleGradient?: string;
    /** Subtitle / description paragraph */
    description?: string;
    /** Palette color — pill + aurora blob */
    color?: PaletteColor;
    /** Right-side slot for CTAs */
    action?: React.ReactNode;
    /** Align left or center */
    align?: 'left' | 'center';
    /** Show aurora blob behind header */
    aurora?: boolean;
    className?: string;
}

/**
 * Section header with:
 *  1. Animated pill badge (pulsing dot + color-tinted bg)
 *  2. Big display title with gradient accent
 *  3. Optional subtitle
 *  4. Aurora blob (blurred orb) behind
 *  5. Action slot for CTA button(s)
 *
 * Based on landing FeatureBento + Hero heading style.
 */
export function SectionHeader({
    eyebrow,
    title,
    titleGradient,
    description,
    color = 'emerald',
    action,
    align = 'left',
    aurora = true,
    className,
}: SectionHeaderProps) {
    const ref = React.useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-40px' });

    return (
        <div ref={ref} className={cn('relative isolate', className)}>
            {/* Aurora blob */}
            {aurora && (
                <div
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -z-10 rounded-full blur-[120px] opacity-[0.08]',
                        glowColorsSolid[color],
                        align === 'center'
                            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[240px]'
                            : 'top-0 left-0 w-[420px] h-[220px] -translate-x-20 -translate-y-10',
                    )}
                />
            )}

            <div
                className={cn(
                    'flex flex-col gap-5',
                    align === 'center' && 'items-center text-center',
                    action && 'md:flex-row md:items-end md:justify-between md:gap-6',
                )}
            >
                <div className={cn('flex flex-col gap-3', align === 'center' && 'items-center')}>
                    {/* Pill badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4 }}
                        className={cn(
                            'inline-flex items-center gap-2 px-4 py-1.5 rounded-full border',
                            bgColors[color],
                        )}
                    >
                        <div
                            className={cn(
                                'w-1.5 h-1.5 rounded-full animate-pulse',
                                glowColorsSolid[color],
                            )}
                        />
                        <span
                            className={cn(
                                'text-sm font-medium tracking-widest uppercase',
                                iconColors[color],
                            )}
                        >
                            {eyebrow}
                        </span>
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="font-display text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1]"
                    >
                        {title}
                        {titleGradient && (
                            <>
                                {' '}
                                <span className="bg-gradient-to-r from-slate-300 to-slate-500 bg-clip-text text-transparent">
                                    {titleGradient}
                                </span>
                            </>
                        )}
                    </motion.h1>

                    {/* Description */}
                    {description && (
                        <motion.p
                            initial={{ opacity: 0, y: 8 }}
                            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                            transition={{ duration: 0.5, delay: 0.15 }}
                            className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed"
                        >
                            {description}
                        </motion.p>
                    )}
                </div>

                {/* Action slot */}
                {action && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="flex shrink-0 items-center gap-3"
                    >
                        {action}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
