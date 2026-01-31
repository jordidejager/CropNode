'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Droplets, Bug, Sprout, TrendingUp, HelpCircle, Archive, AlertTriangle } from 'lucide-react';

interface CtgbCategoryBadgeProps {
  category?: string;
  productTypes?: string[];
}

type CategoryConfig = {
  label: string;
  icon: React.ElementType;
  className: string;
};

const categoryMap: Record<string, CategoryConfig> = {
  'fungicide': {
    label: 'Fungicide',
    icon: Droplets,
    className: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  },
  'insecticide': {
    label: 'Insecticide',
    icon: Bug,
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  },
  'herbicide': {
    label: 'Herbicide',
    icon: Sprout,
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  },
  'groeiregulator': {
    label: 'Groeiregulator',
    icon: TrendingUp,
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  },
  'molluscicide': {
    label: 'Molluscicide',
    icon: Bug,
    className: 'bg-pink-500/10 text-pink-400 border-pink-500/20'
  },
  'acaricide': {
    label: 'Acaricide',
    icon: AlertTriangle,
    className: 'bg-red-500/10 text-red-400 border-red-500/20'
  },
  'kiemrem': {
    label: 'Kiemremming',
    icon: Archive,
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
  },
};

const defaultCategory: CategoryConfig = {
  label: 'Overige',
  icon: HelpCircle,
  className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export function CtgbCategoryBadge({ category, productTypes }: CtgbCategoryBadgeProps) {
  // Prioritize productTypes if available
  const primaryType = productTypes && productTypes.length > 0 ? productTypes[0] : category;

  if (!primaryType) {
    return null;
  }

  const normalizedType = primaryType.toLowerCase();

  // Find a key in categoryMap that is a substring of the normalizedType
  const matchedKey = Object.keys(categoryMap).find(key => normalizedType.includes(key));

  const config = matchedKey ? categoryMap[matchedKey] : defaultCategory;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase whitespace-nowrap', config.className)}>
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );
}
