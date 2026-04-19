'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedLogoProps {
  variant?: 'horizontal' | 'icon';
  size?: number;
  className?: string;
  /** Show the full animation loop (default). Set false for subtle/static use. */
  animated?: boolean;
}

/**
 * Premium animated CropNode logo — neural network with pulsing glow,
 * twinkling data dots, and data-flow pulses along connection lines.
 *
 * Renders SVG inline so framer-motion can animate individual primitives.
 */
export function AnimatedLogo({
  variant = 'horizontal',
  size,
  className,
  animated = true,
}: AnimatedLogoProps) {
  const isIcon = variant === 'icon';
  const vbWidth = isIcon ? 48 : 176;
  const vbHeight = 48;
  const defaultWidth = isIcon ? 48 : 176;
  const scale = size ? size / (isIcon ? 48 : 176) : 1;
  const renderWidth = size ?? defaultWidth;
  const renderHeight = isIcon ? renderWidth : Math.round(renderWidth * (48 / 176));

  // Main connection lines as [x1,y1,x2,y2] — same geometry as the static logo
  const connections = [
    { x1: 22.0, y1: 44.0, x2: 26.0, y2: 4.0 },   // vertical long
    { x1: 23.2, y1: 32.0, x2: 6.0, y2: 24.0 },   // to left
    { x1: 23.8, y1: 26.0, x2: 41.0, y2: 18.0 },  // to right
    { x1: 24.6, y1: 18.0, x2: 10.0, y2: 11.0 },  // to upper-left
    { x1: 25.2, y1: 12.0, x2: 36.0, y2: 7.0 },   // to upper-right
  ];

  // Main nodes [cx, cy, r]
  const mainNodes: [number, number, number][] = [
    [22.0, 44.0, 3.5], // central/bottom hub (largest)
    [26.0, 4.0, 2.0],
    [6.0, 24.0, 2.5],
    [41.0, 18.0, 2.5],
    [10.0, 11.0, 2.5],
    [36.0, 7.0, 2.5],
  ];

  // Small scattered background data points
  const backgroundDots: { cx: number; cy: number; r: number; color: string; delay: number }[] = [
    { cx: 7, cy: 4, r: 0.5, color: '#34d399', delay: 0 },
    { cx: 44, cy: 6, r: 0.7, color: '#6ee7b7', delay: 0.3 },
    { cx: 3, cy: 16, r: 0.45, color: '#10b981', delay: 0.6 },
    { cx: 46, cy: 22, r: 0.5, color: '#34d399', delay: 0.9 },
    { cx: 2, cy: 35, r: 0.4, color: '#6ee7b7', delay: 1.2 },
    { cx: 45, cy: 40, r: 0.55, color: '#10b981', delay: 1.5 },
    { cx: 14, cy: 2, r: 0.4, color: '#34d399', delay: 0.2 },
    { cx: 33, cy: 44, r: 0.5, color: '#6ee7b7', delay: 0.5 },
    { cx: 40, cy: 13, r: 0.35, color: '#34d399', delay: 0.8 },
    { cx: 9, cy: 38, r: 0.45, color: '#10b981', delay: 1.1 },
    { cx: 17, cy: 46, r: 0.4, color: '#6ee7b7', delay: 1.4 },
    { cx: 38, cy: 28, r: 0.35, color: '#34d399', delay: 1.7 },
  ];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${vbWidth} ${vbHeight}`}
      width={renderWidth}
      height={renderHeight}
      className={cn('overflow-visible', className)}
    >
      <defs>
        <radialGradient id="aLogoHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="40%" stopColor="#10b981" stopOpacity="0.14" />
          <stop offset="75%" stopColor="#10b981" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="aLogoLine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="35%" stopColor="#34d399" />
          <stop offset="70%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        <radialGradient id="aLogoDot" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="40%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>

        <radialGradient id="aLogoCore" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="35%" stopColor="#6ee7b7" />
          <stop offset="75%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </radialGradient>

        <linearGradient id="aLogoText" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d1fae5" />
        </linearGradient>

        <filter id="aLogoSoft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="aLogoCoreGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Pulsing halo */}
      <motion.circle
        cx={24}
        cy={24}
        r={24}
        fill="url(#aLogoHalo)"
        animate={animated ? { opacity: [0.65, 1, 0.65], scale: [0.95, 1.05, 0.95] } : {}}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '24px 24px' }}
      />

      {/* Background twinkling data dots */}
      <g>
        {backgroundDots.map((d, i) => (
          <motion.circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={d.color}
            animate={animated ? { opacity: [0.2, 0.85, 0.2], scale: [0.8, 1.2, 0.8] } : { opacity: 0.55 }}
            transition={animated ? { duration: 2.5 + (i % 3) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: d.delay } : undefined}
            style={{ transformOrigin: `${d.cx}px ${d.cy}px` }}
          />
        ))}
      </g>

      {/* Subtle connecting mesh lines */}
      <g opacity="0.15" stroke="#10b981" fill="none" strokeWidth="0.15">
        <line x1="7" y1="4" x2="14" y2="2" />
        <line x1="44" y1="6" x2="40" y2="13" />
        <line x1="3" y1="16" x2="2" y2="35" />
        <line x1="46" y1="22" x2="45" y2="40" />
        <line x1="38" y1="28" x2="45" y2="40" />
        <line x1="9" y1="38" x2="17" y2="46" />
      </g>

      {/* Main connection lines */}
      {connections.map((c, i) => (
        <g key={`line-${i}`}>
          {/* Base line */}
          <line
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke="url(#aLogoLine)"
            strokeWidth="2.0"
            strokeLinecap="round"
          />
          {/* Inner highlight */}
          <line
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke="#d1fae5"
            strokeWidth="0.4"
            strokeLinecap="round"
            opacity="0.5"
          />
          {/* Data flow pulse — small bright dot travels from outer node to hub */}
          {animated && (
            <motion.circle
              r={0.7}
              fill="#ecfdf5"
              animate={{
                cx: [c.x2, c.x1, c.x2],
                cy: [c.y2, c.y1, c.y2],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2.8,
                times: [0, 0.45, 0.55, 1],
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.4,
              }}
              style={{
                filter: 'drop-shadow(0 0 1.5px rgba(167,243,208,0.9))',
              }}
            />
          )}
        </g>
      ))}

      {/* Soft outer glow behind main nodes (breathing) */}
      <motion.g
        opacity={0.45}
        filter="url(#aLogoSoft)"
        animate={animated ? { opacity: [0.3, 0.65, 0.3] } : {}}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {mainNodes.map(([cx, cy, r], i) => (
          <circle key={`glow-${i}`} cx={cx} cy={cy} r={r + 2.2} fill="#10b981" />
        ))}
      </motion.g>

      {/* Main nodes with 3D gradient */}
      {mainNodes.map(([cx, cy, r], i) => {
        const isCore = i === 0; // bottom hub
        return (
          <motion.circle
            key={`node-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={isCore ? 'url(#aLogoCore)' : 'url(#aLogoDot)'}
            filter={isCore ? 'url(#aLogoCoreGlow)' : undefined}
            animate={animated ? { scale: isCore ? [1, 1.08, 1] : [1, 1.12, 1] } : {}}
            transition={{ duration: 2.4 + i * 0.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
      })}

      {/* Specular highlights */}
      {mainNodes.map(([cx, cy, r], i) => (
        <circle
          key={`shine-${i}`}
          cx={cx - r * 0.28}
          cy={cy - r * 0.28}
          r={r * 0.25}
          fill="#ecfdf5"
          opacity={i === 0 ? 0.9 : 0.7}
        />
      ))}

      {/* CropNode wordmark (horizontal variant only) */}
      {!isIcon && (
        <g fill="url(#aLogoText)">
          <path d="M391 706Q505 706 590.0 651.0Q675 596 714 495H605Q576 558 521.5 592.0Q467 626 391 626Q318 626 260.0 592.0Q202 558 169.0 495.5Q136 433 136 349Q136 266 169.0 203.5Q202 141 260.0 107.0Q318 73 391 73Q467 73 521.5 106.5Q576 140 605 203H714Q675 103 590.0 48.5Q505 -6 391 -6Q294 -6 214.5 39.5Q135 85 89.0 166.0Q43 247 43 349Q43 451 89.0 532.5Q135 614 214.5 660.0Q294 706 391 706Z" transform="translate(52.00,31.00) scale(0.021490,-0.021490)" />
          <path d="M345 558V464H321Q168 464 168 298V0H77V548H168V459Q192 506 236.5 532.0Q281 558 345 558Z" transform="translate(68.59,31.00) scale(0.021490,-0.021490)" />
          <path d="M43 275Q43 359 79.5 423.5Q116 488 179.0 522.5Q242 557 320 557Q398 557 461.0 522.5Q524 488 560.5 424.0Q597 360 597 275Q597 190 559.5 125.5Q522 61 458.0 26.0Q394 -9 316 -9Q239 -9 176.5 26.0Q114 61 78.5 125.5Q43 190 43 275ZM504 275Q504 341 478.0 387.0Q452 433 410.0 455.5Q368 478 319 478Q269 478 227.5 455.5Q186 433 161.0 387.0Q136 341 136 275Q136 208 160.5 162.0Q185 116 226.0 93.5Q267 71 316 71Q365 71 408.0 94.0Q451 117 477.5 163.0Q504 209 504 275Z" transform="translate(76.61,31.00) scale(0.021490,-0.021490)" />
          <path d="M373 557Q446 557 505.5 522.0Q565 487 599.0 423.5Q633 360 633 276Q633 193 599.0 128.0Q565 63 505.5 27.0Q446 -9 373 -9Q303 -9 249.5 22.5Q196 54 168 101V-260H77V548H168V447Q195 494 248.5 525.5Q302 557 373 557ZM354 478Q304 478 261.5 453.5Q219 429 193.5 382.5Q168 336 168 275Q168 213 193.5 166.5Q219 120 261.5 95.5Q304 71 354 71Q405 71 447.5 95.5Q490 120 515.0 166.5Q540 213 540 276Q540 338 515.0 384.0Q490 430 447.5 454.0Q405 478 354 478Z" transform="translate(90.36,31.00) scale(0.021490,-0.021490)" />
          <path d="M690 0H519L233 433V0H62V702H233L519 267V702H690Z" transform="translate(105.69,31.00) scale(0.021277,-0.021277)" />
          <path d="M28 279Q28 365 66.0 430.5Q104 496 170.0 531.0Q236 566 318 566Q400 566 466.0 531.0Q532 496 570.0 430.5Q608 365 608 279Q608 193 569.5 127.5Q531 62 464.5 27.0Q398 -8 316 -8Q234 -8 168.5 27.0Q103 62 65.5 127.0Q28 192 28 279ZM434 279Q434 346 400.5 382.0Q367 418 318 418Q268 418 235.0 382.5Q202 347 202 279Q202 212 234.5 176.0Q267 140 316 140Q365 140 399.5 176.0Q434 212 434 279Z" transform="translate(121.69,31.00) scale(0.021277,-0.021277)" />
          <path d="M274 566Q329 566 374.5 543.0Q420 520 446 481V740H617V0H446V80Q422 40 377.5 16.0Q333 -8 274 -8Q205 -8 149.0 27.5Q93 63 60.5 128.5Q28 194 28 280Q28 366 60.5 431.0Q93 496 149.0 531.0Q205 566 274 566ZM324 417Q273 417 237.5 380.5Q202 344 202 280Q202 216 237.5 178.5Q273 141 324 141Q375 141 410.5 178.0Q446 215 446 279Q446 343 410.5 380.0Q375 417 324 417Z" transform="translate(135.24,31.00) scale(0.021277,-0.021277)" />
          <path d="M585 238H198Q202 186 231.5 158.5Q261 131 304 131Q368 131 393 185H575Q561 130 524.5 86.0Q488 42 433.0 17.0Q378 -8 310 -8Q228 -8 164.0 27.0Q100 62 64.0 127.0Q28 192 28 279Q28 366 63.5 431.0Q99 496 163.0 531.0Q227 566 310 566Q391 566 454.0 532.0Q517 498 552.5 435.0Q588 372 588 288Q588 264 585 238ZM413 333Q413 377 383.0 403.0Q353 429 308 429Q265 429 235.5 404.0Q206 379 199 333Z" transform="translate(149.69,31.00) scale(0.021277,-0.021277)" />
        </g>
      )}
    </svg>
  );
}
