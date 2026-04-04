'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface Tab {
    label: string;
    href: string;
    icon?: LucideIcon;
}

interface PageTabsProps {
    tabs: Tab[];
}

export function PageTabs({ tabs }: PageTabsProps) {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (pathname === href) return true;
        if (href !== tabs[0]?.href && pathname.startsWith(href + '/')) return true;
        return false;
    };

    return (
        <div className="overflow-x-auto scrollbar-hide -mx-4 md:-mx-6 px-4 md:px-6 border-b border-white/[0.06]">
            <nav className="flex gap-1 min-w-max" aria-label="Tabs">
                {tabs.map((tab) => {
                    const active = isActive(tab.href);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                'flex items-center gap-2.5 px-5 py-3.5 text-[15px] font-semibold whitespace-nowrap rounded-t-xl border-b-[3px] transition-all duration-150',
                                active
                                    ? 'text-emerald-400 border-emerald-400 bg-emerald-500/[0.07]'
                                    : 'text-white/40 border-transparent hover:text-white/70 hover:bg-white/[0.04]'
                            )}
                        >
                            {Icon && <Icon className={cn('h-[18px] w-[18px]', active ? 'text-emerald-400' : 'text-white/30')} />}
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
