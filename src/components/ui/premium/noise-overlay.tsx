import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Subtle noise texture overlay — copied from landing feature-bento.
 * Uses SVG feTurbulence for Perlin-noise effect. Positioned absolute,
 * opacity 1.5%, mix-blend-overlay. Decorative — pointer-events disabled.
 */
export function NoiseOverlay({ className, opacity = 0.015 }: { className?: string; opacity?: number }) {
    return (
        <div
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 mix-blend-overlay', className)}
            style={{
                opacity,
                backgroundImage:
                    'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
            }}
        />
    );
}
