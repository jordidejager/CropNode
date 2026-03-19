import { cn } from '@/lib/utils';
import type { SprayableParcel } from '@/lib/supabase-store';

/**
 * Detects which crop types are present in a list of parcels.
 */
function detectCrops(parcels: SprayableParcel[]): { hasApple: boolean; hasPear: boolean } {
  let hasApple = false;
  let hasPear = false;

  for (const p of parcels) {
    const crop = (p.crop || '').toLowerCase();
    if (crop === 'appel' || crop === 'apple') hasApple = true;
    if (crop === 'peer' || crop === 'pear') hasPear = true;
  }

  return { hasApple, hasPear };
}

/**
 * Inline SVG apple icon — subtle, minimalist line art style.
 */
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Apple body */}
      <path d="M12 20.5c-4.5 0-7-3.5-7-7.5 0-3 1.5-5 3.5-6 1-.5 2.2-.5 3.5 0 1.3-.5 2.5-.5 3.5 0 2 1 3.5 3 3.5 6 0 4-2.5 7.5-7 7.5Z" />
      {/* Stem */}
      <path d="M12 7V4" />
      {/* Leaf */}
      <path d="M12 5c1.5-1.5 3.5-1.5 4.5-.5" />
    </svg>
  );
}

/**
 * Inline SVG pear icon — subtle, minimalist line art style.
 */
function PearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Pear body — narrow top, wide bottom */}
      <path d="M12 20.5c-4 0-6.5-3-6.5-6.5 0-2.5 1.2-4.5 3-5.5.8-.5 1.5-1.5 2-3 .2-.7.5-1.2 1.5-1.2s1.3.5 1.5 1.2c.5 1.5 1.2 2.5 2 3 1.8 1 3 3 3 5.5 0 3.5-2.5 6.5-6.5 6.5Z" />
      {/* Stem */}
      <path d="M12 5.3V3.5" />
      {/* Leaf */}
      <path d="M12 4.5c1.2-1.2 3-1.2 4-.3" />
    </svg>
  );
}

interface CropIconProps {
  parcels: SprayableParcel[];
  className?: string;
}

/**
 * Displays a subtle crop icon (apple, pear, or both) based on the crops
 * in the given parcel list. Returns null if no apple/pear detected.
 */
export function CropIcon({ parcels, className }: CropIconProps) {
  const { hasApple, hasPear } = detectCrops(parcels);

  if (!hasApple && !hasPear) return null;

  return (
    <div className={cn('flex items-center gap-0.5 opacity-60', className)}>
      {hasApple && (
        <AppleIcon className="h-5 w-5 text-red-400 dark:text-red-400/90" />
      )}
      {hasPear && (
        <PearIcon className="h-5 w-5 text-green-500 dark:text-green-400/90" />
      )}
    </div>
  );
}
