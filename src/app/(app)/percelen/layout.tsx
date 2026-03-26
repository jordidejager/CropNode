import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Lijstweergave', href: '/percelen' },
    { label: 'Kaartweergave', href: '/percelen/kaart' },
];

export default function PercelenLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
