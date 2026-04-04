'use client';

import { PageTabs } from '@/components/layout/page-tabs';
import { FileText, Sprout, Package, Database } from 'lucide-react';

const tabs = [
    { label: 'Spuitschrift', href: '/gewasbescherming', icon: FileText },
    { label: 'Bemesting', href: '/gewasbescherming/bemesting', icon: Sprout },
    { label: 'Database', href: '/gewasbescherming/database', icon: Database },
    { label: 'Voorraad', href: '/gewasbescherming/voorraad', icon: Package },
];

export default function GewasbeschermingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
