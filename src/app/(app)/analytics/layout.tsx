import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Aandachtspunten', href: '/analytics/aandachtspunten' },
    { label: 'Perceeldiagnose', href: '/analytics/perceel' },
    { label: 'Rendement', href: '/analytics/rendement' },
    { label: 'Operationeel', href: '/analytics/operations' },
    { label: 'Bemesting', href: '/analytics/bemesting' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
