import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Aandachtspunten', href: '/analytics/aandachtspunten' },
    { label: 'Seizoensdashboard', href: '/analytics' },
    { label: 'Productie', href: '/analytics/productie' },
    { label: 'Bemesting', href: '/analytics/bemesting' },
    { label: 'Inzichten', href: '/analytics/inzichten' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
