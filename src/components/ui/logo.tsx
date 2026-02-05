import Image from 'next/image';
import { cn } from '@/lib/utils';

type LogoVariant = 'horizontal' | 'icon' | 'stacked';
type LogoTheme = 'dark' | 'light' | 'transparent';

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  className?: string;
  width?: number;
  height?: number;
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
}: LogoProps) {
  const src = logoSources[variant][theme];
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
}: {
  theme?: LogoTheme;
  className?: string;
  size?: number;
}) {
  return (
    <Logo
      variant="icon"
      theme={theme}
      width={size}
      height={size}
      className={className}
    />
  );
}
