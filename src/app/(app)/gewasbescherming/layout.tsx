'use client';

import { PageTabs } from '@/components/layout/page-tabs';
import { FileText, Sprout, Package, Database, Inbox } from 'lucide-react';
import { useSprayInboxCount } from '@/hooks/use-data';

export default function GewasbeschermingLayout({ children }: { children: React.ReactNode }) {
    const { data: inboxCount = 0 } = useSprayInboxCount();

    const tabs = [
        { label: 'Spuitschrift', href: '/gewasbescherming', icon: FileText },
        { label: inboxCount > 0 ? `Inbox (${inboxCount})` : 'Inbox', href: '/gewasbescherming/inbox', icon: Inbox },
        { label: 'Bemesting', href: '/gewasbescherming/bemesting', icon: Sprout },
        { label: 'Database', href: '/gewasbescherming/database', icon: Database },
        { label: 'Voorraad', href: '/gewasbescherming/voorraad', icon: Package },
    ];

    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
