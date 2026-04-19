import Image from 'next/image';
import { cn } from '@/lib/utils';
import { AnimatedLogo } from './animated-logo';

type LogoVariant = 'horizontal' | 'icon' | 'stacked';
type LogoTheme = 'dark' | 'light' | 'transparent';
type LogoStyle = 'standard' | 'premium' | 'animated';

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  className?: string;
  width?: number;
  height?: number;
  /**
   * Visual style:
   * - `standard` (default): classic flat SVG from /logo/
   * - `premium`: enhanced static SVG with glow, gradients, data dots
   * - `animated`: inline React SVG with framer-motion (pulse, twinkle, data-flow)
   */
  style?: LogoStyle;
}

const logoSources: Record<LogoVariant, Record<LogoTheme, string>> = {
  horizontal: {
    dark: '/logo/cropnode-h-transparent-w.svg',
    light: '/logo/cropnode-h-transparent-d.svg',
    transparent: '/logo/cropnode-h-transparent-w.svg',
  },
  icon: {
    dark: '/logo/cropnode-icon-on-dark.svg',
    light: '/logo/cropnode-icon.svg',
    transparent: '/logo/cropnode-icon-mono-white.svg',
  },
  stacked: {
    dark: '/logo/cropnode-stacked-transparent-w.svg',
    light: '/logo/cropnode-stacked-light.svg',
    transparent: '/logo/cropnode-stacked-transparent-w.svg',
  },
};

// Premium static variants (only horizontal + icon, stacked falls back to standard)
const premiumSources: Partial<Record<LogoVariant, string>> = {
  horizontal: '/logo/cropnode-h-premium.svg',
  icon: '/logo/cropnode-icon-premium.svg',
};

const defaultSizes: Record<LogoVariant, { width: number; height: number }> = {
  horizontal: { width: 140, height: 32 },
  icon: { width: 32, height: 32 },
  stacked: { width: 160, height: 80 },
};

export function Logo({
  variant = 'horizontal',
  theme = 'dark',
  className,
  width,
  height,
  style = 'standard',
}: LogoProps) {
  // Animated variant — delegate to AnimatedLogo component
  if (style === 'animated' && variant !== 'stacked') {
    const size = width ?? defaultSizes[variant].width;
    return (
      <AnimatedLogo
        variant={variant === 'icon' ? 'icon' : 'horizontal'}
        size={size}
        className={className}
      />
    );
  }

  // Static premium variant — use enhanced SVG from /logo/
  const src = style === 'premium' && premiumSources[variant]
    ? premiumSources[variant]!
    : logoSources[variant][theme];

  const sizes = defaultSizes[variant];

  return (
    <Image
      src={src}
      alt="CropNode"
      width={width ?? sizes.width}
      height={height ?? sizes.height}
      className={cn('object-contain', className)}
      priority
    />
  );
}

export function LogoIcon({
  theme = 'dark',
  className,
  size = 32,
  style = 'standard',
}: {
  theme?: LogoTheme;
  className?: string;
  size?: number;
  style?: LogoStyle;
}) {
  return (
    <Logo
      variant="icon"
      theme={theme}
      width={size}
      height={size}
      className={className}
      style={style}
    />
  );
}
