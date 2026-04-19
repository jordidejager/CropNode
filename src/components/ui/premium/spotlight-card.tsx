'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { glowColors, glowColorsSolid, type PaletteColor } from './palette';
import { NoiseOverlay } from './noise-overlay';

/**
 * Premium card primitive — merges all landing design upgrades:
 *  1. Gradient border animation (135° linear) on hover
 *  2. Mouse-following radial spotlight (600px)
 *  3. Glow orb top-right
 *  4. Noise texture overlay (feTurbulence)
 *
 * Extracted from src/components/landing/feature-bento.tsx:1419-1502.
 * The `pointer-events-none` on every decorative layer keeps hit-testing
 * on the content, and `prefers-reduced-motion` users get no spotlight
 * tracking (effect is static).
 */
export interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
    color: PaletteColor;
    /** Disable the glow orb top-right (e.g. for dense lists) */
    disableOrb?: boolean;
    /** Disable the mouse-following spotlight (e.g. on mobile / reduced motion) */
    disableSpotlight?: boolean;
    /** Padding inside the inner card — tailwind className */
    padding?: string;
    /** Make card interactive (role=button, keyboard focus ring, cursor-pointer) */
    interactive?: boolean;
}

export const SpotlightCard = React.forwardRef<HTMLDivElement, SpotlightCardProps>(
    (
        {
            color,
            disableOrb = false,
            disableSpotlight = false,
            padding = 'p-5 sm:p-6',
            interactive = false,
            className,
            children,
            onMouseMove,
            ...rest
        },
        ref,
    ) => {
        const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
        const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

        React.useEffect(() => {
            const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            setPrefersReducedMotion(mq.matches);
            const listener = () => setPrefersReducedMotion(mq.matches);
            mq.addEventListener('change', listener);
            return () => mq.removeEventListener('change', listener);
        }, []);

        const handleMouseMove = React.useCallback(
            (e: React.MouseEvent<HTMLDivElement>) => {
                if (!prefersReducedMotion && !disableSpotlight) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                }
                onMouseMove?.(e);
            },
            [onMouseMove, prefersReducedMotion, disableSpotlight],
        );

        const showSpotlight = !disableSpotlight && !prefersReducedMotion;

        return (
            <div
                ref={ref}
                className={cn(
                    'group relative h-full rounded-2xl p-px overflow-hidden',
                    interactive && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    className,
                )}
                onMouseMove={handleMouseMove}
                {...rest}
            >
                {/* Animated gradient border — appears on hover */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                    style={{
                        background: `linear-gradient(135deg, ${glowColors[color]}, transparent 40%, transparent 60%, ${glowColors[color]})`,
                    }}
                />

                {/* Inner card */}
                <div
                    className={cn(
                        'relative h-full rounded-2xl bg-[#0a0f1a]/80 border border-white/[0.06] overflow-hidden transition-all duration-500 group-hover:border-transparent group-hover:bg-[#0a0f1a]/90',
                        padding,
                    )}
                >
                    {/* Mouse-following spotlight */}
                    {showSpotlight && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{
                                background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColors[color]}, transparent 40%)`,
                            }}
                        />
                    )}

                    {/* Top-right glow orb */}
                    {!disableOrb && (
                        <div
                            aria-hidden
                            className={cn(
                                'pointer-events-none absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] translate-x-24 -translate-y-24 opacity-[0.04] group-hover:opacity-[0.10] transition-opacity duration-700',
                                glowColorsSolid[color],
                            )}
                        />
                    )}

                    {/* Noise texture */}
                    <NoiseOverlay />

                    {/* Content */}
                    <div className="relative z-10">{children}</div>
                </div>
            </div>
        );
    },
);
SpotlightCard.displayName = 'SpotlightCard';
