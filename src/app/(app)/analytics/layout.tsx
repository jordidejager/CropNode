import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Seizoensdashboard', href: '/analytics' },
    { label: 'Productie', href: '/analytics/productie' },
    { label: 'Ziektedruk', href: '/analytics/ziektedruk' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
