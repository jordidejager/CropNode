'use client';

import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Company } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Bedrijfsfilter; rendert niets zolang de teler maar één bedrijf heeft. */
export function CompanyFilter({
  companies,
  value,
  onChange,
  className,
}: {
  companies: Company[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  if (companies.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-10 w-full sm:w-[240px]', className)} aria-label="Filter op bedrijf">
        <Building2 className="h-4 w-4 mr-2 text-emerald-400 shrink-0" />
        <SelectValue placeholder="Alle bedrijven" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alle bedrijven</SelectItem>
        {companies.map(c => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}{c.isDefault ? ' (standaard)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
