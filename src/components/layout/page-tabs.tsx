'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface Tab {
    label: string;
    href: string;
}

interface PageTabsProps {
    tabs: Tab[];
}

export function PageTabs({ tabs }: PageTabsProps) {
    const pathname = usePathname();

    const isActive = (href: string) => {
        // Exact match for the default tab (e.g., /gewasbescherming)
        if (pathname === href) return true;
        // For non-root tabs, match prefix (e.g., /gewasbescherming/voorraad/123)
        if (href !== tabs[0]?.href && pathname.startsWith(href + '/')) return true;
        return false;
    };

    return (
        <div className="border-b border-white/[0.06] overflow-x-auto scrollbar-hide -mx-4 md:-mx-6 px-4 md:px-6">
            <nav className="flex gap-0 min-w-max" aria-label="Tabs">
                {tabs.map((tab) => (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            'px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors duration-150',
                            isActive(tab.href)
                                ? 'text-emerald-400 border-emerald-400'
                                : 'text-white/40 border-transparent hover:text-white/60'
                        )}
                    >
                        {tab.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
