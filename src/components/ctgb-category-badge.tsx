'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sprout, Bug, Ban, Tag } from 'lucide-react';

interface CtgbCategoryBadgeProps {
  category: string;
}

type CategoryConfig = {
  label: string;
  icon: React.ElementType;
  color: string;
};

const categoryMap: Record<string, CategoryConfig> = {
  'fungicide': { label: 'Fungicide', icon: Sprout, color: 'bg-amber-600 hover:bg-amber-600/80' },
  'insecticide': { label: 'Insecticide', icon: Bug, color: 'bg-red-600 hover:bg-red-600/80' },
  'herbicide': { label: 'Herbicide', icon: Ban, color: 'bg-yellow-800 hover:bg-yellow-800/80' },
  // Voeg hier meer categorieën toe indien nodig
};

const defaultCategory: CategoryConfig = {
  label: 'Overige',
  icon: Tag,
  color: 'bg-gray-500 hover:bg-gray-500/80',
};

export function CtgbCategoryBadge({ category }: CtgbCategoryBadgeProps) {
  if (!category) {
    return null;
  }

  const normalizedCategory = category.toLowerCase();
  
  // Find a key in categoryMap that is a substring of the normalizedCategory
  const matchedKey = Object.keys(categoryMap).find(key => normalizedCategory.includes(key));
  
  const config = matchedKey ? categoryMap[matchedKey] : defaultCategory;
  const Icon = config.icon;

  return (
    <Badge className={cn('flex w-fit items-center gap-1.5 text-primary-foreground', config.color)}>
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );
}
