import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Spuitschrift', href: '/gewasbescherming' },
    { label: 'Bemesting', href: '/gewasbescherming/bemesting' },
    { label: 'Voorraad', href: '/gewasbescherming/voorraad' },
    { label: 'Mijn Producten', href: '/gewasbescherming/producten' },
    { label: 'Database', href: '/gewasbescherming/database' },
    { label: 'Db Meststoffen', href: '/gewasbescherming/database-meststoffen' },
];

export default function GewasbeschermingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
