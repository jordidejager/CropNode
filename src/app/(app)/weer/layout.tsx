import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Dashboard', href: '/weer' },
    { label: 'Expert Forecast', href: '/weer/forecast' },
    { label: 'Historie', href: '/weer/historie' },
];

export default function WeerLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
