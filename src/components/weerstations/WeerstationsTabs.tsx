'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/weerstations', label: 'Overzicht', icon: LayoutDashboard, exact: true },
  { href: '/weerstations/stations', label: 'Stations', icon: Radio, exact: false },
] as const;

/**
 * Tab strip shown above both the Weerstations station-list and the combined
 * data overview. Keeps the two views one click apart without nesting them.
 */
export function WeerstationsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
      {TABS.map(tab => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
