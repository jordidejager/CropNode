import * as React from 'react';
import { cn } from '@/lib/utils';
import { glowColorsSolid, type PaletteColor } from './palette';

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';

const positionClasses: Record<Position, string> = {
    'top-right': 'top-0 right-0 translate-x-24 -translate-y-24',
    'top-left': 'top-0 left-0 -translate-x-24 -translate-y-24',
    'bottom-right': 'bottom-0 right-0 translate-x-24 translate-y-24',
    'bottom-left': 'bottom-0 left-0 -translate-x-24 translate-y-24',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
};

/**
 * Blurred gradient orb — landing hero/feature-bento decorative element.
 * Use as background behind cards or sections. Decorative (aria-hidden).
 *
 * @param color      One of the 11 palette colors
 * @param position   Placement corner or center
 * @param size       Tailwind size class (default w-48 h-48)
 * @param blur       Blur radius (default blur-[80px])
 * @param opacity    Rest opacity (default 0.04)
 * @param hoverOpacity  Opacity when group-hover — set to 0 to disable
 */
export function GlowOrb({
    color,
    position = 'top-right',
    size = 'w-48 h-48',
    blur = 'blur-[80px]',
    opacity = 0.04,
    hoverOpacity = 0.1,
    className,
}: {
    color: PaletteColor;
    position?: Position;
    size?: string;
    blur?: string;
    opacity?: number;
    hoverOpacity?: number;
    className?: string;
}) {
    return (
        <div
            aria-hidden
            className={cn(
                'pointer-events-none absolute rounded-full transition-opacity duration-700',
                size,
                blur,
                positionClasses[position],
                glowColorsSolid[color],
                className,
            )}
            style={{
                opacity,
                ['--hover-opacity' as string]: hoverOpacity,
            }}
            data-hover-opacity={hoverOpacity}
        />
    );
}
